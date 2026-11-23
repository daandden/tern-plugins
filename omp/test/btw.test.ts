import { beforeAll, describe, expect, test } from "bun:test";
import { Settings, type ExtensionAPI, type ExtensionContext, type ExtensionEvent } from "@oh-my-pi/pi-coding-agent";
import type { Component, TUI } from "@oh-my-pi/pi-tui";
import { initTheme } from "@oh-my-pi/pi-tui/theme";
import btw, { parseBtwQuestion } from "../extensions/btw";
import { sideQuestionFixture } from "./helpers/side-question-session";

beforeAll(async () => {
	await Settings.init({ inMemory: true });
	await initTheme();
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

test("the /btw tool fold and Esc respond only to the focused, empty composer", async () => {
	const fixture = await sideQuestionFixture({
		toolCalls: body => body.messages.at(-1)?.role === "user"
			? [["call_read", "read", { path: "fold-fixture.txt" }]]
			: undefined,
	});
	const handlers = new Map<string, (event: ExtensionEvent, ctx: ExtensionContext) => unknown>();
	btw({ on(event: string, handler: (event: ExtensionEvent, ctx: ExtensionContext) => unknown) { handlers.set(event, handler); } } as ExtensionAPI);
	const composer = { render: () => [], invalidate() {} };
	const form = { render: () => [], invalidate() {} };
	let focused: Component = composer;
	let draft = "";
	let panel: Component | undefined;
	let terminalInput: Parameters<ExtensionContext["ui"]["onTerminalInput"]>[0] | undefined;
	const tui = {
		terminal: { rows: 100, columns: 160, write() {} },
		getFocused: () => focused,
		requestRender() {},
	} as unknown as TUI;
	const ctx = {
		...fixture.ctx,
		mode: "tui", hasUI: true,
		ui: {
			onTerminalInput: (listener: typeof terminalInput) => { terminalInput = listener; return () => {}; },
			getEditorText: () => draft,
			setWidget: (_key: string, factory: ((tui: TUI) => Component) | undefined) => { panel = factory?.(tui); },
		},
	} as unknown as ExtensionContext;
	const key = (data: string) => terminalInput!(data);
	const render = () => panel?.render(160).join("\n");
	try {
		await Bun.write(`${fixture.ctx.cwd}/fold-fixture.txt`, "file contents for the read call");
		expect(handlers.get("input")!({ type: "input", text: "/btw read the fixture", source: "interactive" }, ctx))
			.toEqual({ handled: true });
		const deadline = Date.now() + 5_000;
		while (!render()?.includes("to close") && Date.now() < deadline) await Bun.sleep(20);
		expect(render()).toContain("1 tool call");
		expect(render()).toContain("to show tool calls");
		expect(render()).not.toContain("fold-fixture.txt");

		focused = form;
		expect(key("t")).toBeUndefined();
		expect(key("\x1b")).toBeUndefined();
		expect(render()).toContain("to show tool calls");
		focused = composer;
		draft = "unsent composer text";
		expect(key("t")).toBeUndefined();
		expect(key("\x1b")).toBeUndefined();
		expect(render()).toContain("to show tool calls");

		draft = "";
		expect(key("t")).toEqual({ consume: true });
		expect(render()).toContain("fold-fixture.txt");
		expect(render()).toContain("to fold tool calls");
		expect(key("t")).toEqual({ consume: true });
		expect(render()).not.toContain("fold-fixture.txt");
		expect(key("\x1b")).toEqual({ consume: true });
		expect(render()).toBeUndefined();
	} finally {
		handlers.get("session_shutdown")?.({ type: "session_shutdown" }, ctx);
		await fixture.dispose();
	}
}, 30_000);
