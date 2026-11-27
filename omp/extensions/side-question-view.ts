import type { UiNode } from "@oh-my-pi/pi-tui";
import { replaceTabs, truncate } from "@oh-my-pi/pi-tui/text/width";
import { currentTheme } from "@oh-my-pi/pi-tui/theme/runtime";
import { formatDuration, formatNumber } from "@oh-my-pi/pi-utils";
import { el } from "./panel-layout";
import type { SideQuestionCallbacks, SideQuestionToolCall } from "./side-question";

export type SideQuestionPart =
	| { type: "text"; text: string }
	| { type: "tools"; calls: SideQuestionToolCall[] }
	| { type: "fallback"; text: string }
	| { type: "retry"; attempt: number; maxAttempts: number; retryAt?: number; error: string };

export interface SideQuestionTurn {
	question: string;
	parts: SideQuestionPart[];
	status: "running" | "complete" | "cancelled" | "error";
	error?: string;
	/** Tokens this answer's requests wrote to the cache again instead of reading them. */
	cacheMissTokens?: number;
	/** `Date.now()` when the question was asked, and when its answer settled. */
	startedAt: number;
	endedAt?: number;
}

export function newTurn(question: string): SideQuestionTurn {
	return { question, parts: [], status: "running", startedAt: Date.now() };
}

/** How long the turn has taken so far, or took. */
export function turnElapsed(turn: SideQuestionTurn, now = Date.now()): number {
	return Math.max(0, (turn.endedAt ?? now) - turn.startedAt);
}

export function hasTurnDetails(turn: SideQuestionTurn): boolean {
	return !!turn.cacheMissTokens || turn.parts.some(part => part.type !== "text");
}

export function latestAnswer(turns: readonly SideQuestionTurn[]): string | undefined {
	for (let index = turns.length - 1; index >= 0; index--) {
		const turn = turns[index]!;
		if (turn.status === "running") continue;
		const answer = turn.parts.findLast(part => part.type === "text" && !!part.text.trim());
		if (answer?.type === "text") return replaceTabs(answer.text).trim();
	}
	return undefined;
}

/**
 * Streams one answer into `turn` and settles its status; `changed` runs after
 * every update. A turn already marked cancelled keeps that status. Never rejects.
 */
export async function answerInto(
	turn: SideQuestionTurn,
	run: (callbacks: SideQuestionCallbacks) => Promise<string>,
	changed: () => void,
): Promise<void> {
	// A new message's text goes in a new part, so it never replaces an earlier message's text.
	let textPart: Extract<SideQuestionPart, { type: "text" }> | undefined;
	let retry: Extract<SideQuestionPart, { type: "retry" }> | undefined;
	let retryTimer: ReturnType<typeof setInterval> | undefined;
	const clearRetry = () => {
		clearInterval(retryTimer);
		retryTimer = undefined;
		if (retry) delete retry.retryAt;
		retry = undefined;
	};
	try {
		const answer = await run({
			onMessageStart: () => {
				if (turn.status !== "running") return;
				textPart = undefined;
				clearRetry();
				changed();
			},
			onText: text => {
				if (turn.status !== "running") return;
				if (textPart) textPart.text = text;
				else turn.parts.push(textPart = { type: "text", text });
				changed();
			},
			onToolCall: call => {
				if (turn.status !== "running") return;
				for (const part of turn.parts) {
					if (part.type !== "tools") continue;
					const index = part.calls.findIndex(known => known.id === call.id);
					if (index < 0) continue;
					part.calls[index] = { ...call };
					changed();
					return;
				}
				const last = turn.parts.at(-1);
				if (last?.type === "tools") last.calls.push({ ...call });
				else turn.parts.push({ type: "tools", calls: [{ ...call }] });
				changed();
			},
			onCacheMiss: tokens => {
				if (turn.status !== "running") return;
				turn.cacheMissTokens = (turn.cacheMissTokens ?? 0) + tokens;
				changed();
			},
			onRecovery: event => {
				if (turn.status !== "running") return;
				switch (event.type) {
					case "auto_retry_start":
						clearRetry();
						textPart = undefined;
						retry = {
							type: "retry",
							attempt: event.attempt,
							maxAttempts: event.maxAttempts,
							retryAt: Date.now() + event.delayMs,
							error: event.errorMessage,
						};
						turn.parts.push(retry);
						retryTimer = setInterval(changed, 250);
						retryTimer.unref();
						break;
					case "auto_retry_end":
						clearRetry();
						if (!event.success) {
							turn.error = `Retry failed after ${event.attempt} attempts: ${event.finalError || "Unknown error"}`;
						}
						break;
					case "retry_fallback_applied":
						turn.parts.push({
							type: "fallback",
							text: `Fallback: ${event.from} -> ${event.to}${event.reason ? `\n${event.reason}` : ""}`,
						});
						textPart = undefined;
						break;
				}
				changed();
			},
		});
		if (turn.status === "running") {
			// The final message's text shows even when the provider streamed none of it.
			if (answer && !textPart?.text.trim()) turn.parts.push({ type: "text", text: answer });
			turn.status = "complete";
		}
	} catch (error) {
		if (turn.status === "running") {
			turn.status = "error";
			turn.error ??= error instanceof Error ? error.message : String(error);
		}
	} finally {
		clearRetry();
		turn.endedAt ??= Date.now();
	}
	changed();
}

