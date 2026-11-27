import type { ExtensionAPI, ExtensionOverlayHandle, ExtensionUiHost } from "@oh-my-pi/pi-coding-agent";
import { type KeyEvent, nativeRendering, type UiNode, signal } from "@oh-my-pi/pi-tui";
import { stripControl } from "@oh-my-pi/pi-tui/text/sanitize";
import { truncate, wrap } from "@oh-my-pi/pi-tui/text/width";
import { COACH_ROLE, coachHead, coachPage, date, percent, rankedRows, trendLabel } from "./coach-dashboard-view";
import { type CoachMemory, type CoachPracticeTask, type CoachRuleDetail, type CoachSnapshot, openCoachMemory } from "./coach-memory";
import { type RecordedCoachRule, coachRule, coachRuleLabel, unclassified } from "./coach-rules";
import { el, holdOverlay } from "./panel-layout";

type Tone = "accent" | "muted" | "success" | "warning";
interface Line {
	text: string;
	tone?: Tone;
}

export interface Home {
	kind: "home";
	snapshot: CoachSnapshot;
	selected: number;
	message?: string;
}

export interface RulePage {
	kind: "rule";
	rule: RecordedCoachRule;
	detail: CoachRuleDetail;
	message?: string;
}

export interface Feedback {
	kind: "feedback";
	task: CoachPracticeTask;
	choice: 0 | 1;
	correct: boolean;
	answer: string;
	explanation: string;
	dueAt: number;
}

export type Page = Home | RulePage | Feedback
	| { kind: "reset"; home: Home }
	| { kind: "practice"; task: CoachPracticeTask; returnTo: RulePage }
	| { kind: "unavailable" };

interface Body {
	lines: Line[];
	selectedLine?: number;
}

const unavailable: Page = { kind: "unavailable" };

function homeBody(page: Home): Body {
	const { snapshot, message } = page;
	const { focus, digest, prompts } = snapshot;
	const lines: Line[] = [];
	if (message) lines.push({ text: message, tone: "success" });
	lines.push({ text: "Focus", tone: "accent" });
	if (focus) lines.push({ text: `${coachRuleLabel(focus.rule)}. ${focus.reason}` });
	else lines.push({ text: "No classified rule to recommend yet.", tone: "muted" });

	lines.push({ text: "" }, { text: "Observed frequency", tone: "accent" });
	lines.push({ text: `${prompts} checked English ${prompts === 1 ? "prompt" : "prompts"} in total.`, tone: "muted" });
	const rules = rankedRows(snapshot);
	let selectedLine: number | undefined;
	if (!rules.length) lines.push({ text: prompts ? "No mistakes recorded." : "Check an English prompt to get started." });
	for (const [index, rule] of rules.entries()) {
		const row = snapshot.rules.find(item => item.rule === rule);
		const selected = index === page.selected;
		if (selected) selectedLine = lines.length;
		lines.push({ text: `${selected ? "› " : "  "}${coachRuleLabel(rule)}`, tone: selected ? "accent" : undefined });
		const affected = row?.affectedPrompts ?? 0;
		const fixes = row?.occurrences ?? 0;
		const share = prompts ? ` (${percent.format(affected / prompts)})` : "";
		lines.push({ text: `  ${affected}/${prompts} prompts${share} · ${fixes} ${fixes === 1 ? "fix" : "fixes"}`, tone: "muted" });
		const latest = row?.latestWeek ?? { affectedPrompts: 0, prompts: digest.latestWeek.prompts };
		const previous = row?.previousWeek ?? { affectedPrompts: 0, prompts: digest.previousWeek.prompts };
		const trend = row?.trend ?? { kind: "small-sample" };
		lines.push({
			text: `  Week: ${latest.affectedPrompts}/${latest.prompts} vs ${previous.affectedPrompts}/${previous.prompts} · ${trendLabel(trend)}`,
			tone: "muted",
		});
	}

	lines.push({ text: "" }, { text: "Weekly digest", tone: "accent" });
	lines.push({ text: `${date.format(digest.from)} to ${date.format(digest.until - 1)}` });
	const last = digest.latestWeek;
	const prior = digest.previousWeek;
	lines.push({ text: `Prompts with fixes: ${last.affectedPrompts}/${last.prompts}, vs ${prior.affectedPrompts}/${prior.prompts} the week before.` });
	lines.push({ text: `Change: ${trendLabel(digest.trend)}.`, tone: "muted" });
	if (digest.mostFrequent) lines.push({ text: `Most frequent classified rule last week: ${coachRuleLabel(digest.mostFrequent)}.` });
	lines.push({ text: "" }, { text: "R  Reset Coach memory", tone: "muted" });
	return { lines, selectedLine };
}

