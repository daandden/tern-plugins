import { nativeRendering } from "@oh-my-pi/pi-tui";
import { writeTerminalSequence } from "@oh-my-pi/pi-tui/driver/session";
import type { Theme } from "@oh-my-pi/pi-tui/theme/contract";
import { currentTheme } from "@oh-my-pi/pi-tui/theme/runtime";
import { PANEL_BODY_ROLE } from "./panel-layout";

// The doubled class outranks Tern 0.9.26's Reader overlay rule.
const ROOTS = ".sf-col.sf-col[data-role='omp.overlay.btw']:has([data-role^='omp-tools.'])";

const MARKDOWN_LIST_MARKER_GUTTER_CSS = `
.sf-list[data-role='${PANEL_BODY_ROLE}'] > .sf-list-scroll {
	margin-left: calc(-2 * var(--sf-cw));
	padding-left: calc(2 * var(--sf-cw));
}
`;

let themeCss: { theme: Theme; css: string } | undefined;

/**
 * Tern's palette variables repainted with the active omp theme on the plugin's
 * roots, so their surface, text, tones, rows, and diff marks use the omp
 * theme's colours, not Tern's own. Tern's tone and span classes read these
 * variables, so its built-in parts (keycaps, spinners, `ins`/`del` spans)
 * follow too.
 */
function ompThemeCss(theme: Theme): string {
	if (themeCss?.theme === theme) return themeCss.css;
	const fg = (token: string) => theme.hex(token);
	const panel = theme.hex("selectedBg");
	// An empty `text` token means the terminal's own foreground, which Tern's --t1 already is.
	const text = theme.has("text") ? `--t1: ${fg("text")};\n\t--tv-fg: ${fg("text")};` : "";
	const css = `
${ROOTS} {
	--raise: ${panel};
	--pop-bg: ${panel};
	${text}
	--t2: color-mix(in oklch, var(--t1), ${fg("muted")});
	--t3: ${fg("muted")};
	--t4: ${fg("dim")};
	--l1: color-mix(in oklch, var(--t1) 7%, transparent);
	--l2: color-mix(in oklch, var(--t1) 12%, transparent);
	--l3: color-mix(in oklch, var(--t1) 18%, transparent);
	--l4: color-mix(in oklch, var(--t1) 26%, transparent);
	--accent: ${fg("accent")};
	--accent-ink: ${fg("accent")};
	--sf-accent: ${fg("accent")};
	--sf-muted: ${fg("muted")};
	--sf-ok: ${fg("success")};
	--sf-warn: ${fg("warning")};
	--sf-bad: ${fg("error")};
	--sf-c-muted: ${fg("muted")};
	--sf-c-dim: ${fg("dim")};
	--sf-c-accent: ${fg("accent")};
	--sf-c-success: ${fg("success")};
	--sf-c-warning: ${fg("warning")};
	--sf-c-error: ${fg("error")};
	--sf-c-ins: ${fg("toolDiffAdded")};
	--sf-c-del: ${fg("toolDiffRemoved")};
	--sf-c-code: ${fg("mdCode")};
	--sf-c-link: ${fg("mdLink")};
	--sf-c-key: var(--t2);
	color: var(--t1);
	background: ${panel};
	-webkit-backdrop-filter: none;
	backdrop-filter: none;
}
`;
	themeCss = { theme, css };
	return css;
}

const messages = new Map<string, { theme: Theme; css: string; message: string }>();

function sheetMessage(name: string, css: string): string {
	const theme = currentTheme();
	const last = messages.get(name);
	if (last?.theme === theme && last.css === css) return last.message;
	const message = `\x1b_tsp;s;${JSON.stringify({ name, css: `${ompThemeCss(theme)}${MARKDOWN_LIST_MARKER_GUTTER_CSS}${css}` })}\x1b\\`;
	messages.set(name, { theme, css, message });
	return message;
}

// Sent on every draw: a sheet belongs to one Tern surface, and omp can open a new one.
export function sendSheet(name: string, css = ""): void {
	if (nativeRendering()) writeTerminalSequence(sheetMessage(name, css));
}
