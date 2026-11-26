import type { ImageContent } from "@oh-my-pi/pi-ai";
import { settings } from "@oh-my-pi/pi-coding-agent";
import { cfgImagesAutoResize } from "@oh-my-pi/pi-coding-agent/modes/settings";
import { extractImagePastePathsFromText } from "@oh-my-pi/pi-coding-agent/modes/view-model/prompt/custom-editor";
import {
	isClipboardTerminalLocal,
	readImageFromClipboard,
	readMacFileUrlsFromClipboard,
	readTextFromClipboard,
} from "@oh-my-pi/pi-coding-agent/utils/clipboard";
import { loadImageAttachmentInput, loadImageInput } from "@oh-my-pi/pi-coding-agent/utils/image-loading";

export type NotePaste = { kind: "text"; text: string } | { kind: "images"; images: ImageContent[] };

/** The native path recognizer also accepts videos, which a Note cannot attach. */
export function noteImagePaths(paste: string): string[] | undefined {
	const paths = extractImagePastePathsFromText(paste);
	return paths?.every(path => /\.(?:png|jpe?g|gif|webp)$/i.test(path)) ? paths : undefined;
}

export async function loadNoteImages(paths: readonly string[], cwd: string): Promise<NotePaste> {
	const images: ImageContent[] = [];
	for (const path of paths) {
		const loaded = await loadImageInput({ path, cwd, autoResize: cfgImagesAutoResize.get(settings) });
		if (!loaded) throw new Error(`Unsupported image: ${path}`);
		images.push({ type: "image", data: loaded.data, mimeType: loaded.mimeType });
	}
	return { kind: "images", images };
}

export async function clipboardNotePaste(cwd: string): Promise<NotePaste> {
	if (!isClipboardTerminalLocal()) throw new Error("Use your terminal's paste shortcut to paste from your machine");
	const urls = await readMacFileUrlsFromClipboard();
	const files = urls.flatMap(url => noteImagePaths(url) ?? []);
	if (files.length > 0) return loadNoteImages(files, cwd);

	const bitmap = await readImageFromClipboard();
	if (bitmap) {
		const loaded = await loadImageAttachmentInput({
			image: { type: "image", mimeType: bitmap.mimeType, data: bitmap.data.toBase64() },
			label: "clipboard image",
			uri: "clipboard",
			autoResize: cfgImagesAutoResize.get(settings),
		});
		if (!loaded) throw new Error(`Unsupported clipboard image format: ${bitmap.mimeType}`);
		return { kind: "images", images: [{ type: "image", mimeType: loaded.mimeType, data: loaded.data }] };
	}
	const text = await readTextFromClipboard();
	if (!text) throw new Error("Clipboard is empty");
	const paths = noteImagePaths(text);
	return paths ? loadNoteImages(paths, cwd) : { kind: "text", text };
}