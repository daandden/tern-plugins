import type { UiNode } from "@oh-my-pi/pi-tui";
import { stripControl } from "@oh-my-pi/pi-tui/text/sanitize";
import type { TspSpan } from "@oh-my-pi/pi-wire";
import type { Feedback, Home, Page, RulePage } from "./coach-dashboard";
import type { CoachPracticeTask, CoachSnapshot, CoachTrend } from "./coach-memory";
import { coachRule, coachRuleLabel, unclassified } from "./coach-rules";
import { el, hintsRow, type KeyHint } from "./panel-layout";
import { sendSheet } from "./tern-theme";

export const COACH_ROLE = "omp-tools.coach";
export const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
export const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });
const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const WEEK = 7 * 24 * 60 * 60 * 1000;

export function trendLabel(trend: CoachTrend): string {
	if (trend.kind === "small-sample") return "Too little data";
	const rounded = Math.round(trend.percentagePoints * 10) / 10;
	if (!rounded) return "0 pp";
	return rounded < 0 ? `↓ ${-rounded} pp` : `↑ ${rounded} pp`;
}

export function rankedRows(snapshot: CoachSnapshot) {
	const { focus } = snapshot;
	if (!focus?.pinned) return snapshot.rules.map(row => row.rule);
	return [focus.rule, ...snapshot.rules.flatMap(row => row.rule === focus.rule ? [] : [row.rule])];
}

/** A page's child; a falsy one draws nothing. */
type Part = UiNode | false | undefined | null | "";

