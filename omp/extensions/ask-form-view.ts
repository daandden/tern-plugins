/* Adapted from oh-my-pi v19.2.1. MIT notice in ask-form.ts. */
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FormBlock, FormSpan, HtmlForm } from "@oh-my-pi/pi-coding-agent/tools/html-form/parse";
import { rasterizeSvg } from "@oh-my-pi/pi-natives";
import { nativeRendering, signal, type TextEdit, UiNode } from "@oh-my-pi/pi-tui";
import { registerBlob } from "@oh-my-pi/pi-tui/native/blobs";
import { flattenLine } from "@oh-my-pi/pi-tui/text/sanitize";
import { truncate } from "@oh-my-pi/pi-tui/text/width";
import { currentTheme } from "@oh-my-pi/pi-tui/theme/runtime";
import type { TspSpan } from "@oh-my-pi/pi-wire";
import type { AskCard } from "./ask-card";
import { type FormPart, isDropdown, isFoldCaption, OTHER_ROW } from "./ask-form";

type Media =
	| { kind: "loading" }
	| { kind: "failed"; message: string }
	| { kind: "ready"; blob: string; mime: string; raster?: { blob: string; w: number; h: number } | null };

const encoder = new TextEncoder();
const IMAGE_MIMES: Readonly<Record<string, string>> = {
	".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
};

async function imageMedia(src: string, cwd: string, signal: AbortSignal): Promise<Media> {
	if (/^(?:https?:|data:)/i.test(src)) {
		const response = await fetch(src, { signal });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const mime = response.headers.get("content-type") ?? "image/png";
		const blob = registerBlob(new Uint8Array(await response.arrayBuffer()), mime);
		return { kind: "ready", mime, blob };
	}
	const file = src.startsWith("file:") ? fileURLToPath(src) : resolve(cwd, src);
	const mime = IMAGE_MIMES[extname(file).toLowerCase()] ?? "image/png";
	return { kind: "ready", mime, blob: registerBlob(await readFile(file, { signal }), mime) };
}

function standaloneSvg(markup: string): string {
	return markup.replace(/<svg\b[^>]*>/i, tag => {
		let attrs = /\sxmlns\s*=/.test(tag) ? "" : ' xmlns="http://www.w3.org/2000/svg"';
		if (markup.includes("xlink:") && !/\sxmlns:xlink\s*=/.test(tag)) attrs += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
		const box = /\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(tag);
		if (box && !/\swidth\s*=/.test(tag) && !/\sheight\s*=/.test(tag)) attrs += ` width="${box[1]}" height="${box[2]}"`;
		return tag.replace(/^<svg/i, `<svg${attrs}`);
	});
}

