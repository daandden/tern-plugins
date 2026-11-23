import { type NativeNode, node } from "@oh-my-pi/pi-tui";
import type { NativeHint } from "@oh-my-pi/pi-tui/native/overlay";

export function keyLabel(key: string): string {
	if (key === "escape") return "esc";
	if (key === "pageUp") return "pgup";
	if (key === "pageDown") return "pgdn";
	return key;
}

export function hintText(hints: readonly NativeHint[]): string {
	return hints.map(hint => `${hint.keys.map(keyLabel).join(" or ")} ${hint.label}`).join("  ");
}

// A list row includes another 6px, so 0.72 rows approximate one 16px text line.
const LIST_ROWS_PER_LINE = 0.72;

// Give Markdown list markers room to hang left of the text without clipping.
export const SCROLL_BOX_CSS = `
.sf-list[data-role='omp-tools.ask-body'] > .sf-list-scroll {
	margin-left: calc(-2 * var(--sf-cw));
	padding-left: calc(2 * var(--sf-cw));
}
`;

// A capped Tern list scrolls; a capped column only clips.
export function scrollBox(content: NativeNode, lines: number, key: string): NativeNode {
	const rows = Math.max(1, Math.floor(lines * LIST_ROWS_PER_LINE));
	return node("list", { role: "omp-tools.ask-body", max: { lines: rows } }, [content], key);
}
