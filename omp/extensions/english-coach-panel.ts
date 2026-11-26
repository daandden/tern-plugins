import { type ExtensionUiHost, formatKeyHint } from "@oh-my-pi/pi-coding-agent";
import { nativeRendering, type UiNode } from "@oh-my-pi/pi-tui";
import { type Block, defineRolePainter } from "@oh-my-pi/pi-tui/term/paint";
import { truncate, visibleWidth } from "@oh-my-pi/pi-tui/text/width";
import type { TspPropNode, TspSpan } from "@oh-my-pi/pi-wire";
import type { CoachCorrection, CoachMistake, CoachSegment } from "./english-coach-diff";
import { el, interruptKeys, keycaps, scrollBox } from "./panel-layout";
import { sendSheet, ternNoteHeading } from "./tern-theme";

const PANEL_HEIGHT_RATIO = 0.4;

const SHEET_CSS = `
[data-role='omp-tools.english-coach.body'] { min-inline-size: 0; max-inline-size: 100%; font-family: var(--sans); white-space: pre-wrap; overflow-wrap: anywhere; }
[data-role='omp-tools.english-coach.diff'] { line-height: 1.75; }
[data-role='omp-tools.english-coach.diff'] :is(.sf-t-del, .sf-t-ins) { padding: 1px 2px; border-radius: 4px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
[data-role='omp-tools.english-coach.diff'] .sf-t-del { background: color-mix(in oklch, var(--sf-c-del) 11%, transparent); text-decoration-color: color-mix(in oklch, var(--sf-c-del) 70%, transparent); }
[data-role='omp-tools.english-coach.diff'] .sf-t-ins { background: color-mix(in oklch, var(--sf-c-ins) 13%, transparent); }
[data-role='omp-tools.english-coach.diff'] .sf-t-success { color: var(--sf-c-ins); font-weight: 600; }
[data-role='omp-tools.english-coach.change'] { cursor: help; }
[data-role='omp-tools.english-coach.change']:hover .sf-t-del { background: color-mix(in oklch, var(--sf-c-del) 24%, transparent); }
[data-role='omp-tools.english-coach.change']:hover .sf-t-ins { background: color-mix(in oklch, var(--sf-c-ins) 26%, transparent); }
[data-role='omp-tools.english-coach.mistakes'] { margin-top: 6px; gap: 3px; }`;

const FRAME_ROLE = "omp-tools.english-coach.frame";

// omp's terminal would stack the close row under the body; like the Tern keycap, the key ends the body's last line.
defineRolePainter("col", FRAME_ROLE, (node, cx): Block => {
	const [body, close] = node.children();
	const rows = body ? [...cx.paint(body, cx.width).rows] : [];
	const keys = (close?.children()[0]?.props() as { keys?: readonly string[] } | undefined)?.keys ?? [];
	if (keys.length === 0 || rows.length === 0) return { rows };
	const label = keys.join("+");
	const last = truncate(rows.pop()!, Math.max(0, cx.width - visibleWidth(label) - 1), "", true);
	rows.push(`${last} ${cx.theme.style("dim", label)}`);
	return { rows };
});

export interface CoachView {
	correction: CoachCorrection;
	cue?: string;
}

/** One mistake as a line: original → corrected (pattern). */
function mistakeSpans(mistake: CoachMistake): TspSpan[] {
	return [
		{ t: mistake.original, s: "muted" },
		{ t: " → ", s: "dim" },
		{ t: mistake.corrected, s: "strong" },
		{ t: ` (${mistake.pattern})`, s: "muted" },
	];
}

/** One change as the hover shows it: what it removed and what it added. */
type Change = { removed: string; added: string };

function changeOf(segments: readonly CoachSegment[]): Change {
	const join = (kinds: readonly CoachSegment["kind"][]) =>
		segments.filter(segment => kinds.includes(segment.kind)).map(segment => segment.text.trim()).join(" ");
	return { removed: join(["del"]), added: join(["ins", "punct"]) };
}

function changeText({ removed, added }: Change): string {
	return removed && added ? `${removed} → ${added}` : added ? `+ ${added}` : `− ${removed}`;
}

/** The card a change shows on hover: that change alone, then why, in the coach's language (one line per reported mistake it fixes). */
function hovercard({ removed, added }: Change, patterns: readonly string[]): TspPropNode {
	const fix: TspSpan[] = removed && added
		? [{ t: removed, s: "del" }, { t: " → ", s: "dim" }, { t: added, s: "ins" }]
		: added ? [{ t: "+ ", s: "dim" }, { t: added, s: "ins" }] : [{ t: removed, s: "del" }];
	return {
		k: "col",
		p: { gap: "xs" },
		c: [
			{ k: "text", p: { spans: fix, wrap: "word" } },
			...patterns.map((pattern): TspPropNode => ({ k: "text", p: { spans: [{ t: pattern }], wrap: "word" } })),
		],
	};
}

