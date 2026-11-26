import { nativeRendering, type UiNode } from "@oh-my-pi/pi-tui";
import { writeTerminalSequence } from "@oh-my-pi/pi-tui/driver/session";
import { replaceTabs } from "@oh-my-pi/pi-tui/text/width";
import { el, PANEL_BODY_ROLE } from "./panel-layout";

const NOTE_HEADING_CSS = `
.sf-col[data-role='omp.btw.note']:has([data-role^='omp-tools.']) > .sf-row[data-role='omp.btw.note.head'] > .sf-text[data-role='omp.btw.note.question'] {
	min-width: 0;
	flex: 1;
	font-family: var(--sans);
}
`;

const MARKDOWN_LIST_MARKER_GUTTER_CSS = `
.sf-list[data-role='${PANEL_BODY_ROLE}'] > .sf-list-scroll {
	margin-left: calc(-2 * var(--sf-cw));
	padding-left: calc(2 * var(--sf-cw));
}
`;

const messages = new Map<string, { css: string; message: string }>();

function sheetMessage(name: string, css: string): string {
	const last = messages.get(name);
	if (last?.css === css) return last.message;
	const message = `\x1b_tsp;s;${JSON.stringify({ name, css: `${NOTE_HEADING_CSS}${MARKDOWN_LIST_MARKER_GUTTER_CSS}${css}` })}\x1b\\`;
	messages.set(name, { css, message });
	return message;
}

// Sent on every draw: a sheet belongs to one Tern surface, and omp can open a new one.
export function sendSheet(name: string, css = ""): void {
	if (nativeRendering()) writeTerminalSequence(sheetMessage(name, css));
}

export function ternNoteHeading(tag: string, title: string, actions?: UiNode[]): UiNode {
	return el("row", {
		key: "head",
		role: "omp.btw.note.head",
		align: "center",
		gap: "sm",
		children: [
			el("text", { role: "omp.btw.note.tag", spans: [{ s: "accent", t: tag }] }),
			el("text", {
				role: "omp.btw.note.question",
				spans: [{ t: replaceTabs(title).replace(/\s+/g, " ").trim() }],
				lines: 1,
				truncate: "end",
			}),
			actions?.length ? el("row", { role: "omp.btw.note.tools", align: "center", gap: "xs", children: actions }) : undefined,
		],
	});
}
