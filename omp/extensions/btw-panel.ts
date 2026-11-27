import { type ExtensionUiHost, formatKeyHint } from "@oh-my-pi/pi-coding-agent";
import { type KeyEvent, nativeRendering, signal, UiNode } from "@oh-my-pi/pi-tui";
import { defineRolePainter, painterFor } from "@oh-my-pi/pi-tui/term/paint";
import { replaceTabs } from "@oh-my-pi/pi-tui/text/width";
import { el, hintsRow, interruptKeys, type KeyHint, scrollBox } from "./panel-layout";
import { earlierTurnNode, hasTurnDetails, latestAnswer, type SideQuestionTurn, ternTurnStatus, turnElapsed, turnNode } from "./side-question-view";
import { sendSheet, ternNoteHeading } from "./tern-theme";

const PANEL_HEIGHT_RATIO = 0.4;
const READER_HEIGHT_RATIO = 0.7;
const CLASSIC_ROLE = "omp.overlay.btw";
const CLASSIC_RUNNING_ROLE = "omp-tools.btw-running";
const FOOT_ROLE = "omp-tools.btw.foot";
const composerKeys = { copy: "c", fold: "f", details: "t", read: "e" } as const;
const askKeys = { copy: "f7", fold: "f8", details: "f9", read: "f6" } as const;

export function btwPanelKeys(askFocused: boolean | undefined) {
	return askFocused ? askKeys : composerKeys;
}

// Tern draws the note's answer in its secondary text colour at 13.5px and hides
// the tool icons until hover. The panel is read, not glanced at, so it gets the
// primary colour, a reading size, and icons that stay visible.
const NOTE = `.sf-col[data-role='omp.btw.note']:has(> [data-role='${FOOT_ROLE}'])`;
const READER = "[data-role='omp-tools.btw.reader']";
const SHEET_CSS = `
${NOTE} { gap: 10px; padding: 14px 18px 12px; }
${NOTE} .sf-text[data-role='omp.btw.note.tag'] { padding: 0 7px; border-radius: 5px; background: rgb(from var(--accent) r g b/14%); }
${NOTE} .sf-text[data-role='omp.btw.note.question'] { font: 600 14px/20px var(--sans); color: var(--t1); }
${NOTE} .sf-row[data-role='omp.btw.note.tools'] { opacity: 1; }
${NOTE} .sf-row[data-role='omp.btw.note.tools'] > * { pointer-events: auto; }
:is(${NOTE}, ${READER}) .sf-col[data-role='omp.btw.note.turn'] > .sf-md:not([data-role]) .md,
:is(${NOTE}, ${READER}) .sf-col[data-role='omp.btw.note.turn'] > .sf-col > .sf-md .md { font: 14px/1.65 var(--sans); color: var(--t1); }
:is(${NOTE}, ${READER}) .sf-md[data-role='omp.btw.followup'] .md { font: 600 14px/20px var(--sans); color: var(--t1); }
:is(${NOTE}, ${READER}) .sf-md[data-role='omp.btw.followup'] { padding-left: 10px; box-shadow: inset 2px 0 0 var(--accent); }
[data-role='omp-tools.btw.meta'] { flex: none; font: 12px/20px var(--sans); color: var(--t3); }
[data-role='omp-tools.btw.earlier'] { padding: 4px 10px; border-radius: 8px; background: var(--l1); color: var(--t3); }
[data-role='${FOOT_ROLE}'] { padding-top: 10px; box-shadow: inset 0 1px 0 rgb(from var(--accent) r g b/14%); font: 12px/1.4 var(--sans); color: var(--t3); }
[data-role='omp-tools.btw.private'] { color: var(--t3); }
${READER} { gap: 14px; }
[data-role='omp-tools.btw.reader.turn'] { gap: 8px; }
[data-role='omp-tools.btw.reader.turn'] + [data-role='omp-tools.btw.reader.turn'] { padding-top: 14px; box-shadow: inset 0 1px 0 var(--l2); }
[data-role='omp-tools.btw.reader.question'] { font: 600 14px/20px var(--sans); color: var(--t1); }`;

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