/** Edge spaces as no-break spaces: a line's pieces are separate boxes, and a box's trailing space would hang with no width. */
function keepEdges(spans: TspSpan[]): TspSpan[] {
	const first = spans[0];
	const last = spans.at(-1);
	if (first) first.t = first.t.replace(/^\s+/, space => "\u00a0".repeat(space.length));
	if (last) last.t = last.t.replace(/\s+$/, space => "\u00a0".repeat(space.length));
	return spans;
}

/**
 * A correction line as inline pieces, so each change can carry its own
 * hover: kept text one word per piece (so the line still wraps by word), and
 * each explained change one piece. Spaces end the piece before them, so no
 * wrapped line starts with one.
 */
function correctionLine(line: readonly CoachSegment[], mistakes: readonly CoachMistake[], key: string): UiNode {
	const pieces: { spans: TspSpan[]; note?: { change: Change; patterns: string[] } }[] = [];
	for (let index = 0; index < line.length;) {
		const segment = line[index]!;
		if (segment.change !== undefined && segment.mistakes?.length) {
			const own: CoachSegment[] = [];
			for (; index < line.length && line[index]!.change === segment.change; index++) own.push(line[index]!);
			pieces.push({
				spans: own.map(part => span(part.text, SPAN_TOKENS[part.kind])),
				note: { change: changeOf(own), patterns: segment.mistakes.map(mistake => mistakes[mistake]!.pattern) },
			});
			continue;
		}
		for (const word of segment.text.match(/\S+\s*|\s+/g) ?? []) {
			const piece = { spans: [span(word, SPAN_TOKENS[segment.kind])] };
			if (/^\s+$/.test(word) && pieces.length > 0) pieces.at(-1)!.spans.push(...piece.spans);
			else pieces.push(piece);
		}
		index++;
	}
	// omp's terminal row painter does not wrap, and a terminal has no hover, so it gets one wrapping text.
	if (!nativeRendering()) return el("text", { key, spans: pieces.flatMap(piece => piece.spans), wrap: "word" });
	return el("row", {
		key,
		wrap: true,
		gap: "none",
		align: "baseline",
		children: pieces.map(({ spans, note }, index) =>
			el("text", {
				key: String(index),
				spans: keepEdges(spans),
				wrap: "word",
				...(note
					? {
						role: "omp-tools.english-coach.change",
						title: `${changeText(note.change)}: ${note.patterns.join("; ")}`,
						hovercard: hovercard(note.change, note.patterns),
					}
					: {}),
			})),
	});
}

function correctionNodes({ correction, cue }: CoachView): UiNode[] {
	const listed = nativeRendering() ? [] : correction.mistakes;
	return [
		el("col", {
			role: "omp-tools.english-coach.diff",
			children: correction.lines.map((line, index) => correctionLine(line, correction.mistakes, `line:${index}`)),
		}),
		...(listed.length > 0
			? [el("col", {
				role: "omp-tools.english-coach.mistakes",
				children: listed.map(mistake => el("text", { spans: mistakeSpans(mistake), wrap: "word" })),
			})]
			: []),
		...(cue ? [el("text", { text: cue, tone: "muted", wrap: "word" })] : []),
	];
}

const SPAN_TOKENS: Record<CoachSegment["kind"], string | undefined> = {
	same: undefined,
	del: "del",
	ins: "ins",
	punct: "success",
	protected: "dim",
};

function span(t: string, s: string | undefined): TspSpan {
	return s ? { t, s } : { t };
}

/** The coach panel; `view` must be reactive (a signal or a function of one). */
export function englishCoachPanel(ui: ExtensionUiHost, view: () => CoachView, close: () => void): UiNode {
	const maxLines = () => Math.max(1, Math.floor(ui.size().rows * PANEL_HEIGHT_RATIO));
	const closeKey = el("row", {
		key: "close",
		role: "omp-tools.english-coach.close",
		align: "center",
		actions: { click: "close" },
		title: "Close",
		onAction: act => {
			if (act === "close") close();
		},
		children: () => {
			const key = interruptKeys()[0];
			if (!key) return [];
			return el("kbd", { keys: nativeRendering() ? keycaps(key) : [formatKeyHint(key)] });
		},
	});
	const body = el("col", {
		role: "omp-tools.english-coach.body",
		children: () => {
			sendSheet("omp-tools-english-coach", SHEET_CSS);
			return correctionNodes(view());
		},
	});
	const scroll = scrollBox(body, maxLines, "english-coach-body");
	return el("col", {
		role: () => nativeRendering() ? "omp.btw.note" : FRAME_ROLE,
		children: () => nativeRendering()
			? [ternNoteHeading("coach", "English correction", [closeKey]), scroll]
			: [scroll, closeKey],
	});
}
