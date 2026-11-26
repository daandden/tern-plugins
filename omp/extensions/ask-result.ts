import type { ImageContent } from "@oh-my-pi/pi-ai";
import { type AgentToolResult, askPresenter, type AskToolDetails } from "@oh-my-pi/pi-coding-agent";
import { shiftImageMarkers } from "@oh-my-pi/pi-coding-agent/modes/view-model/prompt/composer-attachments";
import { recoverAskHtml } from "@oh-my-pi/pi-coding-agent/tools/ask";
import { fieldError, formAnswers, type OptionNote } from "@oh-my-pi/pi-coding-agent/tools/html-form/data";
import type { HtmlForm } from "@oh-my-pi/pi-coding-agent/tools/html-form/parse";
import type { ToolViewState } from "@oh-my-pi/pi-coding-agent/ui/tools/contract";
import { derivedNode, resolveChildren, UiNode } from "@oh-my-pi/pi-tui";
import { defineRolePainter, painterFor } from "@oh-my-pi/pi-tui/term/paint";
import { flattenLine, stripControl } from "@oh-my-pi/pi-tui/text/sanitize";
import { replaceTabs } from "@oh-my-pi/pi-tui/text/width";
import type { CardOutcome } from "./ask-card";

export interface AskDetails extends AskToolDetails {
	generalNote?: string;
}

export function askResult(form: HtmlForm, outcome: Exclude<CardOutcome, { kind: "cancelled" }>): AgentToolResult<AskDetails> {
	const { data, notes: selected, generalNote } = outcome;
	const timedOut = outcome.kind === "expired";
	if (timedOut && form.fields.some(field => field.name && fieldError(field, data[field.name]))) {
		return {
			content: [{ type: "text", text: "The ask timed out before the user answered its required fields; no answer was given." }],
			details: { answers: [], timedOut: true },
		};
	}
	const images: ImageContent[] = [];
	const mapMarkers = (text: string, attached: readonly ImageContent[]): string => {
		const mapped = shiftImageMarkers(text, images.length, attached.length);
		images.push(...attached);
		return mapped;
	};
	const notes = selected.map(({ images, ...note }) => ({ ...note, text: mapMarkers(note.text, images ?? []) }));
	const general = generalNote && mapMarkers(generalNote.text, generalNote.images);
	const details: AskDetails = {
		answers: formAnswers(form, data),
		...(notes.length ? { notes } : {}),
		...(general ? { generalNote: general } : {}),
		...(timedOut ? { timedOut } : {}),
	};
	const intro = timedOut
		? "No answer before the timeout; submitted the form's current values (not a user choice):"
		: "User answers:";
	const text = [
		`${intro}\n${JSON.stringify(data, null, 2)}`,
		notes.length ? `Option notes:\n${notes.map(note => `- ${flattenLine(note.question)}: ${flattenLine(note.option)} [${note.name}=${JSON.stringify(note.value)}] — ${note.text}`).join("\n")}` : "",
		general ? `General note:\n${general}` : "",
	].filter(Boolean).join("\n\n");
	return { content: [{ type: "text", text }, ...images], details };
}

const RESULT_ROLE = "omp-tools.ask-result";
const ASK_TRANSCRIPT_ROLE = "omp.tool.ask";
const transcriptTerms = new WeakMap<UiNode, Readonly<Record<string, unknown>>>();
const transcriptNodes = new WeakMap<UiNode, UiNode>();

function transcriptTerm(node: UiNode): Readonly<Record<string, unknown>> | undefined {
	const props = node.props();
	const term = "term" in props ? props.term : undefined;
	if (!term || typeof term !== "object" || !("look" in term) || term.look !== "legacy" || !("parts" in term) || !Array.isArray(term.parts)) return;
	for (const part of term.parts) {
		if (part instanceof UiNode) {
			const result = transcriptTerms.get(part);
			if (result) return result;
		}
	}
}

