import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { type ExtensionAPI, type ExtensionContext, type ExtensionEvent, type ExtensionUiHost, formatKeyHint, getKeybindings, initTheme, KeybindingsManager, setKeybindings, Settings } from "@oh-my-pi/pi-coding-agent";
import * as clipboard from "@oh-my-pi/pi-coding-agent/utils/clipboard";
import { createRoot, type KeyEvent, setNativeRenderingForTest, signal, type UiNode } from "@oh-my-pi/pi-tui";
import "@oh-my-pi/pi-tui/term/widgets";
import { paintNode, staticEnvironment } from "@oh-my-pi/pi-tui/term/paint";
import { SPINNER_INTERVAL_MS } from "@oh-my-pi/pi-tui/term/painters/spinner";
import { currentTheme } from "@oh-my-pi/pi-tui/theme/runtime";
import btw, { askBtw, cancelBtw, handleAskBtwKey, holdAskBtwFocus, parseBtwQuestion } from "../extensions/btw";
import { btwPanel } from "../extensions/btw-panel";
import { newTurn } from "../extensions/side-question-view";
import { sideQuestionFixture } from "./helpers/side-question-session";
import { allNodes, encodePng, nodeTree } from "./support";

beforeAll(async () => {
	await Settings.init({ inMemory: true });
	initTheme();
});

test("the classic /btw box paints the native spinner in the title until the answer settles", () => {
	createRoot(dispose => {
		try {
			const ui: ExtensionUiHost = { requestRender() {}, size: () => ({ rows: 40, columns: 100 }), suspend: run => run() };
			const turn = newTurn("What changed?");
			const revision = signal(0);
			const panel = btwPanel(ui, () => ({ turns: [turn], toolsOpen: false, revision: revision() }));
			const clock = signal(0);
			const motion = signal(false);
			const env = { ...staticEnvironment(currentTheme()), clock, reduceMotion: motion };
			const title = () => Bun.stripANSI(paintNode(env, panel, 100).rows[0]!);
			const [first, second] = currentTheme().symbols.spinnerFrames;
			expect(title()).toContain(`${first} /btw What changed?`);
			clock.set(SPINNER_INTERVAL_MS);
			expect(title()).toContain(`${second} /btw What changed?`);
			motion.set(true);
			expect(title()).toContain(`${first} /btw What changed?`);
			turn.status = "complete";
			revision.set(1);
			expect(title()).toContain("/btw What changed?");
			expect(title()).not.toContain(`${first} /btw`);
			expect(title()).not.toContain(`${second} /btw`);
		} finally {
			dispose();
		}
	});
});

describe("parseBtwQuestion", () => {
	test("takes the question after /btw", () => {
		expect(parseBtwQuestion("/btw why is the picker slow?")).toBe("why is the picker slow?");
	});

	test("keeps every line of a multi-line question", () => {
		expect(parseBtwQuestion("/btw   first line\nsecond line  ")).toBe("first line\nsecond line");
	});

	test("takes a question that starts on the next line", () => {
		expect(parseBtwQuestion("/btw\nwhat changed?")).toBe("what changed?");
	});

	test("leaves bare /btw to native /btw, which opens its history", () => {
		expect(parseBtwQuestion("/btw")).toBeUndefined();
		expect(parseBtwQuestion("/btw   ")).toBeUndefined();
		expect(parseBtwQuestion("/btw why")).toBe("why");
	});

	test("leaves other commands and plain messages alone", () => {
		expect(parseBtwQuestion("/btwx why")).toBeUndefined();
		expect(parseBtwQuestion("/bt why")).toBeUndefined();
		expect(parseBtwQuestion("btw why")).toBeUndefined();
		expect(parseBtwQuestion(" /btw why")).toBeUndefined();
		expect(parseBtwQuestion("/btw why")).toBe("why");
	});
});

