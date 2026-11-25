import { expect, spyOn, test } from "bun:test";
import type { SideQuestionCallbacks } from "../extensions/side-question";
import { answerInto, newTurn, turnNode } from "../extensions/side-question-view";
import { nodeTree } from "./support";

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
	expect(shown(newTurn("What changed?"))).toContain("Answering…");
});

test("a retry countdown is visible and ends when the next request starts", async () => {
	const clock = spyOn(Date, "now").mockReturnValue(10_000);
	const pending = pendingAnswer();
	try {
		pending.callbacks.onRecovery({
			type: "auto_retry_start", attempt: 2, maxAttempts: 10, delayMs: 8_000, errorMessage: "overloaded",
		});
		expect(shown(pending.turn)).toMatch(/2\/10.*8(?:\.0)?s/);
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

test("late recovery events cannot add notices to a cancelled turn", async () => {
	const pending = pendingAnswer();
	pending.turn.status = "cancelled";
	pending.callbacks.onRecovery({
		type: "retry_fallback_applied", from: "provider/primary", to: "provider/backup", role: "smol",
	});
	pending.resolve("Too late.");
	await pending.done;
	expect(pending.turn.parts).toEqual([]);
	expect(shown(pending.turn)).toContain("Cancelled");
});