const STATUS_NOTE: Record<SideQuestionToolCall["status"], string> = {
	running: " …",
	done: "",
	error: " (failed)",
};

function summary(calls: readonly SideQuestionToolCall[]): string {
	const running = calls.some(call => call.status === "running");
	return [`${calls.length} tool call${calls.length === 1 ? "" : "s"}`, ...(running ? ["running"] : [])].join(" · ");
}

function callLine(call: SideQuestionToolCall): string {
	return `${call.name}${call.target ? ` ${call.target}` : ""}${STATUS_NOTE[call.status]}`;
}

function errorText(turn: SideQuestionTurn): string {
	return `Error: ${replaceTabs(turn.error ?? "Failed").replace(/\s+/g, " ").trim()}`;
}

/** OMP's cache-miss marker label, `⊘ cache miss · 214.4k tokens`. */
function cacheMissLabel(tokens: number): string {
	const icon = currentTheme().symbols.symbol("icon.cacheMiss");
	return `${icon ? `${icon} ` : ""}cache miss · ${formatNumber(tokens)} tokens`;
}

function details(key: string, label: string, open: boolean, children: UiNode): UiNode {
	return el("section", {
		key,
		head: [{ t: label, s: "dim" }],
		collapsible: true,
		collapsed: !open,
		children,
	});
}

function detailText(text: string): UiNode {
	return el("text", { spans: [{ t: text, s: "dim" }], wrap: "word" });
}

export function ternTurnStatus(turn: SideQuestionTurn): UiNode | undefined {
	switch (turn.status) {
		case "running":
			return el("text", {
				key: "status",
				role: "omp.btw.note.status",
				spans: [{ s: "accent", t: "●", fx: "pulse" }, { s: "accent", t: " Answering" }],
			});
		case "cancelled":
			return el("text", { key: "status", role: "omp.btw.note.status", spans: [{ s: "warning", t: "Cancelled" }] });
		case "error":
			return el("text", { key: "status", role: "omp.btw.note.status", spans: [{ s: "error", t: "Failed" }] });
	}
}

export function turnNode(turn: SideQuestionTurn, index: number, detailsOpen: boolean, native = false): UiNode {
	const children: UiNode[] = [];
	if (index > 0) {
		children.push(el("md", { role: "omp.btw.followup", text: replaceTabs(turn.question).trim() }));
	}
	const last = turn.parts.findLast(part => part.type === "text");
	for (const [partIndex, part] of turn.parts.entries()) {
		const key = `part-${partIndex}`;
		switch (part.type) {
			case "text":
				if (part.text.trim()) {
					children.push(el("md", { key, text: part.text, stream: turn.status === "running" && part === last }));
				}
				break;
			case "tools":
				children.push(details(key, summary(part.calls), detailsOpen, el("col", {
					children: part.calls.map(call =>
						el("text", { key: call.id, spans: [{ t: callLine(call), s: "dim" }], wrap: "word" }),
					),
				})));
				break;
			case "fallback":
				children.push(details(key, "Model fallback", detailsOpen, detailText(part.text)));
				break;
			case "retry": {
				const attempt = `${part.attempt}/${part.maxAttempts}`;
				const label = part.retryAt !== undefined && turn.status === "running"
					? `Retrying (${attempt}) in ${formatDuration(Math.max(0, part.retryAt - Date.now()))}…`
					: `Retry (${attempt})`;
				children.push(details(key, label, detailsOpen, detailText(part.error)));
				break;
			}
		}
	}
	if (turn.cacheMissTokens) {
		children.push(details("cache", cacheMissLabel(turn.cacheMissTokens), detailsOpen,
			detailText("The provider wrote these prompt tokens to the cache again instead of reading them.")));
	}
	if (turn.status === "error") {
		children.push(el("text", { role: "omp.btw.error", spans: [{ t: errorText(turn), s: "error" }], wrap: "word" }));
	} else if (!last?.text.trim() && (turn.status === "running" || turn.status === "complete")) {
		const pending = native ? "Thinking…" : `${currentTheme().symbols.symbol("status.pending")} Waiting for response…`;
		const text = turn.status === "running" ? pending : native ? "No answer text." : "No text returned.";
		children.push(el("text", { role: "omp.btw.pending", spans: [{ t: text, s: "dim" }] }));
	}
	return el("col", { key: `turn-${index}`, role: native ? "omp.btw.note.turn" : undefined, gap: native ? "sm" : "xs", children });
}

/** A settled earlier turn folded to its question and the start of its answer; the section opens in place. */
export function earlierTurnNode(turn: SideQuestionTurn, index: number, detailsOpen: boolean): UiNode {
	const answer = turn.parts.findLast(part => part.type === "text" && !!part.text.trim());
	const preview = answer?.type === "text" ? truncate(replaceTabs(answer.text).replace(/\s+/g, " ").trim(), 90, "…") : "";
	const question = replaceTabs(turn.question).replace(/\s+/g, " ").trim();
	return el("section", {
		key: `earlier-${index}`,
		role: "omp-tools.btw.earlier",
		head: [{ t: question }, ...(preview ? [{ t: `  ${preview}`, s: "dim" }] : [])],
		collapsible: true,
		collapsed: true,
		children: turnNode(turn, 0, detailsOpen, true),
	});
}