const ROLE = (name: string) => `${COACH_ROLE}.${name}`;
const OK = "color-mix(in oklch, var(--sf-c-ins) 8%, transparent)";
const OK_RING = "color-mix(in oklch, var(--sf-c-ins) 26%, transparent)";
const MISS = "color-mix(in oklch, var(--sf-c-del) 8%, transparent)";
const MISS_RING = "color-mix(in oklch, var(--sf-c-del) 28%, transparent)";
const SHEET_CSS = `
[data-role='${COACH_ROLE}'] { gap: 16px; }
[data-role='${ROLE("stats")}'] { gap: 10px; }
[data-role='${ROLE("stats")}'] > * { flex: 1 1 0; min-width: 0; }
[data-role='${ROLE("big")}'] { font: 700 24px/1.1 var(--sans); }
[data-role='${ROLE("sub")}'] { font: 11.5px/1.4 var(--sans); }
[data-role='${ROLE("message")}'] { font: 13px/1.4 var(--sans); }
[data-role='${ROLE("focus")}'] { padding: 14px 16px; border-radius: 12px; background: rgb(from var(--accent) r g b/8%); box-shadow: inset 0 0 0 1px rgb(from var(--accent) r g b/26%); }
[data-role='${ROLE("focus")}'] > .sf-icon { flex: none; width: 22px; height: 22px; color: var(--accent); }
[data-role='${ROLE("rules")}'] { gap: 2px; }
[data-role='${ROLE("rules.head")}'] { padding: 0 12px 4px; font: 12px/1.4 var(--sans); }
:is([data-role='${ROLE("rule")}'], [data-role='${ROLE("rule.sel")}']) { padding: 8px 12px; border-radius: 9px; cursor: pointer; }
[data-role='${ROLE("rule")}']:hover { background: var(--l1); }
[data-role='${ROLE("rule.sel")}'] { background: var(--l2); }
:is([data-role='${ROLE("rule")}'], [data-role='${ROLE("rule.sel")}']) > .sf-icon { flex: none; color: var(--t3); }
[data-role='${ROLE("rule.sel")}'] > .sf-icon { color: var(--accent); }
[data-role='${ROLE("rule.name")}'] { flex: 0 0 16ch; min-width: 0; font: 14px/20px var(--sans); }
:is([data-role='${ROLE("rule")}'], [data-role='${ROLE("rule.sel")}']) > .sf-meter { flex: 1 1 120px; max-width: 220px; }
[data-role='${ROLE("rule.stat")}'] { flex: 1 1 auto; min-width: 0; font: 12px/20px var(--sans); }
[data-role='${ROLE("prose")}'] { font: 13.5px/1.6 var(--sans); color: var(--t1); }
[data-role='${ROLE("diff")}'] { gap: 10px; font: 15px/1.6 var(--sans); }
[data-role='${ROLE("diff")}'] .sf-t-del { text-decoration: line-through; background: color-mix(in oklch, var(--sf-c-del) 14%, transparent); padding: 1px 3px; border-radius: 4px; }
[data-role='${ROLE("diff")}'] .sf-t-ins { font-weight: 600; background: color-mix(in oklch, var(--sf-c-ins) 16%, transparent); padding: 1px 3px; border-radius: 4px; }
[data-role='${ROLE("diff.label")}'] { flex: 0 0 7ch; font: 11px/24px var(--sans); text-transform: uppercase; letter-spacing: 0.04em; }
:is([data-role='${ROLE("practice")}'], [data-role='${ROLE("result.ok")}']) { padding: 14px 16px; border-radius: 12px; background: ${OK}; box-shadow: inset 0 0 0 1px ${OK_RING}; }
:is([data-role='${ROLE("result.miss")}'], [data-role='${ROLE("warn")}']) { padding: 14px 16px; border-radius: 12px; background: ${MISS}; box-shadow: inset 0 0 0 1px ${MISS_RING}; }
:is([data-role='${ROLE("practice")}'], [data-role='${ROLE("result.ok")}']) > .sf-icon { flex: none; width: 20px; height: 20px; color: var(--sf-c-ins); }
:is([data-role='${ROLE("result.miss")}'], [data-role='${ROLE("warn")}']) > .sf-icon { flex: none; width: 20px; height: 20px; color: var(--sf-c-del); }
[data-role='${ROLE("prompt")}'] { font: 500 17px/1.5 var(--sans); color: var(--t1); }
[data-role='${ROLE("prompt")}'] .sf-t-accent { padding: 0 6px; border-radius: 5px; background: rgb(from var(--accent) r g b/16%); }
[data-role='${ROLE("choices")}'] { gap: 12px; }
.sf-button:is([data-role='${ROLE("choice")}'], [data-role='${ROLE("choice.right")}'], [data-role='${ROLE("choice.wrong")}']) { flex: 1 1 0; height: 56px; padding: 0 18px; justify-content: flex-start; font-size: 20px; }
.sf-button.sf-button[data-role='${ROLE("choice.right")}'] { color: var(--sf-c-ins); background: ${OK}; box-shadow: inset 0 0 0 1px ${OK_RING}; }
.sf-button.sf-button[data-role='${ROLE("choice.wrong")}'] { color: var(--sf-c-del); background: ${MISS}; box-shadow: inset 0 0 0 1px ${MISS_RING}; }
[data-role='${ROLE("foot")}'] { padding-top: 12px; box-shadow: inset 0 1px 0 var(--l2); }`;

function text(spans: TspSpan[], role?: string, wrap = false): UiNode {
	return el("text", { ...(role ? { role } : {}), spans, ...(wrap ? { wrap: "word" as const } : {}) });
}

/** A button that does what its key does: the root turns `key:<id>` back into that key. */
function button(label: string, key: string, options: { variant?: "primary" | "quiet" | "danger"; on?: boolean; icon?: string; disabled?: boolean; keys?: string[] } = {}): UiNode {
	return el("button", {
		key: `button-${key}`,
		text: label,
		keys: options.keys ?? [key === "escape" ? "esc" : key],
		size: "sm",
		actions: { click: `key:${key}` },
		...(options.variant ? { variant: options.variant } : {}),
		...(options.on ? { on: true } : {}),
		...(options.icon ? { icon: options.icon } : {}),
		...(options.disabled ? { disabled: true } : {}),
	});
}

