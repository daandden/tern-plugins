import type { ImageContent } from "@oh-my-pi/pi-ai";
import {
	compactImageMarkers,
	formatVisionMarker,
} from "@oh-my-pi/pi-coding-agent/modes/view-model/prompt/composer-attachments";
import { type KeyEvent, signal, type TextEdit, UiNode } from "@oh-my-pi/pi-tui";
import { stripControl } from "@oh-my-pi/pi-tui/text/sanitize";
import { fieldWidget } from "@oh-my-pi/pi-tui/term/widgets/editor";
import { widgetContext } from "@oh-my-pi/pi-tui/term/widgets";
import type { NotePaste } from "./ask-images";

export interface Note {
	readonly text: string;
	readonly images: readonly ImageContent[];
}

interface Line {
	readonly text: string;
	readonly cursor: number;
}

export function compactNote(text: string, images: readonly ImageContent[]): Note {
	const kept = compactImageMarkers(text, images.length, { byAppearance: true });
	return kept ? { text: kept.text, images: kept.keep.map(index => images[index]!) } : { text, images };
}

export class AskEditor {
	readonly line;
	readonly node: UiNode<"editor">;
	readonly busy = signal(false);
	readonly #images: ImageContent[];
	readonly #undo: Line[] = [];
	readonly #pastes = new Set<{ at: number }>();
	#pending: Promise<void> = Promise.resolve();
	#saved: (() => void) | undefined;
	#closed = false;

	constructor(text: string, images: readonly ImageContent[], editorRows: () => number, private readonly activity: () => void) {
		this.line = signal<Line>({ text, cursor: text.length });
		this.#images = [...images];
		this.node = new UiNode("editor", {
			key: "input",
			sendable: false,
			maxLines: editorRows,
			text: () => this.line().text,
			cursor: () => this.line().cursor,
			onEdit: (edit: TextEdit) => this.#edit(edit),
			onUndo: () => this.#revert(),
		});
	}

	value(): Note {
		return compactNote(this.line.peek().text, this.#images);
	}

	key(key: KeyEvent): void {
		if (!this.#saved) fieldWidget.key?.(this.node, key, widgetContext([this.node], { focus() {}, pageRows: 5 }));
	}

	paste(text: string): void {
		if (this.#saved) return;
		const safe = stripControl(text.replace(/\r\n?/g, "\n"));
		fieldWidget.paste?.(this.node, { text: safe }, widgetContext([this.node], { focus() {}, pageRows: 5 }));
	}

	queuePaste(read: () => Promise<NotePaste>, error: (message: string) => void): void {
		if (this.#saved) return;
		const insertion = { at: this.line.peek().cursor };
		this.#pastes.add(insertion);
		this.busy.set(true);
		this.#pending = this.#pending.then(async () => {
			if (this.#closed) return;
			try {
				const loaded = await read();
				if (this.#closed) return;
				const text = loaded.kind === "text"
					? stripControl(loaded.text.replace(/\r\n?/g, "\n"))
					: loaded.images.map(image => formatVisionMarker("image", this.#images.push(image))).join(" ");
				const at = insertion.at;
				const cursor = this.line.peek().cursor;
				this.#pastes.delete(insertion);
				this.#replace(at, at, text, cursor >= at ? cursor + text.length : cursor, true);
			} catch (cause) {
				if (!this.#closed) error(cause instanceof Error ? cause.message : String(cause));
			} finally {
				this.#pastes.delete(insertion);
				if (!this.#closed && !this.#pastes.size) {
					this.busy.set(false);
					this.#saved?.();
				}
			}
		});
	}

	save(commit: (note: Note) => void): void {
		const finish = () => commit(this.value());
		if (this.#pastes.size) this.#saved = finish;
		else finish();
	}

	close(): void {
		this.#closed = true;
		this.#pastes.clear();
		this.#saved = undefined;
		this.node.dispose();
	}

	#edit(edit: TextEdit): void {
		if (this.#saved || this.#closed) return;
		const { text } = this.line.peek();
		if (edit.len !== text.length || edit.from < 0 || edit.to < edit.from || edit.to > text.length) return;
		this.activity();
		const inserted = stripControl(edit.text.replace(/\r\n?/g, "\n"));
		this.#replace(edit.from, edit.to, inserted, edit.cursor - (edit.text.length - inserted.length));
	}

	#revert(): void {
		if (this.#saved || this.#closed || this.#pastes.size) return;
		const previous = this.#undo.pop();
		if (previous) this.line.set(previous);
		this.activity();
	}

	#replace(from: number, to: number, inserted: string, cursor: number, earlierPaste = false): void {
		const before = this.line.peek();
		const text = before.text.slice(0, from) + inserted + before.text.slice(to);
		if (text !== before.text) {
			if (this.#undo.length === 100) this.#undo.shift();
			this.#undo.push(before);
			const delta = inserted.length - (to - from);
			for (const insertion of this.#pastes) {
				if (from === to) {
					if (insertion.at > from || (earlierPaste && insertion.at === from)) insertion.at += delta;
				} else if (insertion.at >= to) insertion.at += delta;
				else if (insertion.at > from) insertion.at = from + inserted.length;
			}
		}
		this.line.set({ text, cursor: Math.max(0, Math.min(cursor, text.length)) });
	}
}