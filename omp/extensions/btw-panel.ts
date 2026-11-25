import type { ExtensionUiHost } from "@oh-my-pi/pi-coding-agent";
import type { UiNode } from "@oh-my-pi/pi-tui";
import { el, hintsRow, interruptKeys, type KeyHint, scrollBox } from "./panel-layout";
import { hasToolCalls, type SideQuestionTurn, turnNode } from "./side-question-view";
import { sendSheet } from "./tern-theme";

const PANEL_HEIGHT_RATIO = 0.4;

export interface BtwPanelState {
	readonly turns: readonly SideQuestionTurn[];
	readonly toolsOpen: boolean;
	/** Changes on every thread update, so Tern scrolls to the end again. */
	readonly revision: number;
}

function panelHints(state: BtwPanelState): KeyHint[] {
	const esc = interruptKeys()[0];
	const tools: KeyHint[] = state.turns.some(hasToolCalls)
		? [{ key: "t", label: state.toolsOpen ? "to fold tool calls" : "to show tool calls" }]
		: [];
	if (!esc) return state.turns.at(-1)?.status === "running" ? [] : tools;
	if (state.turns.at(-1)?.status === "running") return [{ key: esc, label: "to cancel" }];
	return [...tools, { key: esc, label: "to close" }];
}

/** The `/btw` thread panel; `state` must read a signal that changes on every thread update. */
export function btwPanel(ui: ExtensionUiHost, state: () => BtwPanelState): UiNode {
	const running = () => state().turns.at(-1)?.status === "running";
	const rows = () => Math.max(3, Math.floor(ui.size().rows * PANEL_HEIGHT_RATIO) - 2);
	const thread = el("col", {
		gap: "sm",
		reveal: () => ({ at: "end", n: state().revision }),
		children: () => {
			const current = state();
			sendSheet("omp-tools-btw");
			return current.turns.map((turn, index) => turnNode(turn, index, current.toolsOpen));
		},
	});
	// omp's terminal painter for native /btw's role skips the head row and titles its box with `term.title`.
	return el("col", {
		role: "omp.overlay.btw",
		gap: "sm",
		term: { title: "/btw side question" },
		children: [
			el("row", {
				role: "omp.sheet.head",
				gap: "sm",
				align: "center",
				children: [
					() => running() && el("spinner", {}),
					el("text", {
						spans: [{ t: "/btw", s: "accent" }, { t: " side question · only you see the answers", s: "muted" }],
						truncate: "end",
						lines: 1,
					}),
				],
			}),
			scrollBox(thread, rows, "btw-thread", () => (state().toolsOpen ? "lastItem" : "end")),
			() => hintsRow(panelHints(state())),
		],
	});
}