function footer(hints: (KeyHint | false | undefined | null)[]): UiNode {
	return el("row", { key: "foot", role: ROLE("foot"), align: "center", children: [hintsRow(hints.filter(hint => !!hint))] });
}

function message(note: string | undefined): UiNode | undefined {
	return note ? text([{ t: note, s: "success" }], ROLE("message")) : undefined;
}

function stat(label: string, value: UiNode, sub: string): UiNode {
	return el("card", {
		key: `stat-${label}`,
		role: ROLE("stat"),
		head: [{ t: label, s: "muted" }],
		children: el("col", { gap: "xs", children: [value, text([{ t: sub, s: "dim" }], ROLE("sub"), true)] }),
	});
}

function share(period: { affectedPrompts: number; prompts: number }): number {
	return period.prompts ? period.affectedPrompts / period.prompts : 0;
}

function weekRow(label: string, period: { affectedPrompts: number; prompts: number }, current: boolean): UiNode {
	return el("row", {
		align: "center",
		gap: "sm",
		children: [
			text([{ t: label, s: "dim" }]),
			el("meter", {
				value: share(period),
				style: "bar",
				size: "sm",
				label: `${period.affectedPrompts}/${period.prompts}`,
				...(current ? {} : { parts: [{ value: share(period), token: "muted" }] }),
			}),
		],
	});
}

function trendTone(trend: CoachTrend | undefined): "success" | "error" | undefined {
	if (trend?.kind !== "comparison") return undefined;
	const rounded = Math.round(trend.percentagePoints * 10) / 10;
	return rounded < 0 ? "success" : rounded > 0 ? "error" : undefined;
}

function trendCaption(trend: CoachTrend): string {
	if (trend.kind === "small-sample") return "too little data yet";
	const tone = trendTone(trend);
	return tone === "success" ? "fewer prompts with fixes" : tone === "error" ? "more prompts with fixes" : "same as the week before";
}

function trendBadge(trend: CoachTrend | undefined): UiNode {
	if (!trend || trend.kind === "small-sample") return el("badge", { text: "too few" });
	const tone = trendTone(trend);
	return el("badge", { text: trendLabel(trend), ...(tone ? { tone } : {}) });
}

