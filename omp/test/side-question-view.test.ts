import { beforeAll, expect, spyOn, test } from "bun:test";
import { initTheme, Settings, type ExtensionUiHost } from "@oh-my-pi/pi-coding-agent";
import { setNativeRenderingForTest } from "@oh-my-pi/pi-tui";
import { btwPanel } from "../extensions/btw-panel";
import type { SideQuestionCallbacks } from "../extensions/side-question";
import { answerInto, newTurn, turnNode } from "../extensions/side-question-view";
import { allNodes, nodeTree } from "./support";

beforeAll(async () => {
	await Settings.init({ inMemory: true });
	initTheme();
});

test("Tern renders the first question in the native note heading with a fold control", () => {
	setNativeRenderingForTest(true);
	try {
		const ui: ExtensionUiHost = { requestRender() {}, size: () => ({ rows: 100, columns: 160 }), suspend: run => run() };
		const turns = [newTurn("What changed?\nDoes it affect my draft?")];
		const nodes = nodeTree(btwPanel(ui, () => ({ turns, toolsOpen: false, revision: 0 })));
		expect(nodes[0]?.p.role).toBe("omp.btw.note");
		const heading = nodes[0]?.c.find(node => node.p.role === "omp.btw.note.head");
		expect(heading?.c.find(node => node.p.role === "omp.btw.note.tag")?.p.spans).toEqual([{ s: "accent", t: "btw" }]);
		expect(heading?.c.find(node => node.p.role === "omp.btw.note.question")?.p).toMatchObject({
			lines: 2,
			spans: [{ t: "What changed? Does it affect my draft?" }],
		});
		expect(allNodes(heading?.c ?? []).find(node => String(node.p.title).startsWith("Fold to one line"))?.p.actions).toEqual({
			click: "btw-fold",
		});
		expect(nodes[0]?.c.find(node => node.p.role === "omp.btw.note.status")?.p.spans).toContainEqual({
			s: "accent", t: " Answering",
		});
	} finally {
		setNativeRenderingForTest(false);
	}
});

function pendingAnswer() {
	const turn = newTurn("Why is this request waiting?");
	let callbacks!: SideQuestionCallbacks;
	let resolve!: (answer: string) => void;
	const done = answerInto(turn, on => {
		callbacks = on;
		return new Promise<string>(finish => { resolve = finish; });
	}, () => {});
	return { turn, callbacks, done, resolve };
}

const shown = (turn: ReturnType<typeof newTurn>) => JSON.stringify(nodeTree(turnNode(turn, 0, false)));

test("the turn view labels an answer that is still running", () => {
	expect(shown(newTurn("What changed?"))).toContain("Waiting for response…");
});

test("a retry countdown is visible and ends when the next request starts", async () => {
	const clock = spyOn(Date, "now").mockReturnValue(10_000);
	const pending = pendingAnswer();
	try {
		pending.callbacks.onRecovery({
			type: "auto_retry_start", attempt: 2, maxAttempts: 10, delayMs: 8_000, errorMessage: "overloaded",
		});
		expect(shown(pending.turn)).toMatch(/2\/10.*8(?:\.0)?s/);
		expect(allNodes(nodeTree(turnNode(pending.turn, 0, false))).find(node => node.k === "section")?.p.collapsed).toBe(true);
		clock.mockReturnValue(15_000);
		expect(shown(pending.turn)).toMatch(/2\/10.*3(?:\.0)?s/);
		pending.callbacks.onMessageStart();
		expect(shown(pending.turn)).not.toContain("Retrying");
		pending.resolve("Recovered.");
		await pending.done;
		expect(shown(pending.turn)).toContain("Recovered.");
	} finally {
		pending.resolve("");
		await pending.done;
		clock.mockRestore();
	}
});

test("a model switch stays between the failed request and the fallback answer", async () => {
	const pending = pendingAnswer();
	pending.callbacks.onMessageStart();
	pending.callbacks.onText("Checking.");
	pending.callbacks.onRecovery({
		type: "retry_fallback_applied", from: "provider/primary", to: "provider/backup", role: "smol",
	});
	pending.callbacks.onMessageStart();
	pending.callbacks.onText("Recovered on backup.");
	pending.resolve("Recovered on backup.");
	await pending.done;
	const text = shown(pending.turn);
	expect(text.indexOf("Checking.")).toBeLessThan(text.indexOf("provider/primary -> provider/backup"));
	expect(text.indexOf("provider/primary -> provider/backup")).toBeLessThan(text.indexOf("Recovered on backup."));
});

test("exhausted recovery reports the attempt count and final failure", async () => {
	const turn = newTurn("q");
	await answerInto(turn, async on => {
		on.onRecovery({ type: "auto_retry_end", success: false, attempt: 3, finalError: "quota exhausted" });
		throw new Error("quota exhausted");
	}, () => {});
	expect(turn.status).toBe("error");
	expect(shown(turn)).toMatch(/3 attempts.*quota exhausted/);
});

test("a cache miss keeps its token label in the turn and folds its details", async () => {
	const turn = newTurn("q");
	await answerInto(turn, async on => {
		on.onCacheMiss(4_096);
		return "The answer.";
	}, () => {});
	const collapsed = allNodes(nodeTree(turnNode(turn, 0, false))).find(node => node.k === "section");
	expect(collapsed?.p.collapsed).toBe(true);
	expect(collapsed?.p.head[0].t).toContain("cache miss · 4.1K tokens");
	const expanded = allNodes(nodeTree(turnNode(turn, 0, true))).find(node => node.k === "section");
	expect(expanded?.p.collapsed).toBe(false);
	expect(expanded?.c[0]?.p.spans[0].t).toContain("wrote these prompt tokens to the cache again");
});

test("late recovery events cannot add notices to a cancelled turn", async () => {
	const pending = pendingAnswer();
	pending.turn.status = "cancelled";
	pending.callbacks.onRecovery({
		type: "retry_fallback_applied", from: "provider/primary", to: "provider/backup", role: "smol",
	});
	pending.resolve("Too late.");
	await pending.done;
	expect(pending.turn.parts).toEqual([]);
	expect(shown(pending.turn)).not.toContain("Too late.");
});
