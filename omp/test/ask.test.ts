import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type } from "@oh-my-pi/omptype";
import {
	type ExtensionAPI,
	type ExtensionContext,
	type ExtensionCustomFactory,
	type ExtensionCustomOptions,
	type ExtensionUIContext,
	getKeybindings,
	initTheme,
	Settings,
	settings,
	type ToolDefinition,
} from "@oh-my-pi/pi-coding-agent";
import { cfgAskNotify, cfgAskTimeout } from "@oh-my-pi/pi-coding-agent/modes/settings";
import * as clipboard from "@oh-my-pi/pi-coding-agent/utils/clipboard";
import { resolveChildren, type UiNode } from "@oh-my-pi/pi-tui";
import { decodeInput } from "@oh-my-pi/pi-tui/driver/input/decoder";
import { paintNode } from "@oh-my-pi/pi-tui/term/paint";
import { stripEscapes } from "@oh-my-pi/pi-tui/text/ansi";
import { currentTheme } from "@oh-my-pi/pi-tui/theme/runtime";
import manifest from "../package.json" with { type: "json" };
import { sideQuestionFixture } from "./helpers/side-question-session";
import { allNodes, encodePng, fakeContext, imagesOf, plainNodes, resultCard, rgbaPixels, textOf } from "./support";

beforeAll(async () => {
	await Settings.init({ inMemory: true });
	initTheme();
	settings.writeValue(cfgAskNotify, "off", "override");
});

afterAll(() => settings.clearOverrideValue(cfgAskNotify));
afterEach(() => settings.clearOverrideValue(cfgAskTimeout));

async function loadTool(): Promise<ToolDefinition> {
	const tools: ToolDefinition[] = [];
	const start: Array<(event: { type: "session_start" }, ctx: ExtensionContext) => unknown> = [];
	const api = {
		arktype: type,
		registerTool: (tool: ToolDefinition) => tools.push(tool),
		registerFlag() {},
		registerCommand() {},
		getFlag: () => undefined,
		getAllTools: () => [{ name: "ask", sourceInfo: { source: "builtin" } }],
		on(event: string, handler: (typeof start)[number]) {
			if (event === "session_start") start.push(handler);
		},
	} as unknown as ExtensionAPI;
	const entry = manifest.omp.extensions.find(path => path === "./extensions/ask.ts");
	if (!entry) throw new Error("The plugin manifest does not load Ask");
	const { default: initialize } = await import(new URL(entry, new URL("../package.json", import.meta.url)).href);
	await initialize(api);
	const ctx = { mode: "tui", hasUI: true } as ExtensionContext;
	for (const handler of start) await handler({ type: "session_start" }, ctx);
	const ask = tools.find(tool => tool.name === "ask");
	if (!ask) throw new Error("The plugin did not register the Ask card");
	return ask;
}

const FLOW = Symbol.for("vstack.flow-page.ask-dialog");
const SINGLE = '<form><label><input type="radio" name="choice" value="a" checked> Option A</label></form>';
const paste = (text: string) => `\x1b[200~${text}\x1b[201~`;

function customSession(overrides: Partial<ExtensionContext> = {}) {
	let aborts = 0;
	const mounted = Promise.withResolvers<UiNode>();
	const custom = async <T>(factory: ExtensionCustomFactory<T>, options?: ExtensionCustomOptions): Promise<T> => {
		expect(options?.overlay).not.toBe(true);
		const result = Promise.withResolvers<T>();
		const fail = () => result.reject(options?.signal?.reason);
		options?.signal?.addEventListener("abort", fail, { once: true });
		try {
			const view = await factory({
				requestRender() {},
				size: () => ({ columns: 100, rows: 40 }),
				suspend: run => run(),
			}, undefined as never, getKeybindings(), result.resolve);
			const [root] = resolveChildren(view)();
			if (!root) throw new Error("The Ask card did not mount");
			mounted.resolve(root);
			return await result.promise;
		} finally {
			options?.signal?.removeEventListener("abort", fail);
		}
	};
	const ctx = Object.assign(fakeContext(), {
		mode: "tui",
		hasUI: true,
		cwd: process.cwd(),
		abort: () => { aborts++; },
		...overrides,
		ui: {
			custom: custom satisfies ExtensionUIContext["custom"],
			notify() {},
			onTerminalInput: () => () => {},
			setWidget() {},
		},
	}) as ExtensionContext;
	return {
		ctx,
		aborts: () => aborts,
		root: mounted.promise,
		async action(act: string) {
			(await mounted.promise).handlers.onAction?.(act, { type: "action", key: `actions/${act}`, act, mods: [] });
		},
		async waitFor(predicate: (nodes: ReturnType<typeof allNodes>) => boolean) {
			const root = await mounted.promise;
			const deadline = Date.now() + 1000;
			while (!predicate(allNodes(plainNodes(root)))) {
				if (Date.now() > deadline) throw new Error("Ask card did not show the expected state");
				await Bun.sleep(1);
			}
		},
		async input(data: string) {
			const root = await mounted.promise;
			for (const event of decodeInput(data, { kitty: true })) {
				if (event.type === "key") root.handlers.onKey?.(event.key);
				else if (event.type === "paste") root.handlers.onPaste?.(event.paste);
			}
		},
	};
}

