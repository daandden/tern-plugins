/* The form layout, navigation and state shape are adapted from oh-my-pi v19.2.1.
 * Copyright (c) 2025 Mario Zechner
 * Copyright (c) 2025-2026 Can Bölük
 * Copyright (c) 2026 Stencil Labs, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import type { ImageContent } from "@oh-my-pi/pi-ai";
import type { KeybindingsManager } from "@oh-my-pi/pi-coding-agent";
import { listKeyId } from "@oh-my-pi/pi-coding-agent/config/keybindings/matchers";
import { choiceValue, fieldError, fieldQuestions, type HtmlFormData, type HtmlFormValue, type OptionNote, textValue } from "@oh-my-pi/pi-coding-agent/tools/html-form/data";
import { type ChoiceField, type FormBlock, type FormField, type HtmlForm, spansText } from "@oh-my-pi/pi-coding-agent/tools/html-form/parse";
import { batch, type KeyEvent, nativeRendering, signal, type TextEdit, UiNode } from "@oh-my-pi/pi-tui";
import { fieldWidget } from "@oh-my-pi/pi-tui/term/widgets/editor";
import { widgetContext } from "@oh-my-pi/pi-tui/term/widgets";
import { flattenLine, stripControl } from "@oh-my-pi/pi-tui/text/sanitize";

export const OTHER_ROW = -1;
export type Active = number | "submit";
export type FormBox = { kind: "text" | "other"; field: number };

export interface FormPart { section: number; start: number; end: number }
interface Group { index: number; parts: FormPart[]; fields: number[] }

function formLayout(form: HtmlForm): { intro: FormPart[]; groups: Group[] } {
	const intro: FormPart[] = [];
	const groups: Group[] = [];
	let lead: FormPart[] = [];
	form.sections.forEach((section, index) => {
		const end = section.blocks.length;
		const blocks = section.blocks.flatMap((block, at) => block.kind === "field"
			? [{ at, through: Math.max(at + 1, block.optionsEnd ?? 0), field: block.field }] : []);
		if (!blocks.length) {
			(groups.length ? lead : intro).push({ section: index, start: 0, end });
			return;
		}
		const cuts = section.fieldset ? [] : blocks.flatMap(({ at, through, field }, nth) => {
			if (!reachable(field)) return [];
			return [through <= (blocks[nth + 1]?.at ?? end) ? through : at + 1];
		});
		if (!cuts.length) cuts.push(end);
		else cuts[cuts.length - 1] = end;
		let start = 0;
		for (const cut of cuts) {
			const fields = blocks.flatMap(block => block.at >= start && block.at < cut ? [form.fields.indexOf(block.field)] : []);
			groups.push({ index: groups.length, parts: [...lead, { section: index, start, end: cut }], fields });
			lead = [];
			start = cut;
		}
	});
	groups.at(-1)?.parts.push(...lead);
	return { intro, groups };
}

export function isFoldCaption(blocks: readonly FormBlock[], at: number, focused: FormField | undefined, question: (field: FormField) => string | undefined): boolean {
	const block = blocks[at];
	const next = blocks[at + 1];
	return block?.kind === "text" && next?.kind === "field" && next.field !== focused
		&& question(next.field) === flattenLine(spansText(block.spans));
}

export function isDropdown(field: FormField): boolean {
	return field.kind === "choice" && field.select && !field.multi;
}

function reachable(field: FormField): boolean {
	return field.kind === "text" || field.other || field.options.some(option => !option.disabled);
}

function printable(key: KeyEvent): string | undefined {
	return /(?:^|\+)(?:ctrl|alt|super)\+/.test(key.id) ? undefined : key.text;
}

interface Line { text: string; cursor: number }
interface FieldAnswer {
	checked: ReadonlySet<number>;
	other: Line;
	otherChosen: boolean;
	text: Line;
	notes: ReadonlyMap<number, string>;
	noteImages: ReadonlyMap<number, readonly ImageContent[]>;
}

interface FormCallbacks {
	onSubmit(data: HtmlFormData, notes: OptionNote[]): void;
	onTimeout(data: HtmlFormData, notes: OptionNote[]): void;
	onCancel(): void;
	onPasteClipboard?(): Promise<string | undefined>;
}

function initialAnswer(field: FormField): FieldAnswer {
	const checked = field.kind === "choice" ? field.options.flatMap((option, i) => option.checked ? [i] : []) : [];
	return {
		checked: new Set(field.kind === "choice" && !field.multi ? checked.slice(-1) : checked),
		other: { text: "", cursor: 0 }, otherChosen: false,
		text: { text: field.kind === "text" ? field.value : "", cursor: 0 }, notes: new Map(), noteImages: new Map(),
	};
}

export abstract class AskForm {
	readonly fields;
	readonly layout;
	readonly questions;
	readonly sole;
	readonly answers;
	readonly active = signal<Active>("submit");
	readonly row = signal(0);
	readonly dropdown = signal<number | undefined>(undefined);
	readonly hidden = signal(false);
	readonly scrollAnchor = signal<"top" | "bottom">("top");
	readonly focused = signal(true);
	readonly #editors = new Map<string, UiNode>();
	readonly #history = new Map<string, Line[]>();
	#paste: Promise<void> | undefined;
	#queuedSubmit = false;
	#closed = false;

	constructor(readonly form: HtmlForm, private readonly callbacks: FormCallbacks, protected readonly keys: KeybindingsManager) {
		this.fields = form.fields;
		this.questions = fieldQuestions(form);
		this.layout = formLayout(form);
		this.answers = signal<readonly FieldAnswer[]>(form.fields.map(initialAnswer));
		const first = this.#fieldFrom(-1, 1);
		this.sole = first !== undefined && this.#fieldFrom(first, 1) === undefined;
		if (first !== undefined) this.#enter(first);
	}

	field(index: number): FormField { return this.fields[index]!; }
	answer(index: number): FieldAnswer { return this.answers()[index]!; }
	question(index: number): string { return this.questions.get(this.field(index)) ?? this.field(index).name; }

	value(index: number): HtmlFormValue | undefined {
		const field = this.field(index);
		const answer = this.answer(index);
		return field.kind === "text" ? textValue(field, answer.text.text)
			: choiceValue(field, answer.checked, answer.otherChosen ? answer.other.text : undefined);
	}

	answered(index: number): boolean {
		const value = this.value(index);
		return value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0) && fieldError(this.field(index), value) === undefined;
	}

	error(index: number): string | undefined {
		const field = this.field(index);
		if (!reachable(field)) return;
		const value = this.value(index);
		const active = this.active();
		if ((value === undefined || (Array.isArray(value) ? value.length === 0 : String(value).trim() === ""))
			&& active !== "submit" && active <= index) return;
		return fieldError(field, value);
	}

	errorCount(): number { return this.fields.filter((_, index) => this.error(index) !== undefined).length; }

	progress(): string | undefined {
		const named = this.fields.flatMap((field, index) => field.name && reachable(field) ? [index] : []);
		return named.length > 1 ? `${named.filter(i => this.answered(i)).length} of ${named.length} answered` : undefined;
	}

	foldChoice(index: number) {
		const field = this.field(index);
		const answer = this.answer(index);
		if (field.kind !== "choice") return { pills: [], note: undefined };
		const pills = field.options.flatMap((option, at) => option.disabled && !answer.checked.has(at) ? []
			: [{ label: flattenLine(spansText(option.label)) || option.value, chosen: answer.checked.has(at), act: `pick:${index}:${at}` }]);
		const other = flattenLine(answer.other.text);
		if (field.other && answer.otherChosen && other) pills.push({ label: `Other: ${other}`, chosen: true, act: `open:${index}` });
		const note = [...answer.checked].map(option => answer.notes.get(option)?.trim()).find(Boolean);
		return { pills, note: note === undefined ? undefined : flattenLine(note) };
	}

	rows(index: number): number[] {
		const field = this.field(index);
		if (field.kind !== "choice") return [];
		const rows = field.options.flatMap((option, i) => option.disabled ? [] : [i]);
		if (field.other && !isDropdown(field)) rows.push(OTHER_ROW);
		return rows;
	}

	#fieldFrom(from: number, delta: 1 | -1): number | undefined {
		for (let i = from + delta; i >= 0 && i < this.fields.length; i += delta) if (reachable(this.field(i))) return i;
	}

	#enter(index: number, at: "answer" | "first" | "last" = "answer"): void {
		const rows = this.rows(index);
		const answer = this.answer(index);
		const field = this.field(index);
		const selected = rows.find(option => answer.checked.has(option));
		const other = field.kind === "choice" && field.other && answer.other.text.trim() && (field.multi || !answer.checked.size);
		const row = isDropdown(field) ? (selected ?? rows[0])
			: at === "first" ? rows[0] : at === "last" ? rows.at(-1) : selected ?? (other ? OTHER_ROW : rows[0]);
		batch(() => {
			this.active.set(index);
			this.row.set(row ?? 0);
			this.dropdown.set(undefined);
		});
	}

	open(index: number): void {
		const field = this.fields[index];
		if (field && reachable(field)) this.#enter(index);
	}

	next(): void {
		const active = this.active.peek();
		if (active === "submit") return;
		const target = this.#fieldFrom(active, 1);
		if (target === undefined) this.active.set("submit");
		else this.#enter(target);
	}

	previous(): void {
		const active = this.active.peek();
		const target = this.#fieldFrom(active === "submit" ? this.fields.length : active, -1);
		if (target !== undefined) this.#enter(target);
		else if (active !== "submit") this.#enter(active);
	}

	jumpQuestion(delta: 1 | -1): void {
		const { groups } = this.layout;
		const active = this.active.peek();
		const group = (active === "submit" ? groups.length : groups.findIndex(g => g.fields.includes(active))) + delta;
		if (group === groups.length) this.active.set("submit");
		const field = groups[group]?.fields.find(index => reachable(this.field(index)));
		if (field !== undefined) this.#enter(field);
	}

	#advance(): void { if (this.sole) this.submit(); else this.next(); }

	#move(delta: 1 | -1): void {
		const active = this.active.peek();
		if (active !== "submit" && !isDropdown(this.field(active))) {
			const rows = this.rows(active);
			const next = rows[rows.indexOf(this.row.peek()) + delta];
			if (next !== undefined) {
				this.row.set(next);
				return;
			}
		}
		const target = this.#fieldFrom(active === "submit" ? this.fields.length : active, delta);
		if (target !== undefined) this.#enter(target, delta < 0 ? "last" : "first");
		else if (active !== "submit" && delta > 0) this.active.set("submit");
	}

	#update(index: number, change: (answer: FieldAnswer) => FieldAnswer): void {
		const answers = [...this.answers.peek()];
		answers[index] = change(answers[index]!);
		this.answers.set(answers);
	}

	pick(index: number, option: number): void {
		const field = this.fields[index];
		if (field?.kind !== "choice" || field.options[option]?.disabled !== false) return;
		this.#update(index, answer => {
			if (!field.multi) return { ...answer, otherChosen: false, checked: new Set([option]) };
			const checked = new Set(answer.checked);
			if (!checked.delete(option)) checked.add(option);
			return { ...answer, checked };
		});
	}

	#chooseOther(index: number): void {
		const field = this.field(index);
		if (field.kind !== "choice") return;
		this.#update(index, answer => ({ ...answer, otherChosen: true, checked: field.multi ? answer.checked : new Set() }));
	}

	data(): HtmlFormData {
		const data: HtmlFormData = Object.create(null);
		for (const [name, value] of this.form.hidden) data[name] = value;
		this.fields.forEach((field, i) => {
			if (!field.name) return;
			const value = this.value(i);
			if (value !== undefined) data[field.name] = value;
		});
		return data;
	}

	notes(): OptionNote[] {
		return this.fields.flatMap((field, index) => {
			if (field.kind !== "choice") return [];
			const answer = this.answer(index);
			return field.options.flatMap((option, i) => {
				const text = answer.notes.get(i);
				if (!text || !answer.checked.has(i)) return [];
				const images = answer.noteImages.get(i);
				return [{ name: field.name, question: this.question(index), option: spansText(option.label), value: option.value, text, images: images && [...images] }];
			});
		});
	}

	submit(): void {
		if (this.#closed) return;
		if (this.#paste) this.#queuedSubmit = true;
		else this.callbacks.onSubmit(this.data(), this.notes());
	}
	cancel(): void { if (!this.#closed) this.callbacks.onCancel(); }
	timeout(): void { if (!this.#closed) this.callbacks.onTimeout(this.data(), this.notes()); }

	protected disposeForm(): void {
		this.#closed = true;
		for (const editor of this.#editors.values()) editor.dispose();
		this.#editors.clear();
	}

	vim(box: FormBox) {
		const field = this.#editors.get(`${box.kind}:${box.field}`);
		return field && { selection: () => field.fieldSelection?.range(this.answer(box.field)[box.kind].cursor) ?? null };
	}

	#currentBox(): FormBox | undefined {
		const index = this.active.peek();
		if (index === "submit" || this.hidden.peek() || this.dropdown.peek() !== undefined) return;
		if (this.field(index).kind === "text") return { kind: "text", field: index };
		if (this.row.peek() === OTHER_ROW) return { kind: "other", field: index };
	}

	edit(box: FormBox, edit: TextEdit, masked = false): void {
		const active = this.#currentBox();
		if (active?.kind === box.kind && active.field === box.field) this.#applyEdit(box, edit, masked);
	}

	#applyEdit(box: FormBox, edit: TextEdit, masked: boolean): void {
		const before = this.answer(box.field)[box.kind];
		const chars = masked ? [...before.text] : undefined;
		if ((chars?.length ?? before.text.length) !== edit.len || edit.from < 0 || edit.to < edit.from || edit.to > edit.len) return;
		const start = chars ? chars.slice(0, edit.from).join("").length : edit.from;
		const end = chars ? chars.slice(0, edit.to).join("").length : edit.to;
		const field = this.field(box.field);
		const multiline = field.kind === "text" && field.multiline;
		const normalized = stripControl(edit.text.replace(/\r\n?/g, "\n"));
		const inserted = multiline ? normalized : normalized.replace(/\n/g, " ");
		const text = before.text.slice(0, start) + inserted + before.text.slice(end);
		const cursor = masked ? start + inserted.length : Math.max(0, Math.min(edit.cursor + inserted.length - edit.text.length, text.length));
		if (text !== before.text) {
			const key = `${box.kind}:${box.field}`;
			let history = this.#history.get(key);
			if (!history) this.#history.set(key, history = []);
			if (history.length === 100) history.shift();
			history.push(before);
		}
		this.#setBox(box, { text, cursor });
	}

	#setBox(box: FormBox, line: Line): void {
		const field = this.field(box.field);
		this.#update(box.field, answer => box.kind === "text" ? { ...answer, text: line }
			: { ...answer, other: line, otherChosen: !!line.text.trim(), checked: field.kind === "choice" && !field.multi && line.text.trim() ? new Set() : answer.checked });
	}

	#sendToBox(box: FormBox, input: KeyEvent | string): void {
		const key = `${box.kind}:${box.field}`;
		let node = this.#editors.get(key);
		if (!node) {
			const field = this.field(box.field);
			node = new UiNode(field.kind === "text" && field.multiline ? "editor" : "input", {
				text: () => this.answer(box.field)[box.kind].text,
				cursor: () => this.answer(box.field)[box.kind].cursor,
				onEdit: (edit: TextEdit) => this.#applyEdit(box, edit, false),
				onUndo: () => {
					const before = this.#history.get(key)?.pop();
					if (before) this.#setBox(box, before);
				},
			});
			this.#editors.set(key, node);
		}
		const cx = widgetContext([node], { focus() {}, pageRows: 4 });
		if (typeof input === "string") fieldWidget.paste?.(node, { text: input }, cx);
		else fieldWidget.key?.(node, input, cx);
	}

	paste(text: string): void {
		const box = this.#currentBox();
		if (box) this.#sendToBox(box, text);
	}

	#pasteClipboard(): void {
		const box = this.#currentBox();
		const read = this.callbacks.onPasteClipboard;
		if (!box || !read) return;
		const pending = (this.#paste ?? Promise.resolve()).then(read).then(text => {
			if (!this.#closed && text) this.#sendToBox(box, text);
			else this.#queuedSubmit = false;
		}, () => { this.#queuedSubmit = false; }).then(() => {
			if (this.#paste !== pending) return;
			this.#paste = undefined;
			if (this.#queuedSubmit) {
				this.#queuedSubmit = false;
				this.submit();
			}
		});
		this.#paste = pending;
	}

	protected abstract onNote(option?: number): void;

	key(key: KeyEvent): boolean {
		const id = listKeyId(key, this.keys);
		const active = this.active.peek();
		const first = active === 0 && this.row.peek() === this.rows(0)[0];
		if (id === "up" || id === "down") this.scrollAnchor.set(id === "up" && first ? "bottom" : "top");
		if (this.keys.matches(key, "app.ask.hide")) {
			if (!nativeRendering()) {
				this.hidden.set(!this.hidden.peek());
				this.dropdown.set(undefined);
			}
			return true;
		}
		if (this.hidden.peek()) {
			if (this.keys.matches(key, "tui.select.confirm")) this.hidden.set(false);
			return true;
		}
		if (this.keys.matches(key, "app.clipboard.pasteImage")) {
			this.#pasteClipboard();
			return true;
		}
		if (active !== "submit" && this.dropdown.peek() !== undefined) {
			this.#dropdownKey(active, key, id);
			return true;
		}
		if (id === "pageUp" || id === "pageDown") this.jumpQuestion(id === "pageDown" ? 1 : -1);
		else if (id === "shift+tab") this.previous();
		else if (active === "submit") {
			if (id === "left") this.jumpQuestion(-1);
			else if (id === "up") this.#move(-1);
			else if (this.keys.matches(key, "tui.select.confirm")) this.submit();
		} else if (id === "tab") this.next();
		else {
			const field = this.field(active);
			if (field.kind === "text") this.#textKey(active, field.multiline, key, id);
			else if (isDropdown(field)) this.#selectKey(active, key, id);
			else this.#choiceKey(active, field, key, id);
		}
		return true;
	}

	#textKey(index: number, multiline: boolean, key: KeyEvent, id: string): void {
		if (id === "up" || id === "down") {
			const { text, cursor } = this.answer(index).text;
			if (!multiline || !(id === "up" ? text.slice(0, cursor) : text.slice(cursor)).includes("\n")) {
				this.#move(id === "up" ? -1 : 1);
				return;
			}
		}
		if (this.keys.matches(key, "tui.input.submit")) this.#advance();
		else this.#sendToBox({ kind: "text", field: index }, key);
	}

	#choiceKey(index: number, field: ChoiceField, key: KeyEvent, id: string): void {
		const row = this.row.peek();
		const confirm = this.keys.matches(key, "tui.select.confirm");
		if (id === "up" || id === "down") this.#move(id === "up" ? -1 : 1);
		else if (row === OTHER_ROW) {
			if (!confirm) this.#sendToBox({ kind: "other", field: index }, key);
			else {
				if (!field.multi && this.answer(index).other.text.trim()) this.#chooseOther(index);
				this.#advance();
			}
		} else if (id === "left" || id === "right") this.jumpQuestion(id === "left" ? -1 : 1);
		else if (id === "space") this.pick(index, row);
		else if (confirm) {
			if (!field.multi || this.answer(index).checked.size === 0) this.pick(index, row);
			this.#advance();
		} else if (this.keys.matches(key, "app.ask.note")) this.onNote();
	}

	#selectKey(index: number, key: KeyEvent, id: string): void {
		if (!printable(key) && this.keys.matches(key, "app.ask.note")) {
			this.onNote();
			return;
		}
		const rows = this.rows(index);
		if (id === "up" || id === "down") this.#move(id === "up" ? -1 : 1);
		else if (id === "left" || id === "right") {
			const at = rows.indexOf(this.row.peek());
			const option = rows[Math.max(0, Math.min(rows.length - 1, at + (id === "left" ? -1 : 1)))];
			if (option !== undefined) {
				this.row.set(option);
				this.pick(index, option);
			}
		} else if (id === "space") this.dropdown.set(this.row.peek());
		else if (id === "enter") this.#advance();
		else this.#search(index, key, false);
	}

	#dropdownKey(index: number, key: KeyEvent, id: string): void {
		const rows = this.rows(index);
		const open = this.dropdown.peek();
		if (open === undefined) return;
		const at = rows.indexOf(open);
		if (!printable(key) && this.keys.matches(key, "app.ask.note")) this.onNote();
		else if (id === "escape") this.dropdown.set(undefined);
		else if (id === "up" || id === "down") this.dropdown.set(rows[Math.max(0, Math.min(rows.length - 1, at + (id === "up" ? -1 : 1)))]);
		else if (id === "pageUp" || id === "pageDown" || id === "home" || id === "end") {
			this.dropdown.set(id === "pageUp" || id === "home" ? rows[0] : rows.at(-1));
		} else if (id === "enter") {
			batch(() => {
				this.dropdown.set(undefined);
				this.row.set(open);
				this.pick(index, open);
			});
		} else this.#search(index, key, true);
	}

	#search(index: number, key: KeyEvent, open: boolean): void {
		const field = this.field(index);
		const query = printable(key)?.toLocaleLowerCase();
		if (!query || query.length !== 1 || field.kind !== "choice") return;
		const rows = this.rows(index);
		const from = rows.indexOf((open ? this.dropdown.peek() : this.row.peek()) ?? 0);
		for (let i = 1; i <= rows.length; i++) {
			const option = rows[(from + i) % rows.length]!;
			if (!flattenLine(spansText(field.options[option]!.label)).toLocaleLowerCase().startsWith(query)) continue;
			if (open) this.dropdown.set(option);
			else {
				this.row.set(option);
				this.pick(index, option);
			}
			break;
		}
	}

	action(act: string, key: string): void {
		const open = /^open:(\d+)$/.exec(act);
		if (open) return this.open(Number(open[1]));
		const pick = /^pick:(\d+):(\d+)$/.exec(act);
		if (pick) return this.pick(Number(pick[1]), Number(pick[2]));
		if (act === "submit") return this.submit();
		if (act === "cancel") return this.cancel();
		if (act === "note") {
			const row = /(?:^|\/)f(\d+)\/o(\d+)$/.exec(key);
			if (row && this.active.peek() === Number(row[1])) this.onNote(Number(row[2]));
			else if (key.split("/").at(-1) === "note") this.onNote();
		}
	}

	select(index: number, item: string, activate: boolean): void {
		const field = this.fields[index];
		if (field?.kind !== "choice") return;
		const option = /^o(\d+)$/.exec(item);
		const row = option ? Number(option[1]) : OTHER_ROW;
		if (row === OTHER_ROW ? item !== "other" || !field.other : field.options[row]?.disabled !== false) return;
		batch(() => {
			if (this.active.peek() !== index) this.open(index);
			this.dropdown.set(undefined);
			this.row.set(row);
			if (row === OTHER_ROW) {
				if (!field.multi) this.#chooseOther(index);
			} else if (!field.multi || !activate) this.pick(index, row);
		});
	}
}