function ruleBody(page: RulePage): Body {
	const { rule, detail, message } = page;
	const lines: Line[] = [{ text: coachRuleLabel(rule), tone: "accent" }];
	if (message) lines.push({ text: message, tone: "success" });
	lines.push({ text: rule === unclassified
		? "These fixes did not match a known grammar rule. They count in your history but do not drive advice."
		: coachRule(rule).explanation });
	lines.push({ text: "" }, { text: "Your examples", tone: "accent" });
	if (detail.example) {
		const { words, at } = detail.example;
		lines.push({ text: date.format(at), tone: "muted" });
		if (words) {
			const clean = (text: string) => stripControl(text).replace(/\s+/g, " ").trim() || "(nothing)";
			lines.push({ text: `Before: ${clean(words.before)}` }, { text: `After:  ${clean(words.after)}` });
		} else {
			lines.push({ text: "No words kept for this fix.", tone: "muted" });
		}
		if (detail.canGoOlder) lines.push({ text: "←  Older example", tone: "muted" });
		if (detail.canGoNewer) lines.push({ text: "→  Newer example", tone: "muted" });
		lines.push({ text: "X  Mark this fix as not a mistake", tone: "muted" });
	} else {
		lines.push({ text: "No fixes recorded for this rule.", tone: "muted" });
	}
	if (detail.practice) {
		lines.push({ text: "" }, { text: "Practice", tone: "accent" });
		lines.push(detail.practice.dueAt <= Date.now()
			? { text: "P  Start a practice question" }
			: { text: `Next practice: ${date.format(detail.practice.dueAt)}`, tone: "muted" });
		lines.push({ text: `F  ${detail.pinned ? "Unpin focus" : "Pin as focus"}`, tone: "muted" });
	}
	return { lines };
}

function body(page: Page): Body {
	switch (page.kind) {
		case "home": return homeBody(page);
		case "rule": return ruleBody(page);
		case "practice": return { lines: [
			{ text: `Practice: ${coachRuleLabel(page.task.rule)}`, tone: "accent" },
			{ text: page.task.prompt }, { text: "" },
			{ text: `1  ${page.task.choices[0]}` }, { text: `2  ${page.task.choices[1]}` },
		] };
		case "feedback": return { lines: [
			page.correct ? { text: "Correct", tone: "success" } : { text: `Not quite. Answer: ${page.answer}.`, tone: "warning" },
			{ text: page.explanation },
			{ text: `Next practice: ${date.format(page.dueAt)}`, tone: "muted" },
		] };
		case "reset": return { lines: [
			{ text: "Delete Coach memory?", tone: "warning" },
			{ text: "This deletes your counts, examples, false-positive marks, pinned focus and practice in every pane. It does not change omp session files or provider records." },
			{ text: "" }, { text: "Y  Delete Coach memory" }, { text: "Esc  Keep Coach memory" },
		] };
		case "unavailable": return { lines: [
			{ text: "Coach memory is unavailable.", tone: "warning" },
			{ text: "The English coach can still show corrections. Close and reopen this view to try again." },
		] };
	}
}

function visibleBody(body: Body, width: number, height: number, scroll: number, followSelection: boolean) {
	const rows: Line[] = [];
	let selected: { start: number; end: number } | undefined;
	for (const [index, line] of body.lines.entries()) {
		const start = rows.length;
		for (const text of line.text ? wrap(line.text, width) : [""]) rows.push({ text, tone: line.tone });
		if (body.selectedLine === index) selected = { start, end: rows.length };
	}
	const maxScroll = Math.max(0, rows.length - height);
	let offset = Math.min(scroll, maxScroll);
	if (followSelection && selected) {
		if (selected.start < offset) offset = selected.start;
		else if (selected.end > offset + height) offset = Math.min(selected.start, selected.end - height);
	}
	return { rows: rows.slice(offset, offset + height), offset, maxScroll };
}

