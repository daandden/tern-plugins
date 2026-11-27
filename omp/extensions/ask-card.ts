import type { ImageContent } from "@oh-my-pi/pi-ai";
import type { ExtensionContext, KeybindingsManager } from "@oh-my-pi/pi-coding-agent";
import { matchesSelectCancel } from "@oh-my-pi/pi-coding-agent/config/keybindings/matchers";
import { shiftImageMarkers } from "@oh-my-pi/pi-coding-agent/modes/view-model/prompt/composer-attachments";
import type { HtmlFormData, OptionNote } from "@oh-my-pi/pi-coding-agent/tools/html-form/data";
import { type HtmlForm, spansText } from "@oh-my-pi/pi-coding-agent/tools/html-form/parse";
import { isClipboardTerminalLocal, readTextFromClipboard } from "@oh-my-pi/pi-coding-agent/utils/clipboard";
import { batch, type KeyEvent, signal } from "@oh-my-pi/pi-tui";
import { flattenLine } from "@oh-my-pi/pi-tui/text/sanitize";
import { AskEditor, type Note } from "./ask-editor";
import { AskForm, isDropdown, OTHER_ROW, type FormBox } from "./ask-form";
import { clipboardNotePaste, loadNoteImages, noteImagePaths } from "./ask-images";
import { askBtw, cancelBtw, handleAskBtwKey, parseBtwQuestion } from "./btw";

export const GENERAL_NOTE_KEY = "shift+n";
/** Opens the General note while a field takes typed text, where Shift+N types `N`. */
export const TYPING_GENERAL_NOTE_KEY = "alt+u";
export const SIDE_QUESTION_KEY = "alt+/";

type NoteTarget = { kind: "option"; field: number; option: number } | { kind: "general" };
type NoteEdit = { target: NoteTarget; label: string; editor: AskEditor };

export type CardOutcome =
	| { kind: "cancelled" }
	| { kind: "submitted" | "expired"; data: HtmlFormData; notes: OptionNote[]; generalNote?: Note };

interface AskCardOptions {
	ctx: ExtensionContext;
	keybindings: KeybindingsManager;
	terminalRows: () => number;
	timeout: number | undefined;
	done(outcome: CardOutcome): void;
}

export class AskCard extends AskForm {
	readonly generalNote = signal<Note | undefined>(undefined);
	readonly editNote = signal<NoteEdit | undefined>(undefined);
	readonly sideQuestion = signal<AskEditor | undefined>(undefined);
	readonly remaining = signal<number | undefined>(undefined);
	readonly editorRows: () => number;
	#deadline = 0;
	#timer: ReturnType<typeof setInterval> | undefined;
	#closed = false;

