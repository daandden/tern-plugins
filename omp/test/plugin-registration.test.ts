import { beforeAll, expect, test } from "bun:test";
import { type } from "@oh-my-pi/omptype";
import { Settings, type ExtensionAPI, type ExtensionContext, type ExtensionUIContext, type ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import { initTheme } from "@oh-my-pi/pi-tui/theme";
import manifest from "../package.json" with { type: "json" };

beforeAll(async () => {
	await Settings.init({ inMemory: true });
	await initTheme();
});

test("plugin startup leaves ask and host dialogs to omp", async () => {
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
		getFlag: () => undefined,
		on: (event: string, handler: (typeof handlers.session_start)[number]) => {
			if (event === "session_start" || event === "session_shutdown") handlers[event].push(handler);
		},
	} as unknown as ExtensionAPI;
	const hostAskDialog: NonNullable<ExtensionUIContext["askDialog"]> = async () => undefined;
	const ctx = {
		cwd: process.cwd(),
		mode: "tui",
		hasUI: true,
		agent: { kind: "main", id: "plugin-registration-test" },
		ui: {
			askDialog: hostAskDialog,
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
		expect({ tools, usesHostAskDialog: ctx.ui.askDialog === hostAskDialog }).toEqual({
			tools: ["generate_image"],
			usesHostAskDialog: true,
		});
	} finally {
		for (const shutdown of handlers.session_shutdown) await shutdown({ type: "session_shutdown" }, ctx);
	}
});
