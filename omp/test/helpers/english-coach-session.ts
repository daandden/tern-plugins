import { spyOn } from "bun:test";
import { resolveModelOverride } from "@oh-my-pi/pi-coding-agent/config/model-resolver";
import type { ExtensionAPI, ExtensionContext, ExtensionUiFactory, ExtensionUiHost, InputEvent } from "@oh-my-pi/pi-coding-agent";
import { createRoot, effect, type KeyEvent, setNativeRenderingForTest, signal, type UiNode } from "@oh-my-pi/pi-tui";
import manifest from "../../package.json";
import { nodeTree, type PlainNode, plainNodes, writePluginSettings } from "../support";
import { sideQuestionFixture } from "./side-question-session";

type Handler = (event: any, ctx: ExtensionContext) => unknown;

export const CHECKING = "Checking…";
export const CLEAN = "No mistakes";

/** Each text node's spans (a plain text as one unstyled span), in tree order; a wrapping row is one line, like spans are. */
function nodeSpans(node: PlainNode): { t: string; s?: string }[][] {
	if (node.k === "text") return [node.p.spans ?? [{ t: node.p.text ?? "" }]];
	const children = node.c.flatMap(nodeSpans);
	if (node.k !== "row" || node.p.wrap !== true) return children;
	// Pieces keep their edge spaces as no-break spaces; they read as spaces.
	const line: { t: string; s?: string }[] = [];
	for (const span of children.flat()) {
		const t = span.t.replaceAll("\u00a0", " ");
		const last = line.at(-1);
		if (last && last.s === span.s) last.t += t;
		else line.push({ ...span, t });
	}
	return [line];
}

function nodeHovers(node: PlainNode): { text: string; title: string }[] {
	const own = node.k === "text" && node.p.hovercard !== undefined
		? [{ text: (node.p.spans ?? []).map((span: { t: string }) => span.t).join("").replaceAll("\u00a0", " ").trim(), title: node.p.title ?? "" }]
		: [];
	return [...own, ...node.c.flatMap(nodeHovers)];
}

/** Each text node's visible text, spans joined, in tree order. */
function nodeTexts(node: PlainNode): string[] {
	return nodeSpans(node).map(spans => spans.map(span => span.t).join(""));
}

export function panelTree(panel: UiNode, native = false, sheets: string[] = []): PlainNode[] {
	const write = spyOn(process.stdout, "write").mockImplementation(data => {
		sheets.push(String(data));
		return true;
	});
	setNativeRenderingForTest(native);
	try {
		return nodeTree(panel);
	} finally {
		setNativeRenderingForTest(false);
		write.mockRestore();
	}
}

export function panelLines(panel: UiNode): string[] {
	return panelTree(panel).flatMap(nodeTexts);
}

export async function until(predicate: () => boolean): Promise<void> {
	const end = Date.now() + 2000;
	while (!predicate()) {
		if (Date.now() > end) throw new Error("Timed out waiting for English coach");
		await Bun.sleep(5);
	}
}