test("the Side question keys preserve Ask and composer input, and copy and fold the panel", async () => {
	const fixture = await sideQuestionFixture({
		toolCalls: body => body.messages.at(-1)?.role === "user"
			? [["call_read", "read", { path: "fold-fixture.txt" }]]
			: undefined,
	});
	const handlers = new Map<string, (event: ExtensionEvent, ctx: ExtensionContext) => unknown>();
	btw({ on(event: string, handler: (event: ExtensionEvent, ctx: ExtensionContext) => unknown) { handlers.set(event, handler); } } as ExtensionAPI);
	let draft = "";
	let panel: UiNode | undefined;
	let terminalInput: Parameters<ExtensionContext["ui"]["onTerminalInput"]>[0] | undefined;
	let composerKey: ((key: KeyEvent) => boolean) | undefined;
	const ui: ExtensionUiHost = { requestRender() {}, size: () => ({ rows: 100, columns: 160 }), suspend: run => run() };
	const ctx = {
		...fixture.ctx,
		mode: "tui", hasUI: true,
		ui: {
			onTerminalInput: (listener: typeof terminalInput) => { terminalInput = listener; return () => {}; },
			composer: { addKeyHandler: (handler: (key: KeyEvent) => boolean) => { composerKey = handler; return () => {}; } },
			getEditorText: () => draft,
			setWidget: (_key: string, factory: ((ui: ExtensionUiHost, theme: never) => UiNode) | undefined) => {
				panel = factory?.(ui, {} as never);
			},
		},
	} as unknown as ExtensionContext;
	const key = (data: string) => terminalInput!(data);
	const press = (id: string) => composerKey!({ id, kind: "press", raw: id, text: id });
	const ask = (type: "tool_execution_start" | "tool_execution_end") =>
		handlers.get(type)!({ type, toolCallId: "ask-1", toolName: "ask", args: {}, result: undefined, isError: false } as ExtensionEvent, ctx);
	const render = () => (panel ? JSON.stringify(nodeTree(panel)) : undefined);
	const toolsFolded = () => allNodes(nodeTree(panel!)).find(node => node.k === "section")?.p.collapsed;
	const painted = () => createRoot(dispose => {
		try {
			return paintNode(staticEnvironment(currentTheme()), panel!, 160).rows.map(row => Bun.stripANSI(row)).join("\n");
		} finally {
			dispose();
		}
	});
	const copy = spyOn(clipboard, "copyToClipboard").mockResolvedValue(undefined);
	try {
		await Bun.write(`${fixture.ctx.cwd}/fold-fixture.txt`, "file contents for the read call");
		expect(handlers.get("input")!({ type: "input", text: "/btw read the fixture", source: "interactive" }, ctx))
			.toEqual({ handled: true });
		const deadline = Date.now() + 5_000;
		while (!render()?.includes("to close") && Date.now() < deadline) await Bun.sleep(20);
		expect(render()).toContain("1 tool call");
		expect(render()).toContain("to show details");
		expect(toolsFolded()).toBe(true);

		expect(handleAskBtwKey(ctx, "f8")).toBe(false);
		ask("tool_execution_start");
		const releaseAsk = holdAskBtwFocus(ctx);
		try {
			expect(painted()).toContain(`${formatKeyHint("f7")} to copy`);
			expect(painted()).toContain(`${formatKeyHint("f8")} to fold`);
			expect(painted()).toContain(`${formatKeyHint("f9")} to show details`);
			expect(painted()).not.toContain("to close");
			for (const id of ["c", "f", "t"]) expect(handleAskBtwKey(ctx, id)).toBe(false);
			expect(handleAskBtwKey(ctx, "f9")).toBe(true);
			expect(toolsFolded()).toBe(false);
			expect(painted()).toContain(`${formatKeyHint("f9")} to fold details`);
			expect(handleAskBtwKey(ctx, "f9")).toBe(true);
			expect(toolsFolded()).toBe(true);
			expect(handleAskBtwKey(ctx, "f7")).toBe(true);
			expect(copy).toHaveBeenCalledWith("answered by main");
			expect(handleAskBtwKey(ctx, "f8")).toBe(true);
			expect(painted()).toContain(`${formatKeyHint("f8")} to unfold`);
			expect(painted()).not.toContain("answered by main");
			expect(handleAskBtwKey(ctx, "f7")).toBe(false);
			expect(handleAskBtwKey(ctx, "f9")).toBe(false);
			expect(handleAskBtwKey(ctx, "f8")).toBe(true);
			expect(painted()).toContain("answered by main");
		} finally {
			releaseAsk();
		}
		expect(handleAskBtwKey(ctx, "f8")).toBe(false);
		expect(key("\x1b")).toBeUndefined();
		expect(press("f")).toBe(false);
		expect(press("c")).toBe(false);
		ask("tool_execution_end");
		expect(painted()).toContain(`${formatKeyHint("f")} to fold`);
		expect(painted()).not.toContain(`${formatKeyHint("f8")} to fold`);
		draft = "unsent composer text";
		expect(press("t")).toBe(false);
		expect(press("f")).toBe(false);
		expect(press("c")).toBe(false);
		expect(key("\x1b")).toBeUndefined();
		expect(toolsFolded()).toBe(true);

		draft = "";
		expect(press("t")).toBe(true);
		expect(toolsFolded()).toBe(false);
		expect(render()).toContain("to fold details");
		expect(press("t")).toBe(true);
		expect(toolsFolded()).toBe(true);
		expect(press("c")).toBe(true);
		expect(copy).toHaveBeenCalledWith("answered by main");
		expect(press("f")).toBe(true);
		expect(render()).toContain("f to unfold");
		expect(render()).not.toContain("answered by main");
		expect(press("f")).toBe(true);
		expect(render()).toContain("answered by main");

		setNativeRenderingForTest(true);
		try {
			const findNode = (node: UiNode, match: (candidate: UiNode) => boolean): UiNode | undefined => {
				if (match(node)) return node;
				for (const child of node.children()) {
					const found = findNode(child, match);
					if (found) return found;
				}
			};
			const click = (act: string) => {
				const control = findNode(panel!, node => (node.props().actions?.click ?? "") === act);
				expect(control).toBeDefined();
				control!.handlers.onAction!(act, { type: "action", key: "test", act, mods: [] });
			};
			click("btw-copy");
			expect(copy).toHaveBeenCalledTimes(3);
			click("btw-fold");
			expect(render()).toContain("omp.btw.note.folded");
			expect(render()).not.toContain("answered by main");
			click("btw-expand");
			expect(render()).toContain("answered by main");
		} finally {
			setNativeRenderingForTest(false);
		}
		expect(key("\x1b")).toEqual({ consume: true });
		expect(render()).toBeUndefined();

		const keymap = getKeybindings();
		const reopen = async () => {
			handlers.get("input")!({ type: "input", text: "/btw read the fixture again", source: "interactive" }, ctx);
			const until = Date.now() + 5_000;
			while (!render()?.includes("to close") && Date.now() < until) await Bun.sleep(20);
		};
		try {
			setKeybindings(KeybindingsManager.inMemory({ "app.interrupt": ["ctrl+c", "ctrl+x"] }));
			await reopen();
			expect(key("\x1b")).toBeUndefined();
			expect(key("\x03")).toBeUndefined();
			expect(render()).toContain("to close");
			expect(key("\x18")).toEqual({ consume: true });
			expect(render()).toBeUndefined();

			setKeybindings(KeybindingsManager.inMemory({ "app.interrupt": [] }));
			await reopen();
			expect(key("\x1b")).toEqual({ consume: true });
			expect(render()).toBeUndefined();
		} finally {
			setKeybindings(keymap);
		}
	} finally {
		copy.mockRestore();
		handlers.get("session_shutdown")?.({ type: "session_shutdown" }, ctx);
		await fixture.dispose();
	}
}, 30_000);