	constructor(form: HtmlForm, private readonly options: AskCardOptions) {
		super(form, {
			onSubmit: (data, notes) => this.#finish({ kind: "submitted", data, notes, generalNote: this.generalNote.peek() }),
			onTimeout: (data, notes) => this.#finish({ kind: "expired", data, notes, generalNote: this.generalNote.peek() }),
			onCancel: () => this.#finish({ kind: "cancelled" }),
			onPasteClipboard: () => isClipboardTerminalLocal() ? readTextFromClipboard() : Promise.resolve(undefined),
		}, options.keybindings);
		this.editorRows = () => Math.max(1, Math.min(5, Math.floor(options.terminalRows() * 0.7) - 4));
		this.activity();
		if (options.timeout !== undefined) {
			this.#timer = setInterval(() => {
				const remaining = Math.max(0, this.#deadline - Date.now());
				if (remaining === 0) this.timeout();
				else this.remaining.set(remaining);
			}, Math.min(250, Math.max(1, options.timeout)));
			this.#timer.unref();
		}
	}

	activity = (): void => {
		if (this.#closed || this.options.timeout === undefined) return;
		this.#deadline = Date.now() + this.options.timeout;
		this.remaining.set(this.options.timeout);
	};

	dispose(): void {
		if (this.#closed) return;
		this.#closed = true;
		clearInterval(this.#timer);
		this.disposeForm();
		this.sideQuestion.peek()?.close();
		this.editNote.peek()?.editor.close();
	}

	#finish(outcome: CardOutcome): void {
		if (this.#closed) return;
		this.dispose();
		this.options.done(outcome);
	}

	protected override onNote(target?: number): void {
		const active = this.active.peek();
		if (active === "submit" || this.editNote.peek()) return;
		const option = target ?? this.dropdown.peek() ?? this.row.peek();
		const field = this.field(active);
		if (field.kind !== "choice" || field.options[option]?.disabled !== false) return;
		if (target !== undefined) {
			this.row.set(target);
			if (this.dropdown.peek() !== undefined) this.dropdown.set(target);
		}
		const answer = this.answer(active);
		this.#openNote(
			{ kind: "option", field: active, option },
			`Note for ${flattenLine(spansText(field.options[option].label)) || field.options[option].value}`,
			{ text: answer.notes.get(option) ?? "", images: answer.noteImages.get(option) ?? [] },
		);
	}

	#openNote(target: NoteTarget, label: string, saved?: Note): void {
		this.hidden.set(false);
		this.editNote.set({ target, label, editor: new AskEditor(saved?.text ?? "", saved?.images ?? [], this.editorRows, this.activity) });
	}

	#saveNote(edit: NoteEdit): void {
		edit.editor.save(note => {
			batch(() => {
				const { target } = edit;
				if (target.kind === "general") this.generalNote.set(note.text.trim() ? note : undefined);
				else {
					const answers = [...this.answers.peek()];
					const answer = answers[target.field]!;
					const notes = new Map(answer.notes);
					const noteImages = new Map(answer.noteImages);
					if (note.text.trim()) notes.set(target.option, note.text);
					else notes.delete(target.option);
					if (note.images.length) noteImages.set(target.option, note.images);
					else noteImages.delete(target.option);
					answers[target.field] = { ...answer, notes, noteImages };
					this.answers.set(answers);
				}
				this.#keepNote(edit);
			});
		});
	}

	#keepNote(edit: NoteEdit): void {
		this.editNote.set(undefined);
		edit.editor.close();
	}

	#openSideQuestion(): void {
		this.hidden.set(false);
		this.sideQuestion.set(new AskEditor("", [], this.editorRows, this.activity));
	}

	#closeSideQuestion(editor: AskEditor): void {
		this.sideQuestion.set(undefined);
		editor.close();
	}

	#sendSideQuestion(editor: AskEditor): void {
		const text = editor.line.peek().text;
		const question = parseBtwQuestion(text) ?? text.trim();
		if (!question) {
			this.options.ctx.ui.notify("Type your Side question first", "warning");
			return;
		}
		const { context, images } = this.#draftContext();
		if (askBtw(this.options.ctx, question, context, images)) this.#closeSideQuestion(editor);
		else this.options.ctx.ui.notify("Side questions are unavailable in this session", "warning");
	}

	#draftContext(): { context: string; images: ImageContent[] } {
		const edit = this.editNote.peek();
		const images: ImageContent[] = [];
		const mapped = (note: Note | undefined): string | undefined => {
			if (!note?.text.trim()) return undefined;
			const text = shiftImageMarkers(note.text, images.length, note.images.length);
			images.push(...note.images);
			return text;
		};
		const fields = this.fields.map((field, index) => {
			if (!field.name || (field.kind === "text" && field.type === "password")) return undefined;
			const name = field.name;
			const question = this.question(index);
			if (field.kind === "text") return { kind: "text", name, question, answer: this.value(index) };
			const answer = this.answer(index);
			const options = field.options.flatMap((option, i) => {
				const text = answer.notes.get(i);
				const note = mapped(edit?.target.kind === "option" && edit.target.field === index && edit.target.option === i
					? edit.editor.value()
					: text === undefined ? undefined : { text, images: answer.noteImages.get(i) ?? [] });
				const picked = answer.checked.has(i);
				return picked || note ? [{ option: spansText(option.label), value: option.value, picked, note }] : [];
			});
			return { kind: "choice", name, question, options, other: answer.other.text || undefined, otherPicked: answer.otherChosen };
		}).filter(field => field !== undefined);
		const generalNote = mapped(edit?.target.kind === "general" ? edit.editor.value() : this.generalNote.peek());
		return { context: JSON.stringify({ fields, generalNote }), images };
	}

	/** Whether the focused control takes typed text, so `?` types rather than opening the Side question. */
	typingInForm(): boolean {
		const active = this.active();
		if (active === "submit") return false;
		const field = this.field(active);
		return field.kind === "text" || isDropdown(field) || this.row() === OTHER_ROW;
	}

	override key(key: KeyEvent): boolean {
		if (key.kind === "release" || this.#closed) return true;
		this.activity();
		if (key.id === "ctrl+escape") return cancelBtw(this.options.ctx);
		if (handleAskBtwKey(this.options.ctx, key.id)) return true;
		const keys = this.options.keybindings;
		const newline = keys.matches(key, "tui.input.newLine")
			|| (key.id === "enter" && key.raw === "\n" && keys.matchesId("ctrl+j", "tui.input.newLine"));
		const side = this.sideQuestion.peek();
		const edit = this.editNote.peek();
		if (side) {
			if (matchesSelectCancel(key, keys)) this.#closeSideQuestion(side);
			else if (!newline && keys.matches(key, "tui.input.submit") && !key.afterPaste) this.#sendSideQuestion(side);
			else side.key(key);
			return true;
		}
		if (key.id === SIDE_QUESTION_KEY || (key.id === "?" && !edit && !this.typingInForm())) {
			this.#openSideQuestion();
			return true;
		}
		if (edit) {
			if (matchesSelectCancel(key, keys)) this.#keepNote(edit);
			else if (newline) edit.editor.key(key);
			else if (keys.matches(key, "tui.input.submit")) {
				if (!key.afterPaste) this.#saveNote(edit);
			} else if (keys.matches(key, "app.clipboard.pasteImage")) this.#pasteNoteClipboard(edit);
			else edit.editor.key(key);
			return true;
		}
		if (key.id === TYPING_GENERAL_NOTE_KEY || (key.id === GENERAL_NOTE_KEY && !this.typingInForm())) {
			this.#openNote({ kind: "general" }, "General note", this.generalNote.peek());
		} else if (key.afterPaste && (keys.matches(key, "tui.input.submit") || keys.matches(key, "tui.select.confirm"))) return true;
		else if (matchesSelectCancel(key, keys) && this.dropdown.peek() === undefined) this.cancel();
		else return super.key(key);
		return true;
	}

	#pasteNoteClipboard(edit: NoteEdit): void {
		edit.editor.queuePaste(() => clipboardNotePaste(this.options.ctx.cwd), this.#pasteError);
	}

	override edit(box: FormBox, edit: Parameters<AskForm["edit"]>[1], masked = false): void {
		if (this.#closed || this.editNote.peek() || this.sideQuestion.peek()) return;
		this.activity();
		super.edit(box, edit, masked);
	}

	#pasteError = (message: string): void => this.options.ctx.ui.notify(message, "warning");

	override paste(text: string): void {
		if (this.#closed) return;
		const side = this.sideQuestion.peek();
		if (side) {
			side.paste(text);
			return;
		}
		const edit = this.editNote.peek();
		if (!edit) return super.paste(text);
		if (text === "") return this.#pasteNoteClipboard(edit);
		const paths = noteImagePaths(text);
		if (paths) edit.editor.queuePaste(() => loadNoteImages(paths, this.options.ctx.cwd), this.#pasteError);
		else edit.editor.paste(text);
	}

	override action(act: string, key: string): void {
		if (this.#closed) return;
		this.activity();
		const side = this.sideQuestion.peek();
		if (side) {
			if (act === "cancel") this.#closeSideQuestion(side);
			else if (act === "ask-btw") this.#sendSideQuestion(side);
			return;
		}
		const edit = this.editNote.peek();
		if (edit) {
			if (act === "cancel") this.#keepNote(edit);
			else if (act === "save-note") this.#saveNote(edit);
			return;
		}
		if (act === "general-note") this.#openNote({ kind: "general" }, "General note", this.generalNote.peek());
		else super.action(act, key);
	}

	override select(field: number, item: string, activate: boolean): void {
		if (this.#closed || this.editNote.peek() || this.sideQuestion.peek()) return;
		this.activity();
		super.select(field, item, activate);
	}
}