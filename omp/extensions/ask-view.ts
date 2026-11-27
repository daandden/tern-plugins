/* Native form and box structure adapted from oh-my-pi v19.2.1. MIT notice in ask-form.ts. */
import { formatKeyHint, type KeybindingsManager } from "@oh-my-pi/pi-coding-agent";
import { computed, effect, nativeSupports, onCleanup, signal, UiNode, untrack, type KeyEvent, type PasteEvent, type UiEvent } from "@oh-my-pi/pi-tui";
import { defineRolePainter, type PaintContext } from "@oh-my-pi/pi-tui/term/paint";
import { flattenLine } from "@oh-my-pi/pi-tui/text/sanitize";
import { padTo, truncate, wrap } from "@oh-my-pi/pi-tui/text/width";
import { type AskCard, GENERAL_NOTE_KEY, SIDE_QUESTION_KEY, TYPING_GENERAL_NOTE_KEY } from "./ask-card";
import { isDropdown, OTHER_ROW } from "./ask-form";
import { formBody, formMedia } from "./ask-form-view";

const ACTION_ROW = "actions";
const LOOK = "omp-tools.ask-card";

const NATIVE_FORM_ROWS = 0.25;
const NATIVE_EDIT_FORM_ROWS = 0.15;

function button(id: string, text: string, keys?: string[], accent = false, mark?: "pick"): UiNode {
	return nativeSupports("button")
		? new UiNode("button", { key: id, role: "omp.btn", text, keys, actions: { click: id }, tone: accent ? "accent" : undefined, variant: accent ? "primary" : undefined, mark })
		: new UiNode("row", { key: id, role: "omp.btn", gap: "xs", actions: { click: id }, tone: accent ? "accent" : undefined, mark, children: [
			new UiNode("text", { text }), keys && new UiNode("kbd", { keys }),
		] });
}

function keysFor(keybindings: KeybindingsManager, action: "tui.input.submit" | "tui.input.newLine" | "tui.select.cancel", fallback: string): string[] {
	return (keybindings.keysFor(action)[0] ?? fallback).split("+");
}

function noteHint(card: AskCard, keys: KeybindingsManager): string {
	const note = card.editNote();
	const save = formatKeyHint(keysFor(keys, "tui.input.submit", "enter").join("+"));
	const newline = formatKeyHint(keysFor(keys, "tui.input.newLine", "shift+enter").join("+"));
	const escape = formatKeyHint(keysFor(keys, "tui.select.cancel", "escape").join("+"));
	const onlyPicked = note?.target.kind === "option" && !card.answer(note.target.field).checked.has(note.target.option);
	return `${save} save · ${newline} new line · blank removes · ${escape} keep${onlyPicked ? " · sent only if chosen" : ""}`;
}

function optionNoteKey(card: AskCard, keys: KeybindingsManager): string | false | undefined {
	const active = card.active();
	if (active === "submit") return false;
	const field = card.field(active);
	if (field.kind !== "choice") return false;
	const dropdown = isDropdown(field);
	if (!dropdown && card.row() === OTHER_ROW) return false;
	return keys.keysFor("app.ask.note").find(key => !dropdown || key.includes("+"));
}

function footerHint(card: AskCard, keys: KeybindingsManager): string {
	const active = card.active();
	const field = active === "submit" ? undefined : card.field(active);
	const noteKey = optionNoteKey(card, keys);
	const note = noteKey ? ` · ${formatKeyHint(noteKey)} Note` : "";
	const enter = formatKeyHint(keys.keysFor("tui.select.confirm")[0] ?? "enter");
	const next = !field || card.sole ? "submit" : "next";
	const choose = field?.kind === "choice" && field.multi ? `${formatKeyHint("space")} toggle · ` : "";
	const cancel = formatKeyHint(keys.keysFor("tui.select.cancel")[0] ?? "escape");
	const open = card.dropdown() === undefined ? "" : ` · ${formatKeyHint("space")} choose`;
	const typing = card.typingInForm();
	const side = formatKeyHint(typing ? SIDE_QUESTION_KEY : "?");
	const general = formatKeyHint(typing ? TYPING_GENERAL_NOTE_KEY : GENERAL_NOTE_KEY);
	return `${choose}${enter} ${next}${open}${note} · ${general} General note · ${side} Side question · ↑/↓ move · ${cancel} cancel`;
}