test("Ask and composer share one Side question thread without retaining unsent draft text or pictures", async () => {
	const fixture = await sideQuestionFixture({ reply: body => `Side answer ${body.messages.filter((item: { role: string }) => item.role === "user").length}.` });
	const handlers = new Map<string, (event: ExtensionEvent, ctx: ExtensionContext) => unknown>();
	btw({ on(event: string, handler: (event: ExtensionEvent, ctx: ExtensionContext) => unknown) { handlers.set(event, handler); } } as ExtensionAPI);
	let panel: UiNode | undefined;
	let terminalInput: Parameters<ExtensionContext["ui"]["onTerminalInput"]>[0] | undefined;
	const ui: ExtensionUiHost = { requestRender() {}, size: () => ({ rows: 100, columns: 160 }), suspend: run => run() };
	const ctx = {
		...fixture.ctx,
		mode: "tui", hasUI: true,
		ui: {
			...fixture.ctx.ui,
			onTerminalInput: (listener: typeof terminalInput) => { terminalInput = listener; return () => {}; },
			getEditorText: () => "",
			setWidget: (_key: string, factory: ((ui: ExtensionUiHost, theme: never) => UiNode) | undefined) => {
				panel = factory?.(ui, {} as never);
			},
		},
	} as unknown as ExtensionContext;
	const shown = () => JSON.stringify(nodeTree(panel));
	const submit = (text: string) => handlers.get("input")!({ type: "input", text, source: "interactive" }, ctx);
	const settled = async (text: string) => {
		const until = Date.now() + 5_000;
		while (!shown().includes(text) && Date.now() < until) await Bun.sleep(20);
		expect(shown()).toContain(text);
	};
	try {
		handlers.get("session_start")!({ type: "session_start" } as ExtensionEvent, ctx);
		const draft = "Unsaved General note: prefer the purple choice.";
		const picture = { type: "image" as const, mimeType: "image/png", data: Buffer.from(encodePng(8, 8, () => [127, 30, 240, 255])).toString("base64") };
		expect(askBtw({ ...ctx }, "What's wrong with this choice?", draft, [picture])).toBe(true);
		await settled("to close");
		expect(shown()).not.toContain(draft);
		expect(JSON.stringify(fixture.requests[0])).toContain(draft);
		expect(JSON.stringify(fixture.requests[0])).toContain("image_url");
		expect(submit("/btw ask a follow-up")).toEqual({ handled: true });
		await settled("to close");
		const followUp = JSON.stringify(fixture.requests[1]);
		expect(followUp).toContain("What's wrong with this choice?");
		expect(followUp).toContain("Side answer");
		expect(followUp).not.toContain(draft);
		expect(followUp).not.toContain("image_url");
		expect(JSON.stringify(fixture.main.sessionManager.getBranch())).not.toContain(draft);

		handlers.get("before_agent_start")!({ type: "before_agent_start" } as ExtensionEvent, ctx);
		expect(shown()).toBe("[]");
		expect(submit("/btw a fresh question")).toEqual({ handled: true });
		await settled("to close");
		expect(JSON.stringify(fixture.requests[2])).not.toContain("ask a follow-up");

		handlers.get("tool_execution_start")!({ type: "tool_execution_start", toolName: "ask", toolCallId: "ask-1" } as ExtensionEvent, ctx);
		expect(askBtw(ctx, "Cancel just the Side question.", draft)).toBe(true);
		expect(askBtw(ctx, "An overlapping question.", draft)).toBe(true);
		expect(fixture.warnings).toEqual(["Wait for the side question's answer, or press Ctrl+Esc to cancel it."]);
		expect(shown()).not.toContain("An overlapping question.");
		expect(shown()).toContain("to cancel side question");
		expect(terminalInput!("\x1b")).toBeUndefined();
		expect(terminalInput!("\x1b[27;5u")).toEqual({ consume: true });
		expect(shown()).toContain("Cancelled");
		expect(cancelBtw(ctx)).toBe(false);
	} finally {
		handlers.get("session_shutdown")?.({ type: "session_shutdown" }, ctx);
		await fixture.dispose();
	}
}, 30_000);