export async function englishCoachFixture(options: {
	reply?: (body: Record<string, any>) => string | Promise<string>;
	fail?: string[];
	finishReason?: (body: Record<string, any>) => string;
	settings?: Record<string, unknown>;
	promptCommands?: string[];
	entryPoints?: ("english-coach" | "btw")[];
} = {}) {
	const base = await sideQuestionFixture({ reply: options.reply ?? (() => "No mistakes"), fail: options.fail, finishReason: options.finishReason });
	const handlers = new Map<string, Handler[]>();
	const widgets = new Map<string, UiNode>();
	const watchers = new Map<string, () => void>();
	const placements = new Map<string, unknown>();
	const sheets: string[] = [];
	let editorText = "";
	let renders = 0;
	const rows = signal(40);
	const ui: ExtensionUiHost = {
		requestRender() {},
		size: () => ({ rows: rows(), columns: 100 }),
		suspend: run => run(),
	};
	const terminalInput: ((data: string) => { consume?: boolean } | undefined)[] = [];
	const composerKeys: ((key: KeyEvent) => boolean)[] = [];
	const unwatch = (key: string) => {
		watchers.get(key)?.();
		watchers.delete(key);
	};
	const ctx = {
		...base.ctx,
		mode: "tui",
		hasUI: true,
		model: base.main.model,
		modelRegistry: base.main.modelRegistry,
		models: {
			resolve: (spec: string) => resolveModelOverride([spec], base.main.modelRegistry, base.settings).model,
		},
		ui: {
			...base.ctx.ui,
			onTerminalInput(handler: (data: string) => { consume?: boolean } | undefined) {
				terminalInput.push(handler);
				return () => {
					const index = terminalInput.indexOf(handler);
					if (index >= 0) terminalInput.splice(index, 1);
				};
			},
			composer: {
				addKeyHandler(handler: (key: KeyEvent) => boolean) {
					composerKeys.push(handler);
					return () => composerKeys.splice(composerKeys.indexOf(handler), 1);
				},
			},
			getEditorText: () => editorText,
			setWidget(key: string, factory: ExtensionUiFactory | undefined, placement?: unknown) {
				unwatch(key);
				if (!factory) {
					widgets.delete(key);
					return;
				}
				const panel = factory(ui, {} as never) as UiNode;
				widgets.set(key, panel);
				placements.set(key, placement);
				createRoot(dispose => {
					watchers.set(key, dispose);
					effect(() => {
						plainNodes(panel);
						renders++;
					});
				});
			},
		},
	} as unknown as ExtensionContext;
	const emit = async (name: string, event: Record<string, unknown> = {}, context = ctx) => {
		const results: unknown[] = [];
		const dispatch = Object.create(context) as ExtensionContext;
		Object.defineProperty(dispatch, "models", { value: { ...context.models } });
		for (const handler of handlers.get(name) ?? []) {
			const result = await handler({ type: name, ...event }, Object.create(dispatch));
			results.push(result);
			if ((result as { handled?: boolean } | undefined)?.handled) break;
		}
		return results;
	};
	try {
		writePluginSettings(base.ctx.cwd, options.settings ?? {});
		for (const name of options.promptCommands ?? []) {
			await Bun.write(`${base.ctx.cwd}/.omp/commands/${name}.md`, "Expanded template must never reach the coach.\n$ARGUMENTS");
		}
		for (const name of options.entryPoints ?? ["english-coach"]) {
			const entry = manifest.omp.extensions.find(file => file.endsWith(`/${name}.ts`));
			if (!entry) throw new Error(`${name} entry point is not registered in omp.extensions`);
			const initialize = (await import(new URL(`../../${entry}`, import.meta.url).href)).default;
			await initialize({
				on(name: string, handler: Handler) {
					handlers.set(name, [...(handlers.get(name) ?? []), handler]);
				},
			} as unknown as ExtensionAPI);
		}
		await emit("session_start");
	} catch (error) {
		await base.dispose();
		throw error;
	}
	const trees = (native: boolean) => [...widgets.values()].flatMap(panel => panelTree(panel, native, sheets));
	return {
		...base,
		ctx, emit, widgets, placements, sheets,
		input: (text: string, event: Partial<InputEvent> = {}, context = ctx) => emit("input", { source: "interactive", text, ...event }, context),
		/** Drops every terminal input listener, as omp 19.2.1 does before a new session, branch, or fork. */
		dropTerminalInput: () => terminalInput.splice(0),
		lines: () => trees(false).flatMap(nodeTexts),
		widgetText: (key: string) => {
			const panel = widgets.get(key);
			return panel ? JSON.stringify(nodeTree(panel)) : "";
		},
		widgetLines: (key: string) => {
			const panel = widgets.get(key);
			return panel ? panelLines(panel) : [];
		},
		nativeSpans: () => trees(true).flatMap(nodeSpans),
		nativeText: () => trees(true).flatMap(nodeTexts),
		nativeHovers: () => trees(true).flatMap(nodeHovers),
		key: (data: string) => terminalInput.toReversed().some(handler => handler(data)?.consume === true),
		composerKey: (id: string) => composerKeys.some(handler => handler({ id, kind: "press", raw: id, text: id })),
		/** Puts text in the main editor, as typing would. */
		type: (text: string) => { editorText = text; },
		ask: (event: "tool_execution_start" | "tool_execution_end", toolCallId = "ask-1") =>
			emit(event, { toolCallId, toolName: "ask", args: {}, result: undefined, isError: false }),
		resize: (count: number) => rows.set(count),
		renders: () => renders,
		dispose: async () => {
			for (const key of [...watchers.keys()]) unwatch(key);
			await emit("session_shutdown");
			await base.dispose();
		},
	};
}