test("the Ask card returns a multiline General note on a single-field form", async () => {
	const ask = await loadTool();
	const session = customSession();
	const result = ask.execute("ask-1", { html: SINGLE }, undefined, undefined, session.ctx);
	await session.input("N");
	const root = await session.root;
	const painted = paintNode({
		theme: currentTheme,
		clock: Date.now,
		focus: () => root,
		reduceMotion: () => true,
		hyperlinks: () => false,
	}, root, 100);
	expect(painted.rows.map(stripEscapes).join("\n")).toContain("Option A");
	expect(painted.rows.map(stripEscapes).join("\n")).toContain("General note");
	await session.input(paste("First line\r\nSecond line"));
	await session.input("\r");
	await session.input("\r");
	expect(textOf(await result)).toContain("General note:\nFirst line\nSecond line");
	const displayed = allNodes(resultCard(ask, await result, { html: SINGLE }));
	expect(displayed.some(node => node.p.text === "General note")).toBe(true);
	expect(displayed.filter(node => node.p.role === "omp.tool.answer.note").map(node => node.p.spans)).toEqual([
		[{ t: "First line", s: "em" }], [{ t: "Second line", s: "em" }],
	]);
});

test("saving and reopening an option Note preserves lines; Escape keeps the saved Note", async () => {
	const ask = await loadTool();
	const session = customSession();
	const result = ask.execute("ask-2", { html: SINGLE }, undefined, undefined, session.ctx);
	await session.input("n");
	await session.input("a");
	await session.input("\n");
	await session.input("b");
	await session.input("\r");
	await session.input("n");
	await session.input(paste("\nDiscard this edit"));
	await session.input("\x1b");
	await session.input("\r");
	const answered = await result;
	expect(textOf(answered)).toContain('Option A [choice="a"] — a\nb');
	expect(textOf(answered)).not.toContain("Discard this edit");
});

test("the clipboard image key attaches an image to the focused Note", async () => {
	const local = spyOn(clipboard, "isClipboardTerminalLocal").mockReturnValue(true);
	const paths = spyOn(clipboard, "readMacFileUrlsFromClipboard").mockResolvedValue([]);
	const bitmap = spyOn(clipboard, "readImageFromClipboard").mockResolvedValue({
		mimeType: "image/png",
		data: Buffer.from(encodePng(2, 2, () => [255, 0, 0, 255])),
	});
	try {
		const ask = await loadTool();
		const session = customSession();
		const result = ask.execute("ask-clipboard", { html: SINGLE }, undefined, undefined, session.ctx);
		await session.input("n");
		await session.input("\x16");
		await session.waitFor(nodes => nodes.some(node => node.k === "editor" && node.p.text === "[Image #1]"));
		await session.input("\r");
		await session.input("\r");
		const answer = await result;
		expect(textOf(answer)).toContain('Option A [choice="a"] — [Image #1]');
		expect(imagesOf(answer)).toHaveLength(1);
	} finally {
		bitmap.mockRestore();
		paths.mockRestore();
		local.mockRestore();
	}
});

