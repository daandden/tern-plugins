import { beforeAll, expect, spyOn, test } from "bun:test";
import { type ExtensionUiHost, formatKeyHint, initTheme, Settings } from "@oh-my-pi/pi-coding-agent";
import { createRoot, setNativeRenderingForTest, type UiNode } from "@oh-my-pi/pi-tui";
import "@oh-my-pi/pi-tui/term/widgets";
import { paintNode, staticEnvironment } from "@oh-my-pi/pi-tui/term/paint";
import { currentTheme } from "@oh-my-pi/pi-tui/theme/runtime";
import { btwPanel } from "../extensions/btw-panel";
import { englishCoachPanel } from "../extensions/english-coach-panel";
import { el, type PanelBodyView, scrollBox } from "../extensions/panel-layout";
import { newTurn } from "../extensions/side-question-view";
import { allNodes, nodeTree } from "./support";

/** `node` as a plain terminal paints it at `width` cells, without colour. */
function painted(node: () => UiNode, width = 60): string[] {
	let rows: readonly string[] = [];
	createRoot(dispose => {
		rows = paintNode(staticEnvironment(currentTheme()), node(), width).rows;
		dispose();
	});
	return rows.map(row => Bun.stripANSI(row).trimEnd());
}

const items = (...names: string[]) =>
	el("col", { children: names.map(name => el("col", { children: [1, 2, 3, 4].map(line => el("text", { text: `${name}${line}` })) })) });
const body = (view: PanelBodyView, lines = 5) => scrollBox(items("a", "b"), () => lines, "body", () => view);

test("a plain terminal shows a capped body's start, end, or last item, and counts the hidden lines", () => {
	expect(painted(() => body("start"))).toEqual(["a1", "a2", "a3", "a4", "… 4 more lines"]);
	expect(painted(() => body("end"))).toEqual(["… 4 earlier lines", "b1", "b2", "b3", "b4"]);
	expect(painted(() => body("end", 3))).toEqual(["… 6 earlier lines", "b3", "b4"]);
	expect(painted(() => body("lastItem", 3))).toEqual(["… 4 earlier lines", "b1", "… 3 more lines"]);
});

const correction = (text: string) => ({ correction: { lines: [[{ kind: "ins" as const, text }]], mistakes: [], fixes: [] } });

test("in a plain terminal the coach's close key ends the last line of its capped body", () => {
	const rows = painted(() => englishCoachPanel(ui, () => correction("word ".repeat(400).trim()), () => {}));
	expect(rows).toHaveLength(16);
	expect(rows.at(-1)).toMatch(new RegExp(`^… \\d+ more lines +${formatKeyHint("escape").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
});

beforeAll(async () => {
	await Settings.init({ inMemory: true });
	initTheme();
});

const ui: ExtensionUiHost = { requestRender() {}, size: () => ({ rows: 40, columns: 100 }), suspend: run => run() };
const panels = () => [
	btwPanel(ui, () => ({ turns: [newTurn("What changed?")], toolsOpen: false, revision: 0 })),
	englishCoachPanel(ui, () => correction("works"), () => {}),
];
const sheetsOf = (calls: unknown[][]) => calls.map(([data]) => String(data)).filter(data => data.startsWith("\x1b_tsp;s;"));

test("in Tern, both panels send a list marker gutter for their scroll body", () => {
	const write = spyOn(process.stdout, "write").mockImplementation(() => true);
	setNativeRenderingForTest(true);
	try {
		for (const panel of panels()) {
			const before = write.mock.calls.length;
			expect(allNodes(nodeTree(panel)).some(node => node.k === "list" && node.p.role === "omp-tools.panel-body")).toBe(true);
			const sheets = sheetsOf(write.mock.calls.slice(before));
			expect(sheets).toHaveLength(1);
			expect(sheets[0]).toContain(".sf-list[data-role='omp-tools.panel-body'] > .sf-list-scroll");
		}
	} finally {
		setNativeRenderingForTest(false);
		write.mockRestore();
	}
});

test("a plain terminal gets no Tern stylesheet", () => {
	const write = spyOn(process.stdout, "write").mockImplementation(() => true);
	try {
		for (const panel of panels()) nodeTree(panel);
		expect(sheetsOf(write.mock.calls)).toEqual([]);
	} finally {
		write.mockRestore();
	}
});