function dashboard(ui: ExtensionUiHost, initial: Page, done: () => void, memory: CoachMemory | undefined) {
	const view = signal({ page: initial, scroll: 0, followSelection: false });
	let visible = { offset: 0, maxScroll: 0, height: 1 };
	const go = (page: Page) => view.set({ page, scroll: 0, followSelection: false });
	function home(message?: string, activeRule?: RecordedCoachRule): void {
		if (!memory) return go(unavailable);
		const snapshot = memory.snapshot();
		const selected = Math.max(0, activeRule === undefined ? 0 : rankedRows(snapshot).indexOf(activeRule));
		view.set({ page: { kind: "home", snapshot, selected, message }, scroll: 0, followSelection: activeRule !== undefined });
	}
	function rulePage(rule: RecordedCoachRule, message?: string): void {
		if (memory) go({ kind: "rule", rule, detail: memory.ruleDetail(rule), message });
	}
	function generationOf(page: Page): string | undefined {
		switch (page.kind) {
			case "home": return page.snapshot.generation;
			case "rule": return page.detail.generation;
			case "reset": return page.home.snapshot.generation;
			case "practice": return page.task.generation;
			case "feedback": return page.task.generation;
			case "unavailable": return undefined;
		}
	}
	function refreshGeneration(): boolean {
		const generation = generationOf(view.peek().page);
		if (memory && generation && memory.beginCheck() !== generation) {
			home("Coach memory was reset in another pane.");
			return true;
		}
		return false;
	}
	function onKey(input: KeyEvent): boolean {
		if (input.kind === "release" || input.afterPaste) return true;
		const key = input.id;
		const { page } = view.peek();
		if (key === "escape" && (page.kind === "home" || page.kind === "unavailable")) {
			done();
			return true;
		}
		if (!memory) return true;
		try {
			if (refreshGeneration()) return true;
			if (key === "pageUp" || key === "pageDown" || (page.kind !== "home" && (key === "up" || key === "down"))) {
				const step = key === "up" || key === "down" ? 1 : Math.max(1, visible.height - 1);
				const scroll = visible.offset + (key === "up" || key === "pageUp" ? -step : step);
				view.set({ page, scroll: Math.max(0, Math.min(visible.maxScroll, scroll)), followSelection: false });
				return true;
			}
			switch (page.kind) {
				case "home": {
					const rules = rankedRows(page.snapshot);
					const rule = rules[page.selected];
					if (key === "up" || key === "down") {
						const selected = Math.max(0, Math.min(rules.length - 1, page.selected + (key === "up" ? -1 : 1)));
						view.set({ page: { ...page, selected }, scroll: visible.offset, followSelection: true });
					} else if (key === "enter" && rule !== undefined) rulePage(rule);
					else if (key === "p" && page.snapshot.focus) {
						const focus = page.snapshot.focus.rule;
						const target: RulePage = { kind: "rule", rule: focus, detail: memory.ruleDetail(focus) };
						const task = target.detail.practice;
						go(task && task.dueAt <= Date.now() ? { kind: "practice", task, returnTo: target } : target);
					} else if (key === "r") go({ kind: "reset", home: page });
					break;
				}
				case "rule": {
					const { rule, detail } = page;
					if (key === "escape") home(undefined, rule);
					else if (key === "left" && detail.example && detail.canGoOlder) {
						go({ kind: "rule", rule, detail: memory.ruleDetail(rule, { before: detail.example.id }) });
					} else if (key === "right" && detail.example && detail.canGoNewer) {
						go({ kind: "rule", rule, detail: memory.ruleDetail(rule, { after: detail.example.id }) });
					} else if (key === "f" && rule !== unclassified && input.kind === "press") {
						const saved = memory.setPinnedFocus(detail.pinned ? undefined : rule, detail.generation);
						rulePage(rule, saved ? (detail.pinned ? "Focus unpinned." : "Focus pinned.") : "Coach memory changed.");
					} else if (key === "x" && detail.example && input.kind === "press") {
						const marked = memory.markNotMistake(detail.example.id, detail.generation);
						rulePage(rule, marked ? "Removed this fix from your counts." : "This fix is no longer in your counts.");
					} else if (key === "p" && detail.practice) {
						const fresh = memory.ruleDetail(rule).practice;
						if (fresh && fresh.dueAt <= Date.now()) go({ kind: "practice", task: fresh, returnTo: page });
						else rulePage(rule);
					}
					break;
				}
				case "practice":
					if (key === "escape") go(page.returnTo);
					else if ((key === "1" || key === "2") && input.kind === "press") {
						const result = memory.answerPractice(page.task, key === "1" ? 0 : 1);
						if (!result) rulePage(page.task.rule, "Practice changed in another pane.");
						else go({ kind: "feedback", task: page.task, choice: key === "1" ? 0 : 1, ...result });
					}
					break;
				case "feedback":
					if (key === "escape" || key === "enter") rulePage(page.task.rule);
					break;
				case "reset":
					if (key === "escape") go(page.home);
					else if (key === "y" && input.kind === "press") {
						const reset = memory.reset(page.home.snapshot.generation);
						home(reset ? "Coach memory reset." : "Coach memory was reset in another pane.");
					}
					break;
				case "unavailable": break;
			}
		} catch {
			go(unavailable);
		}
		return true;
	}
	// A key a click stands for: the popup's buttons send `key:<id>`, so a click does what its key does.
	const press = (id: string) => onKey({ id, kind: "press", raw: "" } as KeyEvent);
	const onAction = (act: string): void => {
		if (act.startsWith("key:")) press(act.slice(4));
		else if (act.startsWith("rule:")) {
			const { page } = view.peek();
			if (page.kind !== "home") return;
			const selected = Number(act.slice(5));
			view.set({ page: { ...page, selected }, scroll: 0, followSelection: false });
			press("enter");
		}
	};
	const node = nativeRendering()
		? el("overlay", {
			anchor: "center",
			size: "lg",
			modal: true,
			head: () => coachHead(view().page),
			children: el("col", { role: COACH_ROLE, onKey, onAction, children: () => coachPage(view().page) }),
		})
		: el("col", {
			role: "omp-tools.coach-dashboard",
			onKey,
			children: () => {
				const { page, scroll, followSelection } = view();
				const size = ui.size();
				const indent = size.columns >= 30 ? "  " : "";
				const width = Math.max(1, Math.min(78, size.columns - indent.length * 2));
				const height = Math.max(1, size.rows - (size.rows >= 3 ? 2 : 1));
				const { rows, offset, maxScroll } = visibleBody(body(page), width, height, scroll, followSelection);
				visible = { offset, maxScroll, height };
				const hints = page.kind === "home" ? `Esc Close · ↑↓ Select · Enter Open${page.snapshot.focus ? " · P Practice" : ""} · R Reset`
					: page.kind === "unavailable" ? "Esc Close" : "Esc Back";
				const footer = page.kind === "reset" ? "Y Delete · Esc Keep"
					: size.columns < 44
						? page.kind === "home" ? "↑↓ · Enter · PgDn · Esc" : "Esc · ↑↓ · PgDn"
						: maxScroll ? `${hints} · PgUp/PgDn Scroll` : hints;
				const toNode = ({ text, tone }: Line): UiNode => el("text", {
					lines: 1, truncate: "end",
					spans: [{ t: indent + (text ? truncate(text, width) : " "), s: tone }],
				});
				return [
					size.rows >= 3 && toNode({ text: "English coach", tone: "accent" }),
					...rows.map(toNode),
					size.rows >= 2 && toNode({ text: footer, tone: "muted" }),
				];
			},
		});
	return { node, refresh() {
		try {
			refreshGeneration();
		} catch {
			go(unavailable);
		}
	} };
}