test("picture paths return image blocks in marker order across picked Notes and the General note", async () => {
	const ask = await loadTool();
	const dir = await mkdtemp(join(tmpdir(), "ask-card-"));
	const red = encodePng(2, 2, () => [255, 0, 0, 255]);
	const blue = encodePng(2, 2, () => [0, 0, 255, 255]);
	const a = join(dir, "red test.png");
	const b = join(dir, "blue.png");
	try {
		await Promise.all([Bun.write(a, red), Bun.write(b, blue)]);
		const session = customSession({ cwd: dir });
		const html = `<form><label><input type="checkbox" name="pick" value="a" checked>Alpha</label>
			<label><input type="checkbox" name="pick" value="b">Beta</label></form>`;
		const result = ask.execute("ask-3", { html }, undefined, undefined, session.ctx);
		const waitForSaved = () => session.waitFor(nodes => nodes.some(node => (node.p.actions as { click?: string } | undefined)?.click === "general-note"));
		await session.input("n");
		await session.input(paste("Alpha proof:\n"));
		await session.input(paste(a));
		await session.input("\r");
		await waitForSaved();
		await session.input("\x1b[B");
		await session.input("n");
		await session.input(paste("Unpicked proof:\n"));
		await session.input(paste(b));
		await session.input("\r");
		await waitForSaved();
		await session.action("general-note");
		await session.input(paste("General proof:\n"));
		await session.input(paste(b));
		await session.input("\r");
		await waitForSaved();
		await session.input("\r");
		const answer = await result;
		expect(textOf(answer)).toContain('Alpha [pick="a"] — Alpha proof:\n[Image #1]');
		expect(textOf(answer)).toContain("General note:\nGeneral proof:\n[Image #2]");
		expect(textOf(answer)).not.toContain("Unpicked proof");
		const pictures = await Promise.all(imagesOf(answer).map(block => rgbaPixels(block.bytes)));
		const [first, second] = pictures.map(({ rgba }) => rgba);
		expect(pictures).toHaveLength(2);
		expect(Math.max(255 - first[0], first[1], first[2], 255 - first[3])).toBeLessThanOrEqual(4);
		expect(Math.max(second[0], second[1], 255 - second[2], 255 - second[3])).toBeLessThanOrEqual(4);
		expect(first[3]).toBe(255);
		expect(second[3]).toBe(255);
	} finally {
		await rm(dir, { force: true, recursive: true });
	}
});

test("Shift+N types into a text field, where Alt+U opens the General note", async () => {
	const ask = await loadTool();
	const session = customSession();
	const html = '<form><label>Name <input type="text" name="name"></label></form>';
	const result = ask.execute("ask-typed-n", { html }, undefined, undefined, session.ctx);
	await session.input("N");
	await session.input("\x1bu");
	await session.input(paste("About the name"));
	await session.input("\r");
	await session.input("\r");
	const answer = textOf(await result);
	expect(answer).toContain('"name": "N"');
	expect(answer).toContain("About the name");
});

test("deleting a picture marker drops the picture", async () => {
	const ask = await loadTool();
	const dir = await mkdtemp(join(tmpdir(), "ask-card-"));
	try {
		const file = join(dir, "picture.png");
		await Bun.write(file, encodePng(2, 2, () => [255, 0, 0, 255]));
		const session = customSession({ cwd: dir });
		const result = ask.execute("ask-4", { html: SINGLE }, undefined, undefined, session.ctx);
		await session.input("N");
		await session.input(paste(file));
		await session.waitFor(nodes => nodes.some(node => node.k === "editor" && node.p.text === "[Image #1]"));
		await session.input("\x7f".repeat("[Image #1]".length));
		await session.input(paste("Text alone"));
		await session.input("\r");
		await session.input("\r");
		const answer = await result;
		expect(textOf(answer)).toContain("General note:\nText alone");
		expect(imagesOf(answer)).toEqual([]);
	} finally {
		await rm(dir, { force: true, recursive: true });
	}
});

test("expiry marks valid current values as automatic and gives no invalid answer", async () => {
	const ask = await loadTool();
	settings.writeValue(cfgAskTimeout, 0.02, "override");
	const valid = await ask.execute("ask-valid-timeout", { html: SINGLE }, undefined, undefined, customSession().ctx);
	expect(textOf(valid)).toContain('"choice": "a"');
	expect(textOf(valid)).toContain("not a user choice");
	expect(valid.details).toMatchObject({ timedOut: true });
	const html = '<form><label>Name <input name="name" required></label></form>';
	const invalid = await ask.execute("ask-invalid-timeout", { html }, undefined, undefined, customSession().ctx);
	expect(textOf(invalid)).toContain("no answer was given");
	expect(invalid.details).toEqual({ answers: [], timedOut: true });
});

test("plan mode waits for explicit submission instead of expiring", async () => {
	const ask = await loadTool();
	settings.writeValue(cfgAskTimeout, 0.02, "override");
	const session = customSession({
		sessionModes: {
			getState: () => ({ plan: { status: "active" }, vibe: { status: "inactive" }, goal: { status: "inactive" }, loop: { status: "inactive" } }),
			async set() { throw new Error("Plan mode must not change"); },
		},
	});
	const result = ask.execute("ask-plan", { html: SINGLE }, undefined, undefined, session.ctx);
	await session.root;
	await Bun.sleep(40);
	await session.input("\r");
	expect(textOf(await result)).toMatch(/^User answers:/);
});