async function rasterize(markup: string, rows: number): Promise<NonNullable<Extract<Media, { kind: "ready" }>["raster"]>> {
	const theme = currentTheme();
	const fallback = theme.dark ? "#e5e5e7" : "#1a1a1a";
	const colors: Readonly<Record<string, string>> = {
		fg: "text", muted: "muted", border: "borderMuted", accent: "accent", success: "success",
		warning: "warning", error: "error", surface: "selectedBg", c1: "accent", c2: "borderAccent",
		c3: "success", c4: "warning", c5: "error", c6: "mdLink",
	};
	const hex = (key: string) => theme.has(key) ? theme.hex(key) : fallback;
	const themed = markup.replace(/var\(\s*--([\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_, token: string, or?: string) => {
		const key = colors[token];
		return key ? hex(key) : or?.trim() || hex("text");
	}).replace(/<svg\b[^>]*>/i, tag => tag.replace(/^<svg/i,
		`<svg${/\scolor\s*=/.test(tag) ? "" : ` color="${hex("text")}"`}${/\sfont-family\s*=/.test(tag) ? "" : ' font-family="sans-serif"'}`));
	const png = await rasterizeSvg(encoder.encode(themed), 4096, 16 * rows, 1, { widthPx: 8, heightPx: 16 });
	const pngHeader = new DataView(png.buffer, png.byteOffset, png.byteLength);
	return { blob: registerBlob(png, "image/png"), w: pngHeader.getUint32(16), h: pngHeader.getUint32(20) };
}

export function formMedia(form: HtmlForm, cwd: string, rows: number, abort: AbortSignal) {
	const states = signal<ReadonlyMap<string, Media>>(new Map());
	const set = (key: string, value: Media) => {
		if (abort.aborted) return;
		const next = new Map(states.peek());
		next.set(key, value);
		states.set(next);
	};
	form.sections.forEach((section, s) => section.blocks.forEach((block, b) => {
		const key = `c${s}.${b}`;
		if (block.kind === "image") {
			set(key, { kind: "loading" });
			void imageMedia(block.src, cwd, abort).then(ready => set(key, ready), error => set(key, { kind: "failed", message: String(error) }));
		} else if (block.kind === "svg") {
			const svg = standaloneSvg(block.markup);
			const ready = { kind: "ready" as const, mime: "image/svg+xml", blob: registerBlob(encoder.encode(svg), "image/svg+xml") };
			set(key, ready);
			if (!nativeRendering()) void rasterize(svg, rows).then(
				raster => set(key, { ...ready, raster }), () => set(key, { ...ready, raster: null }),
			);
		}
	}));
	return states;
}

const spans = (source: readonly FormSpan[]): TspSpan[] => source.map(part => ({ t: part.text, s: part.style }));
const mask = (text: string): string => "•".repeat([...text].length);

function blockNode(key: string, block: Exclude<FormBlock, { kind: "field" }>, media: Media | undefined, rows: number): UiNode {
	const identity = { key, motionKey: key };
	switch (block.kind) {
		case "text":
			return new UiNode("text", { ...identity, role: block.heading ? "omp.ask.heading" : "omp.ask.text", wrap: "word", spans: spans(block.spans) });
		case "list":
			return new UiNode("col", { ...identity, role: "omp.ask.bullets", gap: "xs", children: block.items.map((item, i) => new UiNode("text", {
				role: "omp.ask.text", wrap: "word", spans: [{ s: "muted", t: block.ordered ? `${i + 1}. ` : "• " }, ...spans(item)],
			})) });
		case "pre":
			return new UiNode("code", { ...identity, role: "omp.ask.pre", text: block.text.replaceAll("\t", "   ") });
		case "table": {
			const width = Math.max(0, ...block.rows.map(row => row.length));
			const head = block.headerRows ? block.rows[0] : undefined;
			return new UiNode("table", { ...identity, role: "omp.ask.table",
				cols: Array.from({ length: width }, (_, i) => ({ id: `c${i}`, head: spans(head?.[i] ?? []) })),
				rows: block.rows.slice(block.headerRows).map((row, i) => ({ id: `r${i}`, cells: Object.fromEntries(row.map((cell, c) => [`c${c}`, spans(cell)])) })),
			});
		}
		case "image":
		case "svg":
			if (media?.kind === "ready") return new UiNode("image", { ...identity, alt: block.alt, blob: media.blob, max: { h: `${rows}lines` } });
			return new UiNode("text", { ...identity, role: "omp.ask.text", truncate: "end", spans: [{
				s: "muted", t: `▣ ${block.alt} — ${media?.kind === "failed" ? `couldn't load: ${media.message}` : "loading…"}`,
			}] });
	}
}

function openField(card: AskCard, index: number, key: string): UiNode {
	const field = card.field(index);
	const answer = card.answer(index);
	const children: UiNode[] = [];
	if (field.label.length) children.push(new UiNode("text", {
		role: "omp.ask.label", wrap: "word", spans: [...spans(field.label), ...(field.required ? [{ s: "error", t: " *" }] : [])],
	}));
	if (field.kind === "choice") {
		const dropdown = isDropdown(field);
		const row = card.row();
		const selected = dropdown ? card.dropdown() ?? [...answer.checked][0] : row;
		const role = field.multi ? "omp.ask.check" : "omp.ask.option";
		const items = field.options.map((option, i) => {
			const checked = answer.checked.has(i);
			const note = answer.notes.get(i);
			return new UiNode("item", {
				key: `o${i}`, role, label: spans(option.label),
				...(option.disabled ? { disabled: true } : { actions: { menu: ["note"] } }),
				tone: checked ? "accent" : undefined, icon: checked && field.multi ? "check" : undefined,
				detail: note === undefined ? undefined : [{ s: "dim", t: checked ? "  ✎ " : "  ✎ draft · " }, { s: "em", t: flattenLine(note) }],
			});
		});
		const typed = flattenLine(answer.other.text);
		if (field.other && !dropdown) items.push(new UiNode("item", {
			key: "other", role, label: typed ? [{ s: "muted", t: "Other: " }, { t: typed }] : [{ t: "Other…" }],
			tone: typed && answer.otherChosen ? "accent" : undefined,
			icon: typed && answer.otherChosen && field.multi ? "check" : undefined,
		}));
		children.push(new UiNode("list", {
			key: `f${index}`, role: "omp.ask.options", selected: selected === undefined ? undefined : selected === OTHER_ROW ? "other" : `o${selected}`,
			onSelect: (item: string) => card.select(index, item, false), onActivate: (item: string) => card.select(index, item, true), children: items,
		}));
		if (!dropdown && row === OTHER_ROW) children.push(new UiNode("input", {
			key: "other-input", sendable: false, placeholder: "type your own", text: answer.other.text, cursor: answer.other.cursor,
			onEdit: (edit: TextEdit) => card.edit({ kind: "other", field: index }, edit),
		}));
	} else {
		const secret = field.type === "password";
		const input = new UiNode(field.multiline ? "editor" : "input", {
			key: "input", sendable: false, maxLines: field.multiline ? 4 : undefined, placeholder: field.placeholder || undefined,
			text: secret ? mask(answer.text.text) : answer.text.text, cursor: secret ? 0 : answer.text.cursor,
			onEdit: (edit: TextEdit) => card.edit({ kind: "text", field: index }, edit, secret),
		});
		children.push(field.multiline ? new UiNode("col", { role: "omp.field", children: input }) : input);
	}
	const error = card.error(index);
	if (error) children.push(errorText(error));
	return new UiNode("col", { key, motionKey: key, role: "omp.ask.field", gap: "xs", children });
}

function errorText(error: string): UiNode {
	return new UiNode("text", { role: "omp.ask.error", spans: [{ s: "error", t: error }] });
}

function foldSummary(card: AskCard, index: number, key: string): UiNode {
	const field = card.field(index);
	if (field.kind === "text") {
		const value = card.answer(index).text.text;
		return new UiNode("text", { key, motionKey: key, role: value.trim() ? "omp.ask.fold.answer" : "omp.ask.fold.well", truncate: "end", lines: 1,
			spans: [{ s: value.trim() ? "muted" : "dim", t: value.trim() ? (field.type === "password" ? mask(value) : flattenLine(value)) : field.placeholder || "type your answer" }],
		});
	}
	const { pills, note } = card.foldChoice(index);
	let room = Math.max(0, 4 - pills.filter(pill => pill.chosen).length);
	const shown = pills.filter(pill => pill.chosen || room-- > 0).slice(0, 4);
	const hidden = pills.length - shown.length;
	return new UiNode("row", { key, motionKey: key, role: "omp.ask.pills", gap: "xs", align: "center", wrap: true, children: [
		...shown.map((pill, i) => {
			const text = truncate(pill.label, 20, "…").replace(/\s+…$/, "…");
			return new UiNode("button", { key: `p${i}`, role: "omp.ask.pill", text, size: "sm", on: pill.chosen || undefined,
				actions: { click: pill.act }, icon: pill.chosen ? "check" : undefined, title: text === pill.label ? undefined : pill.label });
		}),
		hidden > 0 && new UiNode("button", { key: "more", role: "omp.ask.pill.more", text: `+${hidden}`, size: "sm", actions: { click: `open:${index}` }, title: "Show every option" }),
		note && new UiNode("text", { role: "omp.ask.fold.note", truncate: "end", lines: 1, spans: [{ s: "dim", t: "✎ " }, { s: "em", t: note }] }),
	] });
}

function fold(card: AskCard, index: number, key: string): UiNode {
	const issue = card.error(index);
	const mark = issue ? { s: "error", t: "!" } : card.answered(index) ? { s: "success", t: "✓" } : { s: "muted", t: "○" };
	return new UiNode("col", { key, motionKey: key, role: "omp.ask.fold", gap: "xs", actions: { click: `open:${index}` }, title: "Answer this question",
		children: [new UiNode("row", { role: "omp.ask.fold.head", align: "baseline", gap: "sm", children: [
			new UiNode("text", { role: "omp.ask.fold.mark", spans: [mark] }),
			new UiNode("text", { role: "omp.ask.fold.question", wrap: "word", spans: [{ t: card.question(index) }] }),
		] }), foldSummary(card, index, `${key}.summary`), issue && errorText(issue)],
	});
}

function parts(card: AskCard, regions: readonly FormPart[], media: ReadonlyMap<string, Media>, pictureRows: number): UiNode[] {
	const active = card.active();
	const focused = active === "submit" ? undefined : card.field(active);
	return regions.flatMap(({ section: i, start, end }) => {
		const section = card.form.sections[i]!;
		const nodes: UiNode[] = [];
		if (start === 0 && section.title.length) nodes.push(new UiNode("text", {
			key: `l${i}`, motionKey: `l${i}`, role: "omp.ask.legend", wrap: "word", spans: spans(section.title),
		}));
		for (let at = start; at < end; at++) {
			const block = section.blocks[at]!;
			if (block.kind === "field") {
				const index = card.fields.indexOf(block.field);
				nodes.push(block.field === focused ? openField(card, index, `q${index}`) : fold(card, index, `q${index}`));
			} else if (!isFoldCaption(section.blocks, at, focused, field => card.questions.get(field))) {
				const key = `c${i}.${at}`;
				nodes.push(blockNode(key, block, media.get(key), pictureRows));
			}
		}
		return nodes;
	});
}

export function formBody(card: AskCard, media: ReadonlyMap<string, Media>, pictureRows: number, reveal: number): UiNode[] {
	const { intro, groups } = card.layout;
	const active = card.active();
	const out: UiNode[] = [];
	if (intro.length) out.push(new UiNode("col", { key: "intro", motionKey: "intro", role: "omp.ask.intro", gap: "md", children: parts(card, intro, media, pictureRows) }));
	for (const group of groups) {
		const key = `g${group.index}`;
		if (active !== "submit" && group.fields.includes(active)) {
			out.push(new UiNode("col", { key, motionKey: key, role: "omp.ask.open", gap: "sm", reveal: { at: "start", n: reveal }, children: parts(card, group.parts, media, pictureRows) }));
		} else if (group.fields.length === 1) out.push(fold(card, group.fields[0]!, key));
		else out.push(new UiNode("col", { key, motionKey: key, role: "omp.ask.group", gap: "md", children: group.fields.map(index => fold(card, index, `q${index}`)) }));
	}
	return out;
}