function homePage(page: Home): Part[] {
	const { snapshot } = page;
	const { focus, digest, prompts } = snapshot;
	const week = digest.latestWeek;
	const clean = week.prompts ? 1 - share(week) : null;
	const ranked = rankedRows(snapshot);
	const trendTextTone = trendTone(digest.trend);
	const stats = el("row", {
		key: "stats",
		role: ROLE("stats"),
		align: "stretch",
		children: [
			stat("Checked", el("row", { align: "baseline", gap: "sm", children: [
				text([{ t: String(prompts), s: "strong" }], ROLE("big")),
				text([{ t: prompts === 1 ? "prompt" : "prompts", s: "muted" }]),
			] }), "English prompts in total"),
			stat("Clean", el("row", { align: "center", gap: "sm", children: [
				el("meter", { value: clean, style: "ring", label: clean === null ? "—" : percent.format(clean) }),
				text([{ t: week.prompts ? `${week.prompts - week.affectedPrompts} of ${week.prompts}` : "no prompts", s: "muted" }]),
			] }), `nothing to fix, week of ${day.format(digest.from)}`),
			// The digest compares the last two whole weeks, so each row names the week it counts.
			stat("Weeks", el("col", { gap: "xs", children: [
				weekRow(day.format(digest.from), week, true),
				weekRow(day.format(digest.from - WEEK), digest.previousWeek, false),
			] }), "prompts with fixes"),
			stat("Trend", text(digest.trend.kind === "small-sample"
				? [{ t: "—", s: "dim" }]
				: [{ t: trendLabel(digest.trend), s: trendTextTone ?? "muted" }], ROLE("big")), trendCaption(digest.trend)),
		],
	});
	const focusIndex = focus ? ranked.indexOf(focus.rule) : -1;
	const focusCard = focus
		? el("row", {
			key: "focus",
			role: ROLE("focus"),
			align: "center",
			gap: "md",
			children: [
				el("icon", { name: "flame" }),
				el("col", { grow: 1, gap: "xs", children: [
					text([{ t: "Focus", s: "accent" }, { t: " · ", s: "dim" }, { t: coachRuleLabel(focus.rule), s: "strong" }, ...(focus.pinned ? [{ t: "  pinned", s: "dim" }] : [])]),
					text([{ t: focus.reason, s: "muted" }], ROLE("sub"), true),
				] }),
				focusIndex >= 0 && el("button", { key: "focus-open", text: "Open", size: "sm", actions: { click: `rule:${focusIndex}` } }),
				button("Practice", "p", { variant: "primary" }),
			],
		})
		: text([{ t: "No classified rule to recommend yet.", s: "muted" }], ROLE("message"));
	const rows = ranked.map((rule, index) => {
		const row = snapshot.rules.find(item => item.rule === rule);
		const selected = index === page.selected;
		const affected = row?.affectedPrompts ?? 0;
		const fixes = row?.occurrences ?? 0;
		return el("row", {
			key: `rule-${rule}`,
			role: ROLE(selected ? "rule.sel" : "rule"),
			align: "center",
			gap: "md",
			title: "Open this rule",
			actions: { click: `rule:${index}` },
			children: [
				el("icon", { name: "chev-r" }),
				text([{ t: coachRuleLabel(rule), s: selected ? "strong" : undefined }], ROLE("rule.name")),
				el("meter", { value: prompts ? affected / prompts : 0, style: "bar", size: "sm" }),
				text([{ t: `${affected}/${prompts} prompts · ${fixes} ${fixes === 1 ? "fix" : "fixes"}`, s: "muted" }], ROLE("rule.stat")),
				trendBadge(row?.trend),
			],
		});
	});
	return [
		message(page.message),
		stats,
		focusCard,
		el("col", { key: "rules", role: ROLE("rules"), children: [
			el("row", { role: ROLE("rules.head"), align: "center", children: [
				text([{ t: "Rules", s: "strong" }, { t: "  share of checked prompts", s: "dim" }]),
				el("spacer", { grow: 1 }),
				text([{ t: "this week vs the week before", s: "dim" }]),
			] }),
			...(rows.length ? rows : [text([{ t: prompts ? "No mistakes recorded." : "Check an English prompt to get started.", s: "muted" }], ROLE("message"))]),
		] }),
		footer([
			rows.length > 1 && { key: "↑↓", label: "select" },
			rows.length > 0 && { key: "enter", label: "open" },
			focus && { key: "p", label: "practice" },
			{ key: "r", label: "reset" },
			{ key: "escape", label: "close" },
		]),
	];
}

function tokens(words: string): string[] {
	return words.match(/\S+|\s+/g) ?? [];
}

/** A word diff of an example: what `before` lost and what `after` gained. */
export function exampleDiff(before: string, after: string): { before: TspSpan[]; after: TspSpan[] } {
	const a = tokens(before);
	const b = tokens(after);
	const lengths = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			lengths[i]![j] = a[i] === b[j] ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
		}
	}
	const out = { before: [] as TspSpan[], after: [] as TspSpan[] };
	const push = (list: TspSpan[], t: string, s?: string) => {
		const last = list.at(-1);
		if (last && last.s === s) last.t += t;
		else list.push(s ? { t, s } : { t });
	};
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			push(out.before, a[i]!);
			push(out.after, b[j]!);
			i++;
			j++;
		} else if (j < b.length && (i === a.length || lengths[i]![j + 1]! >= lengths[i + 1]![j]!)) {
			push(out.after, b[j]!, /^\s+$/.test(b[j]!) ? undefined : "ins");
			j++;
		} else {
			push(out.before, a[i]!, /^\s+$/.test(a[i]!) ? undefined : "del");
			i++;
		}
	}
	return out;
}

