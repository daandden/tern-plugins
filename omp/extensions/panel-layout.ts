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

export const PANEL_BODY_ROLE = "omp-tools.panel-body";

// A capped Tern list scrolls; a capped column only clips.
export function scrollBox(content: NativeNode, lines: number, key: string): NativeNode {
	const rows = Math.max(1, Math.floor(lines * LIST_ROWS_PER_LINE));
	return node("list", { role: PANEL_BODY_ROLE, max: { lines: rows } }, [content], key);
}