export function registerCoachDashboard(pi: ExtensionAPI): void {
	pi.registerCommand("english-coach", {
		description: "Review Coach memory and practice English",
		async handler(_args, ctx) {
			if (!ctx.hasUI || ctx.mode !== "tui") return;
			let memory: CoachMemory | undefined;
			let refresh: ReturnType<typeof setInterval> | undefined;
			let overlay: ExtensionOverlayHandle | undefined;
			let initial: Page = unavailable;
			let release: (() => void) | undefined;
			try {
				try {
					memory = openCoachMemory();
					initial = { kind: "home", snapshot: memory.snapshot(), selected: 0 };
				} catch {
				}
				// Tern shows the dashboard as a popup over the session; a plain terminal gives it the screen.
				release = holdOverlay();
				await ctx.ui.custom<void>((ui, _theme, _keys, done) => {
					const view = dashboard(ui, initial, done, memory);
					refresh = setInterval(() => {
						if (overlay?.closed) done();
						else view.refresh();
					}, 1000).unref();
					return view.node;
				}, { overlay: true, fullscreen: !nativeRendering(), onHandle: handle => { overlay = handle; } });
			} finally {
				release?.();
				if (refresh !== undefined) clearInterval(refresh);
				memory?.close();
			}
		},
	});
}
