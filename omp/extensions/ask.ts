import {
	type AgentToolResult,
	type ExtensionAPI,
	type ExtensionContext,
	getKeybindings,
	logger,
	settings,
	type ToolDefinition,
} from "@oh-my-pi/pi-coding-agent";
import { AskTool, recoverAskHtml } from "@oh-my-pi/pi-coding-agent/tools/ask";
import { fieldQuestions } from "@oh-my-pi/pi-coding-agent/tools/html-form/data";
import { type HtmlForm, parseHtmlForm } from "@oh-my-pi/pi-coding-agent/tools/html-form/parse";
import { ToolAbortError } from "@oh-my-pi/pi-coding-agent/tools/tool-errors";
import { cfgAskEnabled } from "@oh-my-pi/pi-coding-agent/tools/settings";
import type { ExtensionUIDialogOptions } from "@oh-my-pi/pi-coding-agent";
import { holdBlockedStatus } from "@oh-my-pi/pi-coding-agent/utils/run-status";
import { createRoot } from "@oh-my-pi/pi-tui";
import { AskCard, type CardOutcome } from "./ask-card";
import { type AskDetails, askResult, renderAskResult } from "./ask-result";
import { holdAskBtwFocus } from "./btw";
import { askCardView } from "./ask-view";

const FLOW_ASK_DIALOG = Symbol.for("vstack.flow-page.ask-dialog");

interface FlowAskDialog {
	html: string;
	toolCallId: string;
	signal: AbortSignal;
}

function registerFlowDialog(ui: ExtensionContext["ui"], open: FlowAskDialog): (() => void) | undefined {
	const hook: unknown = Reflect.get(ui, FLOW_ASK_DIALOG);
	if (typeof hook !== "function") return;
	try {
		const dispose: unknown = hook.call(ui, open);
		if (typeof dispose === "function") return () => {
			try {
				dispose();
			} catch (error) {
				logger.warn("Ask card: Flow page hook failed to settle", { error: String(error) });
			}
		};
	} catch (error) {
		logger.warn("Ask card: Flow page hook failed to open", { error: String(error) });
	}
}

function nativeAsk(ctx: ExtensionContext): AskTool {
	const plan = ctx.sessionModes?.getState().plan;
	return new AskTool({
		cwd: ctx.cwd,
		hasUI: ctx.hasUI,
		settings,
		getSessionFile: () => ctx.sessionManager.getSessionFile?.() ?? null,
		getSessionSpawns: () => null,
		getPlanModeState: () => plan?.status === "active"
			? { enabled: true, planFilePath: plan.planFilePath ?? "" }
			: undefined,
	});
}

async function showAsk(ctx: ExtensionContext, form: HtmlForm, open: FlowAskDialog, dialog: ExtensionUIDialogOptions | undefined): Promise<CardOutcome> {
	const first = form.fields.find(field => field.name);
	const question = first && (fieldQuestions(form).get(first) ?? first.name);
	let card: AskCard | undefined;
	let disposeView: (() => void) | undefined;
	let releaseBtwFocus: (() => void) | undefined;
	let releaseStatus: (() => void) | undefined;
	let disposeFlow: (() => void) | undefined;
	const customOptions = { signal: dialog?.signal ?? open.signal, timeout: dialog?.timeout };
	try {
		return await ctx.ui.custom<CardOutcome>((ui, _theme, keybindings, done) => {
			const terminalRows = () => ui.size().rows;
			const bindings = keybindings ?? getKeybindings();
			const model = card = new AskCard(form, { ctx, keybindings: bindings, terminalRows, timeout: dialog?.timeout, done });
			const view = createRoot(dispose => {
				disposeView = dispose;
				return askCardView(model, ctx.cwd, terminalRows, bindings);
			});
			releaseBtwFocus = holdAskBtwFocus(ctx);
			releaseStatus = holdBlockedStatus({ state: "blocked", kind: "question", msg: question });
			disposeFlow = registerFlowDialog(ctx.ui, open);
			return view;
		}, customOptions);
	} finally {
		try {
			card?.dispose();
			disposeView?.();
		} finally {
			try {
				disposeFlow?.();
				releaseBtwFocus?.();
			} finally {
				releaseStatus?.();
			}
		}
	}
}

async function executeCard(
	native: AskTool, ctx: ExtensionContext, toolCallId: string, params: { html: string }, signal: AbortSignal | undefined,
): Promise<AgentToolResult<AskDetails>> {
	const lifecycleSignal = signal ?? new AbortController().signal;
	let answered: { form: HtmlForm; outcome: Exclude<CardOutcome, { kind: "cancelled" }> } | undefined;
	const result = await native.execute(toolCallId, params, signal, undefined, {
		...ctx,
		ui: {
			...ctx.ui,
			formDialog: async (html: string, dialog?: ExtensionUIDialogOptions) => {
				const form = parseHtmlForm(html);
				const outcome = await showAsk(ctx, form, { html, toolCallId, signal: lifecycleSignal }, dialog);
				if (outcome.kind === "cancelled") return undefined;
				answered = { form, outcome };
				return { data: outcome.data, timedOut: outcome.kind === "expired" };
			},
		},
	} as Parameters<AskTool["execute"]>[4]);
	return answered ? askResult(answered.form, answered.outcome) : result;
}

export default function ask(pi: ExtensionAPI): void {
	const type = pi.arktype;
	const parameters = type({ html: type("string").describe("one HTML <form>") });
	const tool: ToolDefinition<typeof parameters, AskDetails> = {
		name: "ask",
		label: "Ask",
		parameters,
		approval: "read",
		strict: true,
		description: `${new AskTool({ cwd: "", hasUI: true, getSessionFile: () => null, getSessionSpawns: () => null, settings }).description.trimEnd()}

Notes and the General note preserve line breaks. Attached images follow numbered markers. Automatic timeout values are not user consent.`,
		renderCall: () => undefined,
		renderResult: (result, options, _theme, args) => renderAskResult(result, options, args),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			if (ctx.mode !== "tui" || !ctx.hasUI) {
				if (!ctx.invokeTool) throw new ToolAbortError("Native ask tool unavailable for delegation");
				return ctx.invokeTool<AskDetails>(params, { signal, onUpdate });
			}
			if (!cfgAskEnabled.get(settings)) throw new ToolAbortError("Ask is disabled in omp's tool settings");
			const html = recoverAskHtml(params);
			return executeCard(nativeAsk(ctx), ctx, toolCallId, html === undefined ? params : { html }, signal);
		},
	};
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui" || !ctx.hasUI) return;
		if (!pi.getAllTools().some(info => info.name === "ask" && info.sourceInfo.source === "builtin")) return;
		pi.registerTool(Object.assign(tool, { concurrency: "exclusive" as const, lenientArgValidation: true, mergeCallAndResult: true }));
	});
}