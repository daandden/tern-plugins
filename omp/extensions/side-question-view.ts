import type { UiNode } from "@oh-my-pi/pi-tui";
import { replaceTabs } from "@oh-my-pi/pi-tui/text/width";
import { currentTheme } from "@oh-my-pi/pi-tui/theme/runtime";
import { formatDuration, formatNumber } from "@oh-my-pi/pi-utils";
import { el } from "./panel-layout";
import type { SideQuestionCallbacks, SideQuestionToolCall } from "./side-question";

export type SideQuestionPart =
	| { type: "text"; text: string }
	| { type: "tools"; calls: SideQuestionToolCall[] }
	| { type: "notice"; text: string };

export interface SideQuestionTurn {
	question: string;
	parts: SideQuestionPart[];
	status: "running" | "complete" | "cancelled" | "error";
	error?: string;
	/** Tokens this answer's requests wrote to the cache again instead of reading them. */
	cacheMissTokens?: number;
	retry?: { attempt: number; maxAttempts: number; retryAt: number };
}

export function newTurn(question: string): SideQuestionTurn {
	return { question, parts: [], status: "running" };
}

export function hasToolCalls(turn: SideQuestionTurn): boolean {
	return turn.parts.some(part => part.type === "tools");
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
	let newMessage = true;
	let retryTimer: ReturnType<typeof setInterval> | undefined;
	const clearRetry = () => {
		clearInterval(retryTimer);
		retryTimer = undefined;
		delete turn.retry;
	};
	try {
		const answer = await run({
			onMessageStart: () => {
				newMessage = true;
				clearRetry();
				changed();
			},
			onText: text => {
				if (turn.status !== "running") return;
				const last = turn.parts.at(-1);
				if (!newMessage && last?.type === "text") last.text = text;
				else turn.parts.push({ type: "text", text });
				newMessage = false;
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
				turn.cacheMissTokens = (turn.cacheMissTokens ?? 0) + tokens;
				changed();
			},
			onRecovery: event => {
				if (turn.status !== "running") return;
				switch (event.type) {
					case "auto_retry_start":
						clearRetry();
						turn.retry = {
							attempt: event.attempt,
							maxAttempts: event.maxAttempts,
							retryAt: Date.now() + event.delayMs,
						};
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
							type: "notice",
							text: `Fallback: ${event.from} -> ${event.to}${event.reason ? `\n${event.reason}` : ""}`,
						});
						newMessage = true;
						break;
				}
				changed();
			},
		});
		if (turn.status === "running") {
			// The final message's text shows even when the provider streamed none of it.
			const streamed = !newMessage && turn.parts.at(-1)?.type === "text";
			if (answer && !streamed) turn.parts.push({ type: "text", text: answer });
			turn.status = "complete";
		}
	} catch (error) {
		if (turn.status === "running") {
			turn.status = "error";
			turn.error ??= error instanceof Error ? error.message : String(error);
		}
	} finally {
		clearRetry();
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

function runningLabel(turn: SideQuestionTurn): string {
	const retry = turn.retry;
	if (!retry) return "Answering…";
	return `Retrying (${retry.attempt}/${retry.maxAttempts}) in ${formatDuration(Math.max(0, retry.retryAt - Date.now()))}…`;
}

export function turnNode(turn: SideQuestionTurn, index: number, toolsOpen: boolean): UiNode {
	const children: UiNode[] = [
		el("card", { role: "omp.user", tone: "user", children: el("md", { text: replaceTabs(turn.question).trim() }) }),
	];
	const lastPart = turn.parts.length - 1;
	turn.parts.forEach((part, partIndex) => {
		if (part.type === "text") {
			if (part.text.trim()) {
				children.push(el("md", { text: part.text, stream: turn.status === "running" && partIndex === lastPart }));
			}
			return;
		}
		if (part.type === "notice") {
			children.push(el("text", { spans: [{ t: part.text, s: "warning" }], wrap: "word" }));
			return;
		}
		children.push(
			el("section", {
				key: `tools${index}-${partIndex}`,
				head: [{ t: summary(part.calls), s: "dim" }],
				collapsible: true,
				collapsed: !toolsOpen,
				children: el("col", {
					children: part.calls.map(call =>
						el("text", { key: call.id, spans: [{ t: callLine(call), s: "dim" }], wrap: "word" }),
					),
				}),
			}),
		);
	});
	if (turn.cacheMissTokens) children.push(el("text", { spans: [{ t: cacheMissLabel(turn.cacheMissTokens), s: "muted" }] }));
	if (turn.status === "running") {
		children.push(el("spinner", { style: "dots", label: [{ t: runningLabel(turn), s: "dim" }] }));
	} else if (turn.status === "cancelled") {
		children.push(el("text", { spans: [{ t: "Cancelled", s: "warning" }] }));
	} else if (turn.status === "error") {
		children.push(el("text", { spans: [{ t: errorText(turn), s: "error" }], wrap: "word" }));
	}
	return el("col", { key: `turn${index}`, gap: "xs", children });
}
