import { type ExtensionUiHost, formatKeyHint } from "@oh-my-pi/pi-coding-agent";
import { nativeRendering, UiNode } from "@oh-my-pi/pi-tui";
import { defineRolePainter, painterFor } from "@oh-my-pi/pi-tui/term/paint";
import { el, hintsRow, interruptKeys, type KeyHint, scrollBox } from "./panel-layout";
import { hasTurnDetails, latestAnswer, type SideQuestionTurn, ternTurnStatus, turnNode } from "./side-question-view";
import { sendSheet, ternNoteHeading } from "./tern-theme";

const PANEL_HEIGHT_RATIO = 0.4;
const CLASSIC_ROLE = "omp.overlay.btw";
const CLASSIC_RUNNING_ROLE = "omp-tools.btw-running";
const composerKeys = { copy: "c", fold: "f", details: "t" } as const;
const askKeys = { copy: "f7", fold: "f8", details: "f9" } as const;

export function btwPanelKeys(askFocused: boolean | undefined) {
	return askFocused ? askKeys : composerKeys;
}

interface BoxTerm {
	readonly title: string;
	readonly copied?: boolean;
}

const classicSheet = new UiNode("col", { role: CLASSIC_ROLE });
defineRolePainter("col", CLASSIC_RUNNING_ROLE, (node, cx) => {
	const paint = painterFor(classicSheet)!;
	// omp 19.2.1 skips the first child of the boxed sheet. Paint that spinner
	// first and pass its glyph in the terminal title that the host does use.
	const spinner = node.children()[0]!;
	const frame = cx.paint(spinner, cx.width).rows[0];
	if (!frame) return paint(node, cx);
	const props = node.props();
	const { term } = props as { term: BoxTerm };
	const title = `${Bun.stripANSI(frame)} ${term.title}`;
	const sheet = new UiNode(node.kind, {}, undefined, {
		...node,
		props: () => ({ ...props, term: { ...term, title } }),
	});
	return paint(sheet, cx);
});

export interface BtwPanelState {
	readonly turns: readonly SideQuestionTurn[];
	readonly toolsOpen: boolean;
	readonly folded?: boolean;
	readonly copied?: boolean;
	readonly fromAsk?: boolean;
	readonly askFocused?: boolean;
	/** Changes on every thread update, so Tern scrolls to the end again. */
	readonly revision: number;
}

export type BtwPanelAction = "btw-copy" | "btw-fold" | "btw-expand" | "btw-stop";

function panelHints(state: BtwPanelState, canCopy: boolean): KeyHint[] {
	const keys = btwPanelKeys(state.askFocused);
	const esc = state.askFocused ? undefined : interruptKeys()[0];
	const running = state.turns.at(-1)?.status === "running";
	const hints: KeyHint[] = [];
	if (!running && canCopy) hints.push({ key: keys.copy, label: state.copied ? "to copy again" : "to copy" });
	if (state.turns.some(hasTurnDetails)) {
		hints.push({ key: keys.details, label: state.toolsOpen ? "to fold details" : "to show details" });
	}
	hints.push({ key: keys.fold, label: "to fold" });
	if (running && (state.askFocused || state.fromAsk)) hints.push({ key: "ctrl+escape", label: "to cancel side question" });
	else if (esc) hints.push({ key: esc, label: running ? "to cancel" : "to close" });
	return hints;
}

function toolIcon(name: string, title: string, action: BtwPanelAction, run?: (action: BtwPanelAction) => void): UiNode {
	return el("icon", {
		key: action,
		role: "omp.btw.note.tool",
		name,
		aria: title,
		title,
		actions: { click: action },
		onAction: clicked => { if (clicked === action) run?.(action); },
	});
}

/** The `/btw` thread panel; `state` must read a signal that changes on every thread update. */
export function btwPanel(ui: ExtensionUiHost, state: () => BtwPanelState, run?: (action: BtwPanelAction) => void): UiNode {
	const title = () => state().turns[0]?.question.replace(/\s+/g, " ").trim() ?? "";
	const latest = () => state().turns.at(-1);
	const running = () => latest()?.status === "running";
	const canCopy = () => latestAnswer(state().turns) !== undefined;
	const rows = () => {
		const ratio = state().askFocused && nativeRendering() ? 0.24 : PANEL_HEIGHT_RATIO;
		return Math.max(3, Math.floor(ui.size().rows * ratio) - 2);
	};
	const thread = el("col", {
		gap: "sm",
		reveal: () => ({ at: "end", n: state().revision }),
		children: () => {
			const current = state();
			return current.turns.map((turn, index) => turnNode(turn, index, current.toolsOpen, nativeRendering()));
		},
	});
	const body = scrollBox(thread, rows, "btw-thread", () => (state().toolsOpen ? "lastItem" : "end"));
	return el("col", {
		role: () => state().folded ? undefined : nativeRendering() ? "omp.btw.note" : running() ? CLASSIC_RUNNING_ROLE : CLASSIC_ROLE,
		gap: "sm",
		term: () => ({ title: `/btw ${title()}`, copied: state().copied }),
		tone: () => !nativeRendering() && !state().folded
			? latest()?.status === "error" ? "error" : latest()?.status === "cancelled" ? "warning" : undefined
			: undefined,
		children: () => {
			const current = state();
			if (nativeRendering()) {
				sendSheet("omp-tools-btw");
				if (current.folded) {
					return el("row", {
						role: "omp.btw.note.folded",
						align: "center",
						gap: "sm",
						title: "Show this side answer",
						actions: { click: "btw-expand" },
						onAction: clicked => { if (clicked === "btw-expand") run?.(clicked); },
						children: [
							el("icon", { name: "chev-r" }),
							el("text", {
								role: "omp.btw.note.topic", lines: 1, truncate: "end",
								spans: [{ s: "accent", t: "btw" }, { t: `  ${title()}` }],
							}),
							running() && el("spinner", {}),
						],
					});
				}
				const actions = [toolIcon("x", "Fold to one line", "btw-fold", run)];
				if ((current.fromAsk || current.askFocused) && running()) actions.unshift(toolIcon("stop", "Cancel side question (Ctrl+Esc)", "btw-stop", run));
				if (canCopy()) actions.unshift(toolIcon(current.copied ? "check" : "copy", current.copied ? "Copied; copy again" : "Copy answer", "btw-copy", run));
				const last = latest();
				return [ternNoteHeading("btw", title(), actions), body, last && ternTurnStatus(last)];
			}
			if (current.folded) {
				const foldKey = current.askFocused ? formatKeyHint(askKeys.fold) : composerKeys.fold;
				return el("row", {
					gap: "sm",
					align: "center",
					children: [
						running() && el("spinner", {}),
						el("text", {
							lines: 1, truncate: "end",
							spans: [{ s: "accent", t: "/btw" }, { s: "muted", t: ` · ${foldKey} to unfold · ` }, { t: title() }],
						}),
					],
				});
			}
			const status = latest()?.status;
			const hints = hintsRow(panelHints(current, canCopy()));
			const badge = status === "error" ? { s: "error", t: "Error" }
				: status === "cancelled" ? { s: "warning", t: "Cancelled" }
					: current.copied ? { s: "success", t: "✓ Copied to clipboard" } : undefined;
			return [
				running() ? el("spinner", {}) : el("row", { role: "omp.sheet.head" }),
				body,
				badge ? el("row", { align: "center", gap: "md", wrap: true, children: [el("text", { spans: [badge] }), hints] }) : hints,
			];
		},
	});
}
