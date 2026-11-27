import { beforeAll, expect, test } from "bun:test";
import { type ExtensionAPI, type ExtensionCommandContext, type ExtensionUIContext, type ExtensionUiHost, Settings, initTheme } from "@oh-my-pi/pi-coding-agent";
import { resolveChildren, setNativeRenderingForTest, type UiNode } from "@oh-my-pi/pi-tui";
import { decodeInput } from "@oh-my-pi/pi-tui/driver/input/decoder";
import { visibleWidth } from "@oh-my-pi/pi-tui/text/width";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { registerCoachDashboard } from "../extensions/coach-dashboard";
import { openCoachMemory } from "../extensions/coach-memory";
import { coachRuleIds } from "../extensions/coach-rules";
import { allNodes, fakeContext, nodeTree, type PlainNode } from "./support";

beforeAll(async () => {
	await Settings.init({ inMemory: true });
	initTheme();
});

function loadSession(columns: number, rows: number, native = false) {
	const commands = new Map<string, Parameters<ExtensionAPI["registerCommand"]>[1]>();
	registerCoachDashboard({ registerCommand: (name, command) => { commands.set(name, command); } } as ExtensionAPI);
	const command = commands.get("english-coach");
	if (!command) throw new Error("Missing /english-coach command");
	const mounted = Promise.withResolvers<UiNode>();
	const host: ExtensionUiHost = { requestRender() {}, size: () => ({ columns, rows }), suspend: run => run() };
	const custom: ExtensionUIContext["custom"] = async <T>(
		factory: (host: ExtensionUiHost, theme: never, keybindings: never, done: (value: T) => void) => unknown,
		options?: Parameters<ExtensionUIContext["custom"]>[1],
	) => {
		expect(options).toMatchObject({ overlay: true, fullscreen: !native });
		const result = Promise.withResolvers<T>();
		const [root] = resolveChildren(await factory(host, undefined as never, undefined as never, result.resolve))();
		if (!root) throw new Error("The Coach memory dashboard did not mount");
		mounted.resolve(root);
		return result.promise;
	};
	const ctx = Object.assign(fakeContext(), { mode: "tui", hasUI: true, ui: { custom } }) as ExtensionCommandContext;
	const opened = command.handler("", ctx);
	const node = () => Promise.race([mounted.promise, opened.then(() => { throw new Error("Dashboard closed before it mounted"); })]);
	return { opened, node, async input(data: string) {
		const root = await node();
		// A Tern popup is an overlay whose first child takes the keys.
		const keyed = root.kind === "overlay" ? root.children()[0]! : root;
		for (const event of decodeInput(data, { kitty: true })) {
			if (event.type === "key") keyed.handlers.onKey?.(event.key);
			else if (event.type === "paste") keyed.handlers.onPaste?.(event.paste);
		}
	},
		async lines() {
			const [root] = nodeTree(await node());
			return root?.c.flatMap(child => {
				const { spans } = child.p;
				return Array.isArray(spans) ? spans.map(span => typeof span.t === "string" ? span.t.trim() : "") : [];
			}) ?? [];
		},
	};
}

async function isolatedHome(run: (dir: string) => Promise<void>) {
	const dir = mkdtempSync(join(tmpdir(), "coach-dashboard-test-"));
	const previous = process.env.PI_CONFIG_DIR;
	process.env.PI_CONFIG_DIR = relative(homedir(), dir);
	try {
		await run(dir);
	} finally {
		if (previous === undefined) delete process.env.PI_CONFIG_DIR;
		else process.env.PI_CONFIG_DIR = previous;
		rmSync(dir, { recursive: true, force: true });
	}
}