// The legacy render hook wraps its output in a custom-tool rectangle. Use
// the native Ask frame when this hook owns the result, and leave native Ask
// (including /tree) and other extensions' renderers alone.
const hostAskPainter = painterFor(new UiNode("tool", { role: ASK_TRANSCRIPT_ROLE }));
if (hostAskPainter) defineRolePainter("tool", ASK_TRANSCRIPT_ROLE, (node, cx) => {
	if (!transcriptTerm(node)) return hostAskPainter(node, cx);
	let native = transcriptNodes.get(node);
	if (!native) {
		native = derivedNode(node, props => {
			const legacy = "term" in props ? props.term : undefined;
			return { ...props, term: { ...(typeof legacy === "object" ? legacy : {}), ...transcriptTerm(node) } };
		});
		transcriptNodes.set(node, native);
		node.onDispose(() => native?.dispose());
	}
	return hostAskPainter(native, cx);
});

defineRolePainter("col", RESULT_ROLE, (node, cx) => {
	const props = node.props();
	const term = "term" in props ? props.term : undefined;
	return term instanceof UiNode ? cx.paint(term, cx.width) : { rows: [] };
});

function noteRows(text: string, option?: string): UiNode[] {
	return text.split("\n").map((line, index) => new UiNode("text", {
		role: "omp.tool.answer.note",
		wrap: "word",
		spans: index === 0 && option !== undefined
			? [{ t: "✎ ", s: "dim" }, { t: `${flattenLine(option)}: ${line}`, s: "em" }]
			: [{ t: line || " ", s: "em" }],
	}));
}

function bodyWithMultilineNotes(body: readonly UiNode[], notes: readonly OptionNote[], answers: AskToolDetails["answers"]): UiNode[] {
	return body.map((section, index) => {
		const answer = answers[index];
		if (section.kind !== "section" || !answer) return section;
		const forAnswer = notes.filter(note => note.name === answer.name && note.question === answer.question);
		if (!forAnswer.length) return section;
		return new UiNode("section", { key: section.key, children: [
			...section.children().filter(node => {
				const props = node.props();
				return !("role" in props && props.role === "omp.tool.answer.note");
			}),
			...forAnswer.flatMap(note => noteRows(clean(note.text), clean(note.option))),
		] });
	});
}

function clean(text: string): string {
	return replaceTabs(stripControl(text));
}

export function renderAskResult(result: AgentToolResult<AskDetails>, options: { expanded: boolean; isPartial: boolean }, args: unknown): UiNode | undefined {
	const state: ToolViewState = { ...options, argsComplete: true, executionStarted: true };
	const html = recoverAskHtml(args);
	const details = result.details;
	const visible = details?.answers?.length ? details : undefined;
	const view = askPresenter.result?.({ ...result, details: visible }, state, html === undefined ? undefined : { html });
	if (!view) return undefined;
	const general = visible?.generalNote && clean(visible.generalNote);
	const notes = visible?.notes ?? [];
	const answers = visible?.answers ?? [];
	const nativeTerm = view.term;
	const termAnswers = nativeTerm?.answers;
	const term = {
		...nativeTerm,
		look: "ask",
		expanded: state.expanded,
		...(Array.isArray(termAnswers) ? {
			answers: [
				...termAnswers.map((answer, index) => ({
					...answer,
					notes: notes.filter(note => note.name === answers[index]?.name && note.question === answers[index]?.question)
						.map(note => `✎ ${flattenLine(clean(note.option))}: ${clean(note.text)}`),
				})),
				...(general ? [{ question: "General note", shown: general, notes: [] }] : []),
			],
		} : {}),
	};
	const node = new UiNode("col", {
		role: RESULT_ROLE,
		term: new UiNode("tool", { role: ASK_TRANSCRIPT_ROLE, name: "ask", term: { ...term, margin: false } }),
		children: [
			...bodyWithMultilineNotes(resolveChildren(view.body)(), notes, answers),
			general && new UiNode("section", { key: "general-note", children: [
				new UiNode("text", { text: "General note", wrap: "word" }),
				...noteRows(general),
			] }),
		],
	});
	transcriptTerms.set(node, term);
	return node;
}