interface AskLook {
	base: UiNode;
	card: AskCard;
	keybindings: KeybindingsManager;
}

/** Use omp's HTML form painter for the form. It does not paint added footer children. */
function paintAsk(node: UiNode, cx: PaintContext) {
	const props = node.props();
	const term = "term" in props ? props.term : undefined;
	if (!term || typeof term !== "object" || !("base" in term)) return { rows: [] };
	const { base, card, keybindings } = term as AskLook;
	const side = card.sideQuestion();
	const note = card.editNote();
	const editor = side ?? note?.editor;
	const inner = cx.width - 4;
	const rows = cx.paint(base, cx.width).rows;
	if (rows.length < 2 || inner < 4) return { rows };
	const theme = cx.theme;
	const extra: string[] = [];
	if (editor) {
		extra.push(...wrap(theme.fg("muted", side ? "Side question" : note?.label ?? "Note"), inner));
		extra.push(...cx.paint(editor.node, inner - 4).rows.map(row => `  ${theme.fg("accent", "│")} ${row}`));
		const hints = side ? "Enter ask · Esc back" : noteHint(card, keybindings);
		extra.push(...wrap(theme.fg("dim", editor.busy() ? `Pasting… · ${hints}` : hints), inner));
	} else {
		const general = card.generalNote();
		if (general) extra.push(...wrap(theme.fg("muted", `✎ General note: ${flattenLine(general.text)}`), inner).slice(0, 1));
		extra.push(...wrap(theme.fg("dim", footerHint(card, keybindings)), inner));
	}
	const border = theme.fg("border", theme.symbols.box.vertical);
	const footer = extra.map(row => `${border} ${padTo(truncate(row, inner, ""), inner)} ${border}`);
	return { rows: [...rows.slice(0, -1), ...footer, rows.at(-1)!] };
}

defineRolePainter("col", LOOK, paintAsk);