function rulePage(page: RulePage): Part[] {
	const { rule, detail } = page;
	const label = coachRuleLabel(rule);
	const clean = (words: string) => stripControl(words).replace(/\s+/g, " ").trim();
	const explanation = rule === unclassified
		? "These fixes did not match a known grammar rule. They count in your history but do not drive advice."
		: coachRule(rule).explanation;
	const example = detail.example;
	const exampleBody: UiNode[] = [];
	if (example) {
		exampleBody.push(el("row", { align: "center", gap: "sm", children: [
			el("badge", { text: date.format(example.at) }),
			el("spacer", { grow: 1 }),
			button("Not a mistake", "x", { variant: "danger" }),
		] }));
		if (example.words) {
			const diff = exampleDiff(clean(example.words.before) || "(nothing)", clean(example.words.after) || "(nothing)");
			exampleBody.push(el("col", { role: ROLE("diff"), children: [
				el("row", { align: "baseline", gap: "sm", children: [text([{ t: "before", s: "dim" }], ROLE("diff.label")), text(diff.before, undefined, true)] }),
				el("row", { align: "baseline", gap: "sm", children: [text([{ t: "after", s: "dim" }], ROLE("diff.label")), text(diff.after, undefined, true)] }),
			] }));
		} else {
			exampleBody.push(text([{ t: "No words kept for this fix.", s: "muted" }]));
		}
		if (detail.canGoOlder || detail.canGoNewer) {
			exampleBody.push(el("row", { gap: "sm", children: [
				button("Older", "left", { icon: "arrow-left", keys: ["←"], disabled: !detail.canGoOlder }),
				button("Newer", "right", { icon: "arrow-right", keys: ["→"], disabled: !detail.canGoNewer }),
			] }));
		}
	} else {
		exampleBody.push(text([{ t: "No fixes recorded for this rule.", s: "muted" }]));
	}
	const practice = detail.practice;
	const due = !!practice && practice.dueAt <= Date.now();
	return [
		message(page.message),
		el("card", { key: "how", head: [{ t: "How it works", s: "muted" }], children: text([{ t: explanation }], ROLE("prose"), true) }),
		el("card", { key: "example", head: [{ t: "Your example", s: "muted" }], children: el("col", { gap: "sm", children: exampleBody }) }),
		practice && el("row", {
			key: "practice",
			role: ROLE("practice"),
			align: "center",
			gap: "md",
			children: [
				el("icon", { name: "sparkle" }),
				el("col", { grow: 1, gap: "xs", children: [
					text([{ t: due ? "Practice is ready" : `Next practice: ${date.format(practice.dueAt)}`, s: "strong" }]),
					text([{ t: `Two-choice questions on ${label}.`, s: "muted" }], ROLE("sub"), true),
				] }),
				button(detail.pinned ? "Unpin focus" : "Pin as focus", "f", { icon: "pin", on: detail.pinned }),
				due && button("Start", "p", { variant: "primary" }),
			],
		}),
		footer([
			example && (detail.canGoOlder || detail.canGoNewer) && { key: "←→", label: "examples" },
			due && { key: "p", label: "practice" },
			practice && { key: "f", label: detail.pinned ? "unpin" : "pin" },
			example && { key: "x", label: "not a mistake" },
			{ key: "escape", label: "back" },
		]),
	];
}

function question(task: CoachPracticeTask): UiNode {
	const parts = task.prompt.split(/(_{2,})/);
	return text(parts.filter(Boolean).map(part => /^_{2,}$/.test(part) ? { t: part, s: "accent" } : { t: part }), ROLE("prompt"), true);
}