test("in Tern, /english-coach is a popup whose cards, buttons and rows act like its keys", async () => {
	setNativeRenderingForTest(true);
	try {
		await isolatedHome(async () => {
			const memory = openCoachMemory();
			const generation = memory.beginCheck();
			const at = Date.now();
			try {
				memory.recordCheck({ id: "clean", generation, at, fixes: [] });
				memory.recordCheck({ id: "issue", generation, at, fixes: [
					{ rule: "articles", example: { before: "opened issue", after: "opened an issue" } },
				] });
				const session = loadSession(160, 50, true);
				const tree = async () => allNodes(nodeTree(await session.node()));
				const texts = async () => (await tree()).flatMap((node: PlainNode) => [
					...(Array.isArray(node.p.spans) ? [node.p.spans.map((span: { t: string }) => span.t).join("")] : []),
					...(typeof node.p.text === "string" ? [node.p.text] : []),
				]).join("\n");
				const act = async (action: string) => {
					const root = await session.node();
					root.children()[0]!.handlers.onAction!(action, { type: "action", key: "test", act: action, mods: [] });
				};
				try {
					expect((await session.node()).kind).toBe("overlay");
					expect(await texts()).toContain("English prompts in total");
					expect(await texts()).toContain("1/2 prompts · 1 fix");
					await act("rule:0");
					expect(await texts()).toContain("singular count noun");
					// The example shows the word the fix added.
					expect((await tree()).some(node => node.p.spans?.some((span: { t: string; s?: string }) => span.t === "an" && span.s === "ins"))).toBe(true);
					await act("key:f");
					expect((await tree()).find(node => node.k === "button" && node.p.text === "Unpin focus")?.p.on).toBe(true);
					await act("key:p");
					expect(await texts()).toContain("I opened ___ issue");
					await act("key:1");
					expect(await texts()).toContain("Not quite. Answer: an.");
					expect((await tree()).find(node => node.p.role === "omp-tools.coach.choice.right")?.p.text).toBe("an");
					await session.input("\r");
					expect(await texts()).toContain("singular count noun");
					await session.input("\x1b");
					expect(await texts()).toContain("Focus");
				} finally {
					// Esc steps back one page at a time; home closes the popup.
					let closed = false;
					void session.opened.finally(() => { closed = true; });
					for (let step = 0; step < 4 && !closed; step++) {
						await session.input("\x1b");
						await Bun.sleep(0);
					}
					await session.opened;
				}
			} finally {
				memory.close();
			}
		});
	} finally {
		setNativeRenderingForTest(false);
	}
});

test("/english-coach shows recorded examples, practice feedback and confirmed reset", async () => {
	await isolatedHome(async () => {
		const memory = openCoachMemory();
		const generation = memory.beginCheck();
		const at = Date.now();
		try {
			memory.recordCheck({ id: "clean", generation, at, fixes: [] });
			memory.recordCheck({ id: "issue", generation, at, fixes: [
				{ rule: "articles", example: { before: "opened issue", after: "opened an issue" } },
			] });
			const session = loadSession(100, 40);
			const text = async () => (await session.lines()).join("\n");
			try {
				expect(await text()).toContain("Observed frequency");
				expect(await text()).toContain("1/2 prompts (50%)");
				expect(await text()).toContain("Weekly digest");
				await session.input("\r");
				expect(await text()).toContain("Before: opened issue");
				expect(await text()).toContain("After:  opened an issue");
				await session.input("f");
				expect(await text()).toContain("Focus pinned.");
				await session.input("p");
				expect(await text()).toContain("I opened ___ issue");
				await session.input("1");
				expect(await text()).toContain("Not quite. Answer: an.");
				expect(await text()).toContain("vowel sound");
				await session.input("\r");
				await session.input("x");
				expect(await text()).toContain("Removed this fix from your counts.");
				expect(memory.snapshot().prompts).toBe(2);
				await session.input("\x1b");
				await session.input("r");
				expect(await text()).toContain("Delete Coach memory?");
				await session.input("\x1b");
				expect(memory.snapshot().prompts).toBe(2);
				await session.input("r");
				await session.input("y");
				expect(await text()).toContain("Coach memory reset.");
				expect(await text()).toContain("Check an English prompt to get started.");
				expect(memory.beginCheck()).not.toBe(generation);
			} finally {
				await session.input("\x1b");
				await session.input("\x1b");
				await session.opened;
			}
		} finally {
			memory.close();
		}
	});
});

test("a narrow dashboard can page through the ranking to the weekly digest", async () => {
	await isolatedHome(async () => {
		const memory = openCoachMemory();
		try {
			const generation = memory.beginCheck();
			for (const [index, rule] of coachRuleIds.entries()) {
				memory.recordCheck({ id: `${index}`, generation, at: Date.now(), fixes: [{ rule }] });
			}
		} finally {
			memory.close();
		}
		const session = loadSession(24, 10);
		try {
			for (const line of await session.lines()) expect(visibleWidth(line)).toBeLessThanOrEqual(24);
			await session.input("\x1b[B");
			expect((await session.lines()).some(line => line.startsWith("› "))).toBe(true);
			let found = false;
			for (let page = 0; page < 30; page++) {
				const lines = await session.lines();
				expect(lines.length).toBeLessThanOrEqual(10);
				if (lines.includes("Weekly digest")) {
					found = true;
					break;
				}
				await session.input("\x1b[6~");
			}
			expect(found).toBe(true);
		} finally {
			await session.input("\x1b");
			await session.opened;
		}
	});
});

test("/english-coach reports a storage error without substituting empty history", async () => {
	await isolatedHome(async dir => {
		mkdirSync(join(dir, "coach"));
		writeFileSync(join(dir, "coach", "memory.sqlite"), "not SQLite");
		const session = loadSession(100, 40);
		try {
			const text = (await session.lines()).join("\n");
			expect(text).toContain("Coach memory is unavailable.");
			expect(text).not.toContain("Observed frequency");
		} finally {
			await session.input("\x1b");
			await session.opened;
		}
	});
});
