import { beforeAll, describe, expect, test } from "bun:test";
import { type ExtensionAPI, type ExtensionContext, type ExtensionEvent, type ExtensionUiHost, getKeybindings, initTheme, KeybindingsManager, setKeybindings, Settings } from "@oh-my-pi/pi-coding-agent";
import type { KeyEvent, UiNode } from "@oh-my-pi/pi-tui";
import btw, { parseBtwQuestion } from "../extensions/btw";
import { sideQuestionFixture } from "./helpers/side-question-session";
import { allNodes, nodeTree } from "./support";

beforeAll(async () => {
	await Settings.init({ inMemory: true });
	initTheme();
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

test("the /btw panel leaves Escape to omp's ask dialog and folds tool calls on t from the empty composer", async () => {
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
	const t = () => composerKey!({ id: "t", kind: "press", raw: "t", text: "t" });
	const ask = (type: "tool_execution_start" | "tool_execution_end") =>
		handlers.get(type)!({ type, toolCallId: "ask-1", toolName: "ask", args: {}, result: undefined, isError: false } as ExtensionEvent, ctx);
	const render = () => (panel ? JSON.stringify(nodeTree(panel)) : undefined);
	const toolsFolded = () => allNodes(nodeTree(panel!)).find(node => node.k === "section")?.p.collapsed;
	try {
		await Bun.write(`${fixture.ctx.cwd}/fold-fixture.txt`, "file contents for the read call");
		expect(handlers.get("input")!({ type: "input", text: "/btw read the fixture", source: "interactive" }, ctx))
			.toEqual({ handled: true });
		const deadline = Date.now() + 5_000;
		while (!render()?.includes("to close") && Date.now() < deadline) await Bun.sleep(20);
		expect(render()).toContain("1 tool call");
		expect(render()).toContain("to show tool calls");
		expect(toolsFolded()).toBe(true);

		ask("tool_execution_start");
		expect(key("\x1b")).toBeUndefined();
		ask("tool_execution_end");
		draft = "unsent composer text";
		expect(t()).toBe(false);
		expect(key("\x1b")).toBeUndefined();
		expect(toolsFolded()).toBe(true);

		draft = "";
		expect(t()).toBe(true);
		expect(toolsFolded()).toBe(false);
		expect(render()).toContain("to fold tool calls");
		expect(t()).toBe(true);
		expect(toolsFolded()).toBe(true);
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
		handlers.get("session_shutdown")?.({ type: "session_shutdown" }, ctx);
		await fixture.dispose();
	}
}, 30_000);
