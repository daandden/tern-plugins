import { beforeAll, expect, test } from "bun:test";
import { type } from "@oh-my-pi/omptype";
import { type ExtensionAPI, type ExtensionContext, type ExtensionUIContext, initTheme, Settings, type ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import manifest from "../package.json" with { type: "json" };

beforeAll(async () => {
	await Settings.init({ inMemory: true });
	initTheme();
});

test.each([
	["tui", true, true, ["generate_image", "ask"]],
	["tui", true, false, ["generate_image"]],
	["rpc", true, true, ["generate_image"]],
	["print", false, false, ["generate_image"]],
] as const)("starts omp-tools in %s without adding Ask where the host did not enable it (%s, %s)", async (mode, hasUI, nativeAsk, expectedTools) => {
	const tools: string[] = [];
	type LifecycleEvent = "session_start" | "session_shutdown";
	const handlers: Record<LifecycleEvent, ((event: { type: LifecycleEvent }, ctx: ExtensionContext) => unknown)[]> = {
		session_start: [],
		session_shutdown: [],
	};
	const api = {
		arktype: type,
		registerTool: (tool: ToolDefinition) => tools.push(tool.name),
		registerFlag() {},
		registerCommand() {},
		getFlag: () => undefined,
		getAllTools: () => nativeAsk ? [{ name: "ask", sourceInfo: { source: "builtin" } }] : [],
		on: (event: string, handler: (typeof handlers.session_start)[number]) => {
			if (event === "session_start" || event === "session_shutdown") handlers[event].push(handler);
		},
	} as unknown as ExtensionAPI;
	const hostAskDialog: NonNullable<ExtensionUIContext["askDialog"]> = async () => undefined;
	const hostFormDialog: NonNullable<ExtensionUIContext["formDialog"]> = async () => undefined;
	const ctx = {
		cwd: process.cwd(),
		mode,
		hasUI,
		agent: { kind: "main", id: "plugin-registration-test" },
		sessionManager: {},
		ui: {
			askDialog: hostAskDialog,
			formDialog: hostFormDialog,
			custom: async () => undefined,
			notify() {},
			addAutocompleteProvider() {},
			onTerminalInput: () => () => {},
		},
	} as unknown as ExtensionContext;

	for (const entry of manifest.omp.extensions) {
		const { default: initialize } = await import(new URL(entry, new URL("../package.json", import.meta.url)).href);
		await initialize(api);
	}
	try {
		for (const start of handlers.session_start) await start({ type: "session_start" }, ctx);
		expect({ tools, usesHostAskDialog: ctx.ui.askDialog === hostAskDialog, usesHostFormDialog: ctx.ui.formDialog === hostFormDialog }).toEqual({
			tools: [...expectedTools],
			usesHostAskDialog: true,
			usesHostFormDialog: true,
		});
	} finally {
		for (const shutdown of handlers.session_shutdown) await shutdown({ type: "session_shutdown" }, ctx);
	}
});
