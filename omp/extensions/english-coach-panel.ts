import { type ExtensionUiHost, formatKeyHint } from "@oh-my-pi/pi-coding-agent";
import { nativeRendering, type UiNode } from "@oh-my-pi/pi-tui";
import { type Block, defineRolePainter } from "@oh-my-pi/pi-tui/term/paint";
import { truncate, visibleWidth } from "@oh-my-pi/pi-tui/text/width";
import type { TspPropNode, TspSpan } from "@oh-my-pi/pi-wire";
import type { CoachCorrection, CoachMistake, CoachSegment } from "./english-coach-diff";
import { el, interruptKeys, keycaps, scrollBox } from "./panel-layout";
import { sendSheet } from "./tern-theme";

const PANEL_HEIGHT_RATIO = 0.4;

// Removed and added words sit on soft tinted chips so their edges show; a
// change that explains itself on hover shows a help cursor and brightens.
// The close key floats over the frame's bottom-right corner on the panel's
// own colour, covering whatever text lies under it, centred on the last line:
// a plain line is about as tall as the key, and a diff line's 1.75 line height
// puts its middle 0.875em above the frame's bottom. The overlay role pads 16px
// above and 18px below (Tern 0.9.26), and the last line's descent adds about
// 3px more under the glyphs, so the panel trims its bottom padding to show the
// same space below the text as above it.
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
[data-role='omp-tools.english-coach.unplaced'] { margin-top: 6px; gap: 3px; }
[data-role='omp-tools.english-coach.frame'] { position: relative; }
[data-role^='omp-tools.english-coach.close'] { position: absolute; right: 0; bottom: 0; padding-left: 6px; background: var(--raise); }
[data-role='omp-tools.english-coach.close.diff'] { bottom: 0.875em; transform: translateY(50%); }
.sf-col.sf-col[data-role='omp.overlay.btw']:has([data-role='omp-tools.english-coach.frame']) { padding-bottom: 13px; }`;

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

/** What the panel shows: a running check, a clean prompt, a one-line note, or a marked-up correction. */
export type CoachView =
	| { kind: "checking" }
	| { kind: "clean" }
	| { kind: "note"; text: string }
	| { kind: "correction"; correction: CoachCorrection };

/** The one line a view without a correction shows. */
function notice(view: Exclude<CoachView, { kind: "correction" }>): string {
	switch (view.kind) {
		case "checking":
			return "Checking…";
		case "clean":
			return "No mistakes";
		case "note":
			return view.text;
	}
}

function noticeNode(view: Exclude<CoachView, { kind: "correction" }>): UiNode {
	const line = el("text", { spans: [{ t: notice(view), s: "muted" }], wrap: "word" });
	return view.kind === "checking"
		? el("row", { gap: "sm", align: "center", children: [el("spinner", {}), line] })
		: line;
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

function unplacedMistakes(correction: CoachCorrection): CoachMistake[] {
	const placed = new Set(correction.lines.flat().flatMap(segment => segment.mistakes ?? []));
	return correction.mistakes.filter((_, index) => !placed.has(index));
}

function mistakesOutsideHovers(correction: CoachCorrection): CoachMistake[] {
	return nativeRendering() ? unplacedMistakes(correction) : correction.mistakes;
}

function correctionNodes(correction: CoachCorrection): UiNode[] {
	const listed = mistakesOutsideHovers(correction);
	return [
		el("col", {
			role: "omp-tools.english-coach.diff",
			children: correction.lines.map((line, index) => correctionLine(line, correction.mistakes, `line:${index}`)),
		}),
		...(listed.length > 0
			? [el("col", {
				role: "omp-tools.english-coach.unplaced",
				children: listed.map(mistake => el("text", { spans: mistakeSpans(mistake), wrap: "word" })),
			})]
			: []),
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
	const endsInDiff = () => {
		const current = view();
		return current.kind === "correction" && mistakesOutsideHovers(current.correction).length === 0;
	};
	const body = el("col", {
		role: "omp-tools.english-coach.body",
		children: () => {
			sendSheet("omp-tools-english-coach", SHEET_CSS);
			const current = view();
			return current.kind === "correction" ? correctionNodes(current.correction) : [noticeNode(current)];
		},
	});
	return el("col", {
		// omp's terminal painter for this role draws a titled /btw sheet from a head, body and footer, which this panel lacks.
		role: () => (nativeRendering() ? "omp.overlay.btw" : undefined),
		children: el("col", {
			role: FRAME_ROLE,
			children: [
				scrollBox(body, maxLines, "english-coach-body"),
				el("row", {
					key: "close",
					role: () => (endsInDiff() ? "omp-tools.english-coach.close.diff" : "omp-tools.english-coach.close"),
					align: "center",
					actions: { click: "close" },
					title: "Close",
					onAction: act => {
						if (act === "close") close();
					},
					children: () => {
						const key = interruptKeys()[0];
						if (!key) return [];
						// A terminal's kbd painter joins raw key names, so it gets omp's own key hint instead.
						return el("kbd", { keys: nativeRendering() ? keycaps(key) : [formatKeyHint(key)] });
					},
				}),
			],
		}),
	});
}