export function askCardView(card: AskCard, cwd: string, terminalRows: () => number, keybindings: KeybindingsManager): UiNode {
	const abort = new AbortController();
	onCleanup(() => abort.abort());
	const pictureRows = () => Math.max(1, Math.min(14, Math.floor(terminalRows() * 0.7) - 4));
	const media = formMedia(card.form, cwd, pictureRows(), abort.signal);
	const editRows = () => card.sideQuestion() || card.editNote() ? card.editorRows() + 2 : 2;
	// The host's form painter reads this data structurally. The Note editor is
	// drawn in our footer rather than in its original single-line slot.
	const terminalModel = {
		form: card.form,
		fields: card.fields,
		questions: card.questions,
		layout: card.layout,
		sole: card.sole,
		active: card.active,
		row: card.row,
		dropdown: card.dropdown,
		hidden: card.hidden,
		focused: card.focused,
		scrollAnchor: card.scrollAnchor,
		field: card.field.bind(card),
		answer: card.answer.bind(card),
		answered: card.answered.bind(card),
		error: card.error.bind(card),
		errorCount: card.errorCount.bind(card),
		foldChoice: card.foldChoice.bind(card),
		progress: card.progress.bind(card),
		question: card.question.bind(card),
		rows: card.rows.bind(card),
		vim: card.vim.bind(card),
		note: () => undefined,
	};
	const baseLook = () => ({ look: "omp.html-form", model: terminalModel,
		terminalRows: Math.max(8, terminalRows() - Math.ceil(editRows() / 0.7)), media: media(), remaining: card.remaining(),
	});
	const base = new UiNode("col", { role: "omp.ask.card", term: baseLook });
	const group = computed(() => {
		const active = card.active();
		return active === "submit" ? -1 : card.layout.groups.findIndex(group => group.fields.includes(active));
	});
	const reveal = signal(0);
	let last = untrack(group);
	effect(() => {
		const next = group();
		if (next !== last) reveal.set(reveal.peek() + 1);
		last = next;
	});
	const footer = () => {
		const side = card.sideQuestion();
		const note = card.editNote();
		if (side || note) {
			const editor = side ?? note?.editor;
			if (!editor) return [];
			return new UiNode("col", { key: "ask-edit", role: "omp.ask.field", gap: "xs", children: [
				new UiNode("text", { role: "omp.ask.note", wrap: "word", text: side ? "Side question" : note?.label }),
				new UiNode("col", { role: "omp.field", children: editor.node }),
				new UiNode("row", { key: ACTION_ROW, role: "omp.actions", align: "center", gap: "sm", children: [
					new UiNode("text", { role: "omp.ask.note", wrap: "word", text: () => editor.busy() ? "Pasting…" : side ? "Private Side question" : noteHint(card, keybindings) }),
					new UiNode("spacer", { grow: 1 }),
					button("cancel", side ? "Back" : "Keep", keysFor(keybindings, "tui.select.cancel", "escape")),
					button(side ? "ask-btw" : "save-note", side ? "Ask" : "Save", keysFor(keybindings, "tui.input.submit", "enter"), true),
				] }),
			] });
		}
		const saved = card.generalNote();
		const remaining = card.remaining();
		const active = card.active();
		const noteKey = optionNoteKey(card, keybindings);
		return new UiNode("row", { key: ACTION_ROW, motionKey: ACTION_ROW, role: "omp.actions", align: "center", gap: "sm", children: [
			remaining === undefined ? null : new UiNode("text", { role: "omp.ask.summary", truncate: "end", spans: [{ s: "muted", t: `Submits these answers in ${Math.ceil(remaining / 1000)}s` }] }),
			new UiNode("spacer", { grow: 1 }),
			button("cancel", "Cancel"),
			noteKey !== false && button("note", "Note", noteKey?.split("+")),
			button("general-note", "General note", (card.typingInForm() ? TYPING_GENERAL_NOTE_KEY : GENERAL_NOTE_KEY).split("+"), false, saved ? "pick" : undefined),
			button("submit", "Submit", active === "submit" || card.sole ? (keybindings.keysFor("tui.select.confirm")[0] ?? "enter").split("+") : undefined, true),
		] });
	};
	const native = new UiNode("col", { role: "omp.ask.card", gap: "md", transition: "layout", reveal: "start", children: [
		new UiNode("row", { key: "head", motionKey: "head", role: "omp.ask.card.head", align: "baseline", gap: "sm", justify: "between", children: [
			new UiNode("text", { role: "omp.ask.card.tag", spans: [{ s: "accent", t: "ask" }] }),
			() => {
				const progress = card.progress();
				return progress && new UiNode("text", { role: "omp.ask.card.progress", spans: [{ s: "muted", t: progress }] });
			},
		] }),
		new UiNode("list", {
			key: "body-scroll",
			max: () => ({ lines: Math.max(1, Math.floor(terminalRows() * (card.sideQuestion() || card.editNote() ? NATIVE_EDIT_FORM_ROWS : NATIVE_FORM_ROWS))) }),
			children: new UiNode("col", { key: "body", role: "omp.ask.card.body", gap: "lg", children: () => formBody(card, media(), pictureRows(), reveal()) }),
		}),
		footer,
	] });
	return new UiNode("col", {
		role: LOOK,
		term: { base, card, keybindings } satisfies AskLook,
		onKey: (key: KeyEvent) => card.key(key),
		onPaste: (paste: PasteEvent) => { card.paste(paste.text); return true; },
		onAction: (act: string, event: Extract<UiEvent, { type: "action" }>) => card.action(act, event.key),
		children: native,
	});
}