test("optional Flow hook sees exact HTML, id and signal and is released on cancellation", async () => {
	const ask = await loadTool();
	const session = customSession();
	const signal = new AbortController().signal;
	const opens: unknown[] = [];
	let released = 0;
	Object.defineProperty(session.ctx.ui, FLOW, {
		value(open: unknown) {
			opens.push(open);
			return () => { released++; };
		},
	});
	const result = ask.execute("ask-flow", { html: SINGLE }, signal, undefined, session.ctx);
	void result.catch(() => {});
	await session.root;
	expect(opens).toEqual([{ html: SINGLE, toolCallId: "ask-flow", signal }]);
	expect(released).toBe(0);
	await session.input("\x1b");
	await expect(result).rejects.toThrow("Ask tool was cancelled by the user");
	expect(released).toBe(1);
	expect(session.aborts()).toBe(1);
});

test("bare HTML and legacy questions still open the card", async () => {
	const ask = await loadTool();
	for (const [args, value] of [
		[SINGLE, '"choice": "a"'],
		[{ questions: [{ id: "choice", question: "Choose a letter", options: ["option"], recommended: 0 }] }, '"choice": "option"'],
	] as const) {
		const session = customSession();
		const result = ask.execute("ask-legacy", args as never, undefined, undefined, session.ctx);
		await session.input("\r");
		expect(textOf(await result)).toContain(value);
	}
});

test("headless Ask delegates to the native tool without mounting an extension view", async () => {
	const ask = await loadTool();
	const received: unknown[] = [];
	const ctx = {
		...fakeContext(),
		mode: "print",
		hasUI: false,
		ui: {},
		async invokeTool(args: unknown) {
			received.push(args);
			return { content: [{ type: "text", text: "Native Ask" }] };
		},
	} as unknown as ExtensionContext;
	const result = await ask.execute("ask-headless", { html: SINGLE }, undefined, undefined, ctx);
	expect(received).toEqual([{ html: SINGLE }]);
	expect(textOf(result)).toBe("Native Ask");
});

test("Alt+/ in a Note asks a Side question with the unsaved draft without submitting it to the main agent", async () => {
	const ask = await loadTool();
	const request = Promise.withResolvers<unknown>();
	const fixture = await sideQuestionFixture({ reply: body => {
		request.resolve(body);
		return "Side answer";
	} });
	try {
		const session = customSession(fixture.ctx);
		const result = ask.execute("ask-btw", { html: SINGLE }, undefined, undefined, session.ctx);
		await session.input("\x1bu");
		await session.input(paste("Current draft only\nNot submitted"));
		await session.input("\x1b/");
		await session.input(paste("Why choose A?"));
		await session.input("\r");
		const payload = JSON.stringify(await request.promise);
		expect(payload).toContain("Why choose A?");
		expect(payload).toContain("Current draft only");
		expect(payload).toContain("Not submitted");
		expect(payload).toContain("Option A");
		await session.input("\x1b");
		await session.input("\r");
		const answer = textOf(await result);
		expect(answer).not.toContain("Current draft only");
		expect(answer).not.toContain("Why choose A?");
	} finally {
		await fixture.dispose();
	}
});

test("? on an option opens the Side question, and the question stays out of the answer", async () => {
	const ask = await loadTool();
	const request = Promise.withResolvers<unknown>();
	const fixture = await sideQuestionFixture({ reply: body => {
		request.resolve(body);
		return "Side answer";
	} });
	try {
		const session = customSession(fixture.ctx);
		const result = ask.execute("ask-btw-question-mark", { html: SINGLE }, undefined, undefined, session.ctx);
		await session.input("?");
		await session.input(paste("Is A the safe pick?"));
		await session.input("\r");
		const payload = JSON.stringify(await request.promise);
		expect(payload).toContain("Is A the safe pick?");
		expect(payload).toContain("Option A");
		await session.input("\r");
		const answer = textOf(await result);
		expect(answer).toContain('"choice": "a"');
		expect(answer).not.toContain("Is A the safe pick?");
	} finally {
		await fixture.dispose();
	}
});

test("explicit Submit keeps native advisory validation", async () => {
	const ask = await loadTool();
	const session = customSession();
	const html = '<form><label>Quantity <input type="number" name="quantity" value="2" min="5" required></label></form>';
	const result = ask.execute("ask-invalid-explicit", { html }, undefined, undefined, session.ctx);
	await session.waitFor(nodes => nodes.some(node => node.p.role === "omp.ask.error" && JSON.stringify(node.p.spans).includes("Must be at least 5")));
	await session.action("submit");
	expect(textOf(await result)).toContain('"quantity": 2');
});