export type BtwPanelAction = "btw-copy" | "btw-fold" | "btw-expand" | "btw-stop" | "btw-read" | "btw-close";

function cancelKey(state: BtwPanelState, running: boolean): KeyHint | undefined {
	if (running && (state.askFocused || state.fromAsk)) return { key: "ctrl+escape", label: "to cancel side question" };
	const esc = state.askFocused ? undefined : interruptKeys()[0];
	return esc ? { key: esc, label: running ? "to cancel" : "to close" } : undefined;
}

function panelHints(state: BtwPanelState, canCopy: boolean): KeyHint[] {
	const keys = btwPanelKeys(state.askFocused);
	const running = state.turns.at(-1)?.status === "running";
	const hints: KeyHint[] = [{ key: keys.read, label: "to read all" }];
	if (!running && canCopy) hints.push({ key: keys.copy, label: state.copied ? "to copy again" : "to copy" });
	if (state.turns.some(hasTurnDetails)) {
		hints.push({ key: keys.details, label: state.toolsOpen ? "to fold details" : "to show details" });
	}
	hints.push({ key: keys.fold, label: "to fold" });
	const cancel = cancelKey(state, running);
	if (cancel) hints.push(cancel);
	return hints;
}

/** The Tern footer's hints: short labels, as the keycaps carry the keys. */
function ternHints(state: BtwPanelState, canCopy: boolean): KeyHint[] {
	const keys = btwPanelKeys(state.askFocused);
	const running = state.turns.at(-1)?.status === "running";
	const hints: KeyHint[] = [{ key: keys.read, label: "read" }];
	if (!running && canCopy) hints.push({ key: keys.copy, label: state.copied ? "copied" : "copy" });
	hints.push({ key: keys.fold, label: "fold" });
	const cancel = cancelKey(state, running);
	if (cancel) hints.push({ key: cancel.key, label: running ? "cancel" : "close" });
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

function elapsedNode(turn: SideQuestionTurn | undefined, earlier: number): UiNode | undefined {
	if (!turn) return undefined;
	const age = turnElapsed(turn);
	return el("row", {
		key: "meta",
		role: "omp-tools.btw.meta",
		align: "center",
		gap: "xs",
		children: [
			earlier > 0 && el("text", { spans: [{ t: `${earlier} earlier ·`, s: "dim" }] }),
			el("elapsed", { age, ...(turn.status === "running" ? {} : { stopped: age }), format: "short" }),
		],
	});
}

function privateNote(): UiNode {
	return el("row", {
		key: "private",
		role: "omp-tools.btw.private",
		align: "center",
		gap: "xs",
		children: [el("icon", { name: "lock" }), el("text", { spans: [{ t: "Private · the agent never sees this", s: "dim" }] })],
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
			if (!nativeRendering()) return current.turns.map((turn, index) => turnNode(turn, index, current.toolsOpen));
			// The latest answer is the one being read; earlier ones fold to a line each and open in place.
			const last = current.turns.length - 1;
			return current.turns.map((turn, index) =>
				index < last ? earlierTurnNode(turn, index, current.toolsOpen) : turnNode(turn, index, current.toolsOpen, true));
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
				sendSheet("omp-tools-btw", SHEET_CSS);
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
				const keys = btwPanelKeys(current.askFocused);
				const actions = [toolIcon("expand", `Read the whole thread (${formatKeyHint(keys.read)})`, "btw-read", run)];
				if (canCopy()) actions.push(toolIcon(current.copied ? "check" : "copy", current.copied ? "Copied; copy again" : `Copy answer (${formatKeyHint(keys.copy)})`, "btw-copy", run));
				if ((current.fromAsk || current.askFocused) && running()) actions.push(toolIcon("stop", "Cancel side question (Ctrl+Esc)", "btw-stop", run));
				actions.push(toolIcon("minus", `Fold to one line (${formatKeyHint(keys.fold)})`, "btw-fold", run));
				if (!current.askFocused) actions.push(toolIcon("x", running() ? "Cancel" : "Close", "btw-close", run));
				const last = latest();
				return [
					ternNoteHeading("btw", title(), actions, { lines: 2, meta: elapsedNode(last, current.turns.length - 1) }),
					body,
					last && ternTurnStatus(last),
					el("row", {
						key: "foot",
						role: FOOT_ROLE,
						align: "center",
						gap: "md",
						children: [privateNote(), el("spacer", { grow: 1 }), hintsRow(ternHints(current, canCopy()))],
					}),
				];
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

function readerTurn(turn: SideQuestionTurn, index: number, detailsOpen: boolean, native: boolean): UiNode {
	const question = replaceTabs(turn.question).replace(/\s+/g, " ").trim();
	const age = turnElapsed(turn);
	return el("col", {
		key: `reader-${index}`,
		role: native ? "omp-tools.btw.reader.turn" : undefined,
		gap: "xs",
		children: [
			el("row", {
				align: "start",
				gap: "sm",
				children: [
					el("text", { role: "omp.btw.note.tag", spans: [{ s: "accent", t: native ? "you" : "›" }] }),
					el("text", { role: "omp-tools.btw.reader.question", wrap: "word", grow: 1, spans: [{ t: question, s: native ? undefined : "strong" }] }),
					native && el("elapsed", { role: "omp-tools.btw.meta", age, ...(turn.status === "running" ? {} : { stopped: age }), format: "short" }),
				],
			}),
			turnNode(turn, 0, detailsOpen, native),
		],
	});
}

/**
 * The whole thread in a popup, for answers too long for the panel. It reads the
 * same `state` as the panel, so a running answer keeps streaming into it.
 */
export function btwReader(ui: ExtensionUiHost, state: () => BtwPanelState, run: (action: BtwPanelAction) => void, close: () => void): UiNode {
	const offset = signal(0);
	const rows = () => Math.max(4, Math.floor(ui.size().rows * READER_HEIGHT_RATIO) - 4);
	const canCopy = () => latestAnswer(state().turns) !== undefined;
	const onKey = (key: KeyEvent): boolean => {
		if (key.kind === "release") return true;
		const step = key.id === "up" || key.id === "down" ? 1 : key.id === "pageUp" || key.id === "pageDown" ? Math.max(1, rows() - 1) : 0;
		if (step) offset.set(Math.max(0, offset.peek() + (key.id === "up" || key.id === "pageUp" ? -step : step)));
		else if (key.id === "home") offset.set(0);
		else if (key.id === "end") offset.set(Number.MAX_SAFE_INTEGER);
		else if (key.id === "c") run("btw-copy");
		else if (key.id === "escape" || key.id === "q" || key.id === "e") close();
		return true;
	};
	const thread = el("col", {
		gap: "md",
		children: () => {
			const current = state();
			return current.turns.map((turn, index) => readerTurn(turn, index, true, nativeRendering()));
		},
	});
	const body = scrollBox(thread, rows, "btw-reader", () => ({ offset: offset() }));
	const hints = () => {
		const list: KeyHint[] = [];
		if (!nativeRendering()) list.push({ key: "↑↓", label: "scroll" });
		if (canCopy()) list.push({ key: "c", label: state().copied ? "copied" : "copy" });
		list.push({ key: "escape", label: "close" });
		return hintsRow(list);
	};
	if (!nativeRendering()) {
		return el("col", {
			role: CLASSIC_ROLE,
			gap: "sm",
			term: () => ({ title: `/btw · ${state().turns.length} ${state().turns.length === 1 ? "turn" : "turns"}`, copied: state().copied }),
			onKey,
			children: () => [el("row", { role: "omp.sheet.head" }), body, hints()],
		});
	}
	return el("overlay", {
		anchor: "center",
		size: "lg",
		modal: true,
		head: () => [{ t: "Side question" }, { t: `  ${state().turns.length} ${state().turns.length === 1 ? "turn" : "turns"} · private`, s: "dim" }],
		children: el("col", {
			role: "omp-tools.btw.reader",
			onKey,
			children: () => {
				sendSheet("omp-tools-btw", SHEET_CSS);
				return [body, el("row", { key: "foot", role: FOOT_ROLE, align: "center", gap: "md", children: [privateNote(), el("spacer", { grow: 1 }), hints()] })];
			},
		}),
	});
}
