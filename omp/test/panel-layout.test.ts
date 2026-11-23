import { beforeAll, expect, test } from "bun:test";
import { Settings } from "@oh-my-pi/pi-coding-agent";
import type { DescribeContext, NativeNode, TUI } from "@oh-my-pi/pi-tui";
import { initTheme } from "@oh-my-pi/pi-tui/theme";
import { BtwPanel } from "../extensions/btw-panel";
import { EnglishCoachPanel } from "../extensions/english-coach-panel";
import { newTurn } from "../extensions/side-question-view";

beforeAll(async () => {
	await Settings.init({ inMemory: true });
	await initTheme();
});

function hasPanelBody(node: NativeNode): boolean {
	return (node.k === "list" && node.p?.role === "omp-tools.panel-body") ||
		(node.c?.some(child => typeof child === "object" && child !== null && "k" in child && hasPanelBody(child as NativeNode)) ?? false);
}

test("both Tern panels send a list marker gutter for their scroll body", () => {
	const writes: string[] = [];
	const tui = { terminal: { rows: 40, write: (data: string) => writes.push(data) } } as unknown as TUI;
	const cx: DescribeContext = {
		cols: 100, reduceMotion: false, dark: true,
		supports: () => true, feature: name => name === "styles",
	};
	const panels = [
		new BtwPanel(tui, () => ({ turns: [newTurn("What changed?")], toolsOpen: false, revision: 0 })),
		new EnglishCoachPanel(tui, () => ({ kind: "checking" }), () => {}),
	];
	for (const panel of panels) {
		expect(hasPanelBody(panel.describe(cx))).toBe(true);
		expect(writes.at(-1)).toContain(".sf-list[data-role='omp-tools.panel-body'] > .sf-list-scroll");
	}
	expect(writes).toHaveLength(2);
});
