import { canonicalKeyId, type ExtensionAPI, type ExtensionContext, getKeybindings } from "@oh-my-pi/pi-coding-agent";
import { type JSX, jsx, type UiNode } from "@oh-my-pi/pi-tui";
import { decodeInput } from "@oh-my-pi/pi-tui/driver/input/decoder";
import { terminalCapabilities } from "@oh-my-pi/pi-tui/driver/session";
import { type Block, defineRolePainter, type PaintContext } from "@oh-my-pi/pi-tui/term/paint";

// No JSX transform: omp maps only the pi-tui imports a plugin writes itself (omp 19.2.1).
export function el<K extends keyof JSX.IntrinsicElements>(kind: K, props: JSX.IntrinsicElements[K]): UiNode {
	return jsx(kind, props as Readonly<Record<string, unknown>>) as UiNode;
}

/** The `app.interrupt` keys a panel takes: Escape when the action has none, and never Ctrl+C, which omp keeps. */
export function interruptKeys(): readonly string[] {
	const keys = getKeybindings().keysFor("app.interrupt");
	return keys.length > 0 ? keys.filter(key => canonicalKeyId(key) !== "ctrl+c") : ["escape"];
}

// An omp-tools popup (the Side question reader, the coach dashboard) owns the keyboard while open, so
// no panel takes its Esc. Shared across module loads, as each extension loads this file on its own.
const OVERLAYS = Symbol.for("omp-tools.overlays");
const overlayHost = globalThis as unknown as Record<symbol, { open: number } | undefined>;
const overlays = overlayHost[OVERLAYS] ??= { open: 0 };

/** Marks an omp-tools popup open until the returned release runs (idempotent). */
export function holdOverlay(): () => void {
	overlays.open++;
	let held = true;
	return () => {
		if (!held) return;
		held = false;
		overlays.open--;
	};
}

/** Whether raw input is an interrupt key that a shown panel takes: the main editor is empty and no omp dialog or omp-tools popup waits. */
export function panelInterrupt(ctx: ExtensionContext, dialogOpen: () => boolean, data: string): boolean {
	if (overlays.open > 0 || dialogOpen() || ctx.ui.getEditorText().trim()) return false;
	const ids = interruptKeys().map(key => canonicalKeyId(key));
	return decodeInput(data, { kitty: terminalCapabilities().kittyKeyboard }).some(
		event => event.type === "key" && event.key.kind !== "release" && ids.includes(event.key.id),
	);
}

// omp 19.2.1 gives extensions no focus state, so a panel leaves Esc to omp's ask form and tool
// approval prompts while they wait.
export function trackHostDialogs(pi: ExtensionAPI): () => boolean {
	const waiting = new Set<string>();
	pi.on("tool_execution_start", event => {
		if (event.toolName === "ask") waiting.add(event.toolCallId);
	});
	pi.on("tool_execution_end", event => {
		waiting.delete(event.toolCallId);
	});
	pi.on("tool_approval_requested", event => {
		waiting.add(`approval:${event.toolCallId}`);
	});
	pi.on("tool_approval_resolved", event => {
		waiting.delete(`approval:${event.toolCallId}`);
	});
	pi.on("agent_end", () => {
		waiting.clear();
	});
	return () => waiting.size > 0;
}

export function keycaps(key: string): string[] {
	return key.endsWith("++") ? [...key.slice(0, -2).split("+"), "+"] : key.split("+");
}

export interface KeyHint {
	readonly key: string;
	readonly label: string;
}

export function hintsRow(hints: readonly KeyHint[]): UiNode {
	return el("row", {
		key: "hints",
		role: "omp.overlay.hints",
		gap: "md",
		wrap: true,
		children: hints.map(hint =>
			el("row", {
				align: "center",
				gap: "xs",
				children: [el("kbd", { keys: keycaps(hint.key) }), el("text", { spans: [{ t: hint.label, s: "muted" }] })],
			}),
		),
	});
}

// A list row includes another 6px, so 0.72 rows approximate one 16px text line.
const LIST_ROWS_PER_LINE = 0.72;

export const PANEL_BODY_ROLE = "omp-tools.panel-body";

/**
 * The part of a capped body a terminal shows: its start, its end, the end
 * moved up so the last item of the body's column shows from its first line,
 * or a row offset from the start (clamped to the end).
 */
export type PanelBodyView = "start" | "end" | "lastItem" | { offset: number };

interface PanelBodyTerm {
	readonly lines: number;
	readonly view: PanelBodyView;
}

// A capped Tern list scrolls; a capped column only clips. The terminal gets `term` instead.
export function scrollBox(content: UiNode, lines: () => number, key: string, view: () => PanelBodyView = () => "start"): UiNode {
	return el("list", {
		key,
		role: PANEL_BODY_ROLE,
		max: () => ({ lines: Math.max(1, Math.floor(lines() * LIST_ROWS_PER_LINE)) }),
		term: () => ({ lines: Math.max(1, lines()), view: view() }),
		children: content,
	});
}

function firstShownRow(node: UiNode, cx: PaintContext, rows: number, term: PanelBodyTerm): number {
	const end = rows - term.lines;
	if (typeof term.view === "object") return Math.min(Math.max(0, term.view.offset), end);
	if (term.view === "start") return 0;
	if (term.view === "end") return end;
	const last = node.children()[0]?.children().at(-1);
	// One row up: the marker then takes the gap row before that item, not its first line.
	return last ? Math.min(rows - cx.paint(last, cx.width).rows.length - 1, end) : end;
}

// omp's terminal list painter bullets each item and caps by items, so a terminal body gets the
// cut a scroll box cannot give it there: the lines that fit, with counts of the hidden ones.
defineRolePainter("list", PANEL_BODY_ROLE, (node, cx): Block => {
	const term = (node.props() as { term?: PanelBodyTerm }).term;
	const rows = node.children().flatMap(child => cx.paint(child, cx.width).rows);
	if (!term || rows.length <= term.lines) return { rows };
	const start = Math.max(0, firstShownRow(node, cx, rows.length, term));
	const end = start + term.lines;
	const shown = rows.slice(start, end);
	if (end < rows.length) shown[shown.length - 1] = cx.theme.style("dim", `… ${rows.length - end + 1} more lines`);
	if (start > 0 && shown.length > 1) shown[0] = cx.theme.style("dim", `… ${start + 1} earlier lines`);
	return { rows: shown };
});