function practicePage(task: CoachPracticeTask, result?: Feedback): Part[] {
	const choices = task.choices.map((choice, index) => {
		const picked = result?.choice === index;
		const right = !!result && choice === result.answer;
		return el("button", {
			key: `choice-${index}`,
			role: ROLE(right ? "choice.right" : picked ? "choice.wrong" : "choice"),
			text: choice,
			keys: [String(index + 1)],
			actions: { click: `key:${index + 1}` },
			...(result && !right && !picked ? { disabled: true } : {}),
		});
	});
	const nodes: Part[] = [question(task), el("row", { key: "choices", role: ROLE("choices"), children: choices })];
	if (!result) {
		nodes.push(footer([{ key: "1", label: task.choices[0] }, { key: "2", label: task.choices[1] }, { key: "escape", label: "back" }]));
		return nodes;
	}
	nodes.push(el("row", {
		key: "result",
		role: ROLE(result.correct ? "result.ok" : "result.miss"),
		align: "start",
		gap: "md",
		children: [
			el("icon", { name: result.correct ? "check" : "x-circle" }),
			el("col", { grow: 1, gap: "xs", children: [
				text([result.correct ? { t: "Correct", s: "success" } : { t: `Not quite. Answer: ${result.answer}.`, s: "error" }]),
				text([{ t: result.explanation }], ROLE("prose"), true),
				text([{ t: `Next practice: ${date.format(result.dueAt)}`, s: "dim" }], ROLE("sub")),
			] }),
		],
	}));
	nodes.push(footer([{ key: "enter", label: "continue" }, { key: "escape", label: "back" }]));
	return nodes;
}

/** The popup's title for a page. */
export function coachHead(page: Page): TspSpan[] {
	switch (page.kind) {
		case "home": return [{ t: "English coach" }, { t: "  your English, week by week", s: "dim" }];
		case "rule": return [{ t: coachRuleLabel(page.rule) }, { t: page.detail.pinned ? "  rule · pinned focus" : "  rule", s: "dim" }];
		case "practice": return [{ t: "Practice" }, { t: `  ${coachRuleLabel(page.task.rule)}`, s: "dim" }];
		case "feedback": return [{ t: "Practice" }, { t: `  ${coachRuleLabel(page.task.rule)}`, s: "dim" }];
		case "reset": return [{ t: "Reset Coach memory" }];
		case "unavailable": return [{ t: "English coach" }];
	}
}

/** The popup's body for a page, in Tern. */
export function coachPage(page: Page): UiNode[] {
	sendSheet("omp-tools-coach", SHEET_CSS);
	const nodes = (() => {
		switch (page.kind) {
			case "home": return homePage(page);
			case "rule": return rulePage(page);
			case "practice": return practicePage(page.task);
			case "feedback": return practicePage(page.task, page);
			case "reset": return [
				el("row", { key: "warn", role: ROLE("warn"), align: "start", gap: "md", children: [
					el("icon", { name: "warn" }),
					el("col", { grow: 1, gap: "xs", children: [
						text([{ t: "Delete Coach memory?", s: "strong" }]),
						text([{ t: "This deletes your counts, examples, false-positive marks, pinned focus and practice in every pane. It does not change omp session files or provider records." }], ROLE("prose"), true),
					] }),
				] }),
				el("row", { key: "actions", gap: "sm", children: [el("spacer", { grow: 1 }), button("Keep", "escape"), button("Delete Coach memory", "y", { variant: "danger" })] }),
			];
			case "unavailable": return [
				el("row", { key: "warn", role: ROLE("warn"), align: "start", gap: "md", children: [
					el("icon", { name: "warn" }),
					el("col", { grow: 1, gap: "xs", children: [
						text([{ t: "Coach memory is unavailable.", s: "strong" }]),
						text([{ t: "The English coach can still show corrections. Close and reopen this view to try again." }], ROLE("prose"), true),
					] }),
				] }),
				footer([{ key: "escape", label: "close" }]),
			];
		}
	})();
	return nodes.filter((node): node is UiNode => !!node);
}
