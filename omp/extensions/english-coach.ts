import { completeSimple, type AssistantMessage } from "@oh-my-pi/pi-ai";
import { Tokenizer } from "@oh-my-pi/pi-agent-core";
import { AgentRegistry, AgentSession, discoverSlashCommands, type ExtensionAPI, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { resolveConfiguredModelPatterns } from "@oh-my-pi/pi-coding-agent/config/model-resolver";
import { getPluginSettings } from "@oh-my-pi/pi-coding-agent/extensibility/plugins/loader";
import instructions from "./english-coach.md" with { type: "text" };
import { type CoachMistake, coachCorrection } from "./english-coach-diff";
import { type CoachView, englishCoachPanel } from "./english-coach-panel";
import { registerCoachDashboard } from "./coach-dashboard";
import { type CoachMemory, openCoachMemory } from "./coach-memory";
import { coachRuleIds } from "./coach-rules";
import { checkCoachPlaceholders, prepareCoachPrompt, type PreparedCoachPrompt } from "./english-coach-prompt";
import { forwardCoachInput, observeCoachInput } from "./english-coach-input";
import { panelInterrupt, trackHostDialogs } from "./panel-layout";

const WIDGET_KEY = "omp-tools.english-coach";
const RULES = new Set(coachRuleIds);

function plainText(text: string): string {
	return text.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D\u20E3]/gu, "");
}

function readReply(reply: string, prompt: PreparedCoachPrompt) {
	if (reply === "No mistakes") return { kind: "clean" } as const;
	if (reply === "Not English") return { kind: "not-english" } as const;
	const [rewrite, ...lines] = reply.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
	if (plainText(reply) !== reply || !/^Better: \S/.test(rewrite ?? "") || lines.length === 0) {
		throw new Error("unreadable reply");
	}
	const parsed = lines.map(line => {
		const mistake = /^(?:-\s+)?(?:\[([a-z0-9-]+)\]\s+)?(.+) → (.+) \(([^)]+)\)$/.exec(line);
		if (!mistake) throw new Error("unreadable reply");
		const id = mistake[1];
		return { original: mistake[2]!, corrected: mistake[3]!, pattern: mistake[4]!, rule: id && RULES.has(id) ? id : undefined } satisfies CoachMistake & { rule?: string };
	});
	const better = rewrite!.slice("Better: ".length);
	checkCoachPlaceholders(better, lines, prompt);
	// Capitalization is never corrected: a case-only mistake is no mistake.
	const mistakes = parsed.filter(mistake => mistake.original.trim().toLowerCase() !== mistake.corrected.trim().toLowerCase());
	if (mistakes.length === 0) return { kind: "clean" } as const;
	const correction = coachCorrection(prompt, better, mistakes);
	for (const part of correction.lines.flat()) part.text = plainText(part.text);
	for (const mistake of correction.mistakes) {
		mistake.original = plainText(mistake.original);
		mistake.corrected = plainText(mistake.corrected);
		mistake.pattern = plainText(mistake.pattern);
	}
	return { kind: "correction", correction, fixes: correction.fixes.map(fix => ({
		rule: mistakes[fix.mistake]!.rule,
		example: fix.example,
	})) } as const;
}

export default function englishCoach(pi: ExtensionAPI) {
	registerCoachDashboard(pi);
	let memory: CoachMemory | undefined;
	let enabled = true;
	let disabled = false;
	let maxTokens = 300;
	let language = "Vietnamese";
	let pending: AbortController | undefined;
	let promptCommandNames: ReadonlySet<string> = new Set();
	let stopForwarding: (() => void) | undefined;
	let stopKeys: (() => void) | undefined;
	// omp 19.2.1 drops every extension's terminal input listener before a new session, branch, or fork.
	const listenForInterrupt = (_event: unknown, ctx: ExtensionContext) => {
		stopKeys?.();
		stopKeys = ctx.mode === "tui" && ctx.hasUI && ctx.agent.kind === "main"
			? ctx.ui.onTerminalInput(data => closeOnInterrupt(ctx, data))
			: undefined;
	};
	const configure = async (event: unknown, ctx: ExtensionContext) => {
		clear(ctx);
		stopForwarding?.();
		stopForwarding = observeCoachInput(ctx, observe);
		listenForInterrupt(event, ctx);
		promptCommandNames = new Set();
		const settings = await getPluginSettings("omp-tools", ctx.cwd);
		enabled = settings.englishCoach !== false;
		disabled = false;
		const limit = settings.englishCoachMaxTokens === undefined ? 300 : settings.englishCoachMaxTokens;
		const named = settings.englishCoachLanguage === undefined ? "Vietnamese" : settings.englishCoachLanguage;
		const problem = typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0
			? "englishCoachMaxTokens must be a positive number"
			: typeof named !== "string" || !named.trim()
				? "englishCoachLanguage must name a language"
				: undefined;
		if (problem) {
			disabled = true;
			if (enabled && ctx.mode === "tui" && ctx.hasUI && ctx.agent.kind === "main") {
				warn(ctx, `${problem}. Coaching is off for this session.`);
			}
			return;
		}
		maxTokens = limit as number;
		language = (named as string).trim();
		if (enabled && ctx.mode === "tui" && ctx.hasUI && ctx.agent.kind === "main") {
			try {
				// OMP 18.20.3 marks discovered prompt files with _source; bundled templates have none.
				const commands = await discoverSlashCommands({ cwd: ctx.cwd });
				promptCommandNames = new Set(commands.filter(command => command._source !== undefined).map(command => command.name));
			} catch (error) {
				disabled = true;
				reportFailure(ctx, error);
			}
		}
	};
	pi.on("session_start", configure);
	pi.on("session_switch", configure);
	pi.on("session_branch", listenForInterrupt);
	const dialogOpen = trackHostDialogs(pi);
	let shown = false;
	const warn = (ctx: ExtensionContext, text: string) => ctx.ui.notify(plainText(text), "warning");
	const show = (ctx: ExtensionContext, view: CoachView) => {
		ctx.ui.setWidget(WIDGET_KEY, ui => englishCoachPanel(ui, () => view, () => clear(ctx)), { placement: "aboveEditor" });
		shown = true;
	};
	const closeOnInterrupt = (ctx: ExtensionContext, data: string) => {
		if (!shown || !panelInterrupt(ctx, dialogOpen, data)) return undefined;
		clear(ctx);
		return { consume: true };
	};
	const reportFailure = (ctx: ExtensionContext, error: unknown) => {
		warn(ctx, `English coach: Check failed: ${error instanceof Error ? error.message : String(error)}`);
	};
	const clear = (ctx: ExtensionContext) => {
		pending?.abort();
		pending = undefined;
		if (shown) {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			shown = false;
		}
	};
	const end = (_event: unknown, ctx: ExtensionContext) => clear(ctx);
	pi.on("session_before_switch", end);
	pi.on("session_before_branch", end);
	pi.on("session_tree", end);
	pi.on("session_shutdown", (event, ctx) => {
		stopForwarding?.();
		stopForwarding = undefined;
		stopKeys?.();
		stopKeys = undefined;
		end(event, ctx);
		memory?.close();
		memory = undefined;
	});

	const check = async (ctx: ExtensionContext, input: PreparedCoachPrompt, signal: AbortSignal) => {
		if (!/[\p{L}\p{N}]/u.test(input.englishText)) return;
		const at = Date.now();
		let generation: string | undefined;
		try {
			memory ??= openCoachMemory();
			generation = memory.beginCheck();
		} catch {
			memory?.close();
			memory = undefined;
		}
		const session = AgentRegistry.global().get(ctx.agent.id)?.session;
		if (!(session instanceof AgentSession)) return;
		const ledger = session.sessionManager;
		const owner = { sessionId: ledger.getSessionId(), parentId: ledger.getLeafId() };
		let model = ctx.models.resolve("@tiny");
		const patterns = resolveConfiguredModelPatterns("@tiny", session.settings);
		if (!model) {
			const providers = patterns.flatMap(pattern => pattern.includes("/") ? [pattern.slice(0, pattern.indexOf("/"))] : []);
			await ctx.modelRegistry.refreshDiscoverableProviders(providers, "online").catch(() => undefined);
			if (signal.aborted) return;
			model = ctx.models.resolve("@tiny");
			if (!model) {
				disabled = true;
				warn(ctx, `@tiny has no model (${patterns.join(", ")}). Coaching is off for this session.`);
				return;
			}
		}
		if (!new Tokenizer(model).checkTokenBudget(input.englishText, maxTokens).fits) return;
		const apiKey = await ctx.modelRegistry.getApiKey(model, owner.sessionId, { signal });
		if (signal.aborted) return;
		if (!apiKey) {
			disabled = true;
			warn(ctx, `@tiny has no credential (${model.provider}/${model.id}). Coaching is off for this session.`);
			return;
		}
		const onAttempt = (message: AssistantMessage) => {
			if (AgentRegistry.global().get(ctx.agent.id)?.session !== session) return;
			const { api, provider, model, usage, stopReason, errorMessage } = message;
			ledger.appendModelUsage({ purpose: "english-coach", api, provider, model, usage, stopReason, errorMessage }, owner);
		};
		const result = await completeSimple(model, {
			systemPrompt: [instructions.replaceAll("{{language}}", language).replace("{{rules}}", coachRuleIds.join(", "))],
			messages: [{ role: "user", content: input.text, timestamp: Date.now() }],
		}, { apiKey, maxTokens: 2 * maxTokens + 200, disableReasoning: true, signal, onAttempt });
		if (
			signal.aborted || AgentRegistry.global().get(ctx.agent.id)?.session !== session ||
			ledger.getSessionId() !== owner.sessionId
		) return;
		if (result.stopReason === "error" || result.stopReason === "aborted") {
			throw new Error(result.errorMessage || "model call failed");
		}
		if (result.stopReason === "length") throw new Error("reply exceeded its token limit");
		const text = result.content.filter(part => part.type === "text").map(part => part.text).join("").trim();
		const reply = readReply(text, input);
		if (reply.kind === "not-english") return;
		let cue: string | undefined;
		if (memory && generation !== undefined) {
			try {
				({ cue } = memory.recordCheck({
					id: crypto.randomUUID(),
					generation,
					at,
					fixes: reply.kind === "correction" ? reply.fixes : [],
				}));
			} catch {
				memory.close();
				memory = undefined;
			}
		}
		if (reply.kind === "correction" && reply.correction.lines.some(line => line.some(part => part.change !== undefined))) {
			show(ctx, { correction: reply.correction, cue });
		}
	};

	const observe: Parameters<typeof observeCoachInput>[1] = (event, ctx) => {
		try {
			if (event.source !== "interactive" || ctx.mode !== "tui" || !ctx.hasUI || ctx.agent.kind !== "main") return undefined;
			if (!enabled || disabled) {
				clear(ctx);
				return undefined;
			}
			const input = prepareCoachPrompt(event.text, promptCommandNames);
			if (!input) {
				clear(ctx);
				return undefined;
			}
			clear(ctx);
			const abort = new AbortController();
			pending = abort;
			void check(ctx, input, abort.signal).catch(error => {
				if (!abort.signal.aborted) reportFailure(ctx, error);
			}).finally(() => {
				if (pending === abort) pending = undefined;
			});
		} catch (error) {
			reportFailure(ctx, error);
		}
		return undefined;
	};
	pi.on("input", forwardCoachInput);
}
