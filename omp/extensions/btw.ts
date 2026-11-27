import type { ImageContent } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { copyToClipboard } from "@oh-my-pi/pi-coding-agent/utils/clipboard";
import { type KeyEvent, signal, untrack } from "@oh-my-pi/pi-tui";
import { decodeInput } from "@oh-my-pi/pi-tui/driver/input/decoder";
import { terminalCapabilities } from "@oh-my-pi/pi-tui/driver/session";
import { btwPanel, btwPanelKeys, type BtwPanelAction, type BtwPanelState, btwReader } from "./btw-panel";
import { forwardCoachInput } from "./english-coach-input";
import { holdOverlay, panelInterrupt, trackHostDialogs } from "./panel-layout";
import { LazySideQuestionThread, sideQuestionsAvailable } from "./side-question";
import { answerInto, hasTurnDetails, latestAnswer, newTurn, type SideQuestionTurn } from "./side-question-view";

const WIDGET_KEY = "omp-tools.btw";
const BTW_COMMAND = /^\/btw(?:\s+([\s\S]*))?$/;

interface BtwSession {
	readonly askFocus: ReturnType<typeof signal<number>>;
	dialogOpen?: () => boolean;
	cycle?: BtwCycle;
}

type BtwSessions = WeakMap<ExtensionContext["sessionManager"], BtwSession>;
const CYCLES = Symbol.for("omp-tools.btw-sessions");
const host = globalThis as unknown as Record<symbol, BtwSessions | undefined>;
const sessions = host[CYCLES] ??= new WeakMap();

function sessionOf(manager: ExtensionContext["sessionManager"]): BtwSession {
	let session = sessions.get(manager);
	if (!session) sessions.set(manager, (session = { askFocus: signal(0) }));
	return session;
}

export function holdAskBtwFocus(ctx: ExtensionContext): () => void {
	const { askFocus } = sessionOf(ctx.sessionManager);
	askFocus.set(askFocus.peek() + 1);
	let held = true;
	return () => {
		if (!held) return;
		held = false;
		askFocus.set(askFocus.peek() - 1);
	};
}

export function handleAskBtwKey(ctx: ExtensionContext, keyId: KeyEvent["id"]): boolean {
	const session = sessions.get(ctx.sessionManager);
	if (!session?.askFocus.peek()) return false;
	return session.cycle?.handleKey(keyId, true) ?? false;
}

export function askBtw(ctx: ExtensionContext, question: string, draftContext?: string, images?: ImageContent[]): boolean {
	if (!ctx.hasUI || ctx.mode !== "tui" || !question.trim() || !sideQuestionsAvailable(ctx)) return false;
	const session = sessionOf(ctx.sessionManager);
	session.cycle ??= new BtwCycle(ctx, session);
	session.cycle.ask(question, draftContext, images);
	return true;
}

export function cancelBtw(ctx: ExtensionContext): boolean {
	return sessions.get(ctx.sessionManager)?.cycle?.cancel() ?? false;
}

/** The question of a `/btw <question>` line; `undefined` for bare `/btw` (native history) and anything else. */
export function parseBtwQuestion(text: string): string | undefined {
	const question = BTW_COMMAND.exec(text)?.[1]?.trim();
	return question || undefined;
}

class BtwCycle {
	readonly #ctx: ExtensionContext;
	readonly #thread: LazySideQuestionThread;
	#turns: SideQuestionTurn[] = [];
	#followUpsEnded = false;
	#abort: AbortController | undefined;
	#toolsOpen = false;
	#folded = false;
	#copied = false;
	#fromAsk = false;
	readonly #revision = signal(0);
	#shown = false;
	#closeReader: (() => void) | undefined;
	readonly #dialogOpen: () => boolean;
	readonly #stopKeys: () => void;
	readonly #stopComposerKeys: () => void;

	constructor(ctx: ExtensionContext, private readonly session: BtwSession) {
		this.#ctx = ctx;
		this.#dialogOpen = () => this.session.askFocus.peek() > 0 || (this.session.dialogOpen?.() ?? false);
		this.#thread = new LazySideQuestionThread(ctx);
		this.#stopKeys = ctx.ui.onTerminalInput(data => this.#handleInterrupt(data));
		this.#stopComposerKeys = ctx.ui.composer?.addKeyHandler(key => this.#handleComposerKey(key)) ?? (() => {});
	}

	ask(question: string, draftContext?: string, images?: ImageContent[]): void {
		if (this.#abort) {
			const cancel = draftContext === undefined ? "Esc" : "Ctrl+Esc";
			this.#ctx.ui.notify(`Wait for the side question's answer, or press ${cancel} to cancel it.`, "warning");
			return;
		}
		if (this.#followUpsEnded) this.#endThread();
		const turn = newTurn(question);
		this.#turns.push(turn);
		this.#folded = false;
		this.#copied = false;
		this.#fromAsk = draftContext !== undefined;
		const abort = new AbortController();
		this.#abort = abort;
		this.#show();
		void answerInto(
			turn,
			async callbacks =>
				(await this.#thread.get(abort.signal)).ask(question, callbacks, abort.signal, images, draftContext),
			() => { if (this.#abort === abort) this.#render(); },
		).then(() => {
			if (this.#abort !== abort) return;
			this.#abort = undefined;
			if (this.#followUpsEnded) void this.#thread.dispose();
		});
	}

	mainPrompt(): void {
		if (this.#running()) {
			this.#followUpsEnded = true;
			return;
		}
		this.#endThread();
		this.#hide();
	}

	dispose(): void {
		this.#abort?.abort();
		this.#endThread();
		this.#hide();
		this.#stopKeys();
		this.#stopComposerKeys();
	}

	#running(): SideQuestionTurn | undefined {
		const last = this.#turns.at(-1);
		return last?.status === "running" ? last : undefined;
	}

	cancel(): boolean {
		const running = this.#running();
		if (!this.#shown || !running) return false;
		running.status = "cancelled";
		this.#abort?.abort();
		this.#render();
		return true;
	}

	#endThread(): void {
		void this.#thread.dispose();
		this.#abort = undefined;
		this.#turns = [];
		this.#followUpsEnded = false;
		this.#toolsOpen = false;
		this.#folded = false;
		this.#copied = false;
		this.#fromAsk = false;
	}

	#handleInterrupt(data: string): { consume: boolean } | undefined {
		if (!this.#shown) return undefined;
		if ((this.#fromAsk || this.session.askFocus.peek()) && this.#running() && decodeInput(data, { kitty: terminalCapabilities().kittyKeyboard }).some(
			event => event.type === "key" && event.key.kind !== "release" && event.key.id === "ctrl+escape",
		) && this.cancel()) {
			return { consume: true };
		}
		if (!panelInterrupt(this.#ctx, this.#dialogOpen, data)) return undefined;
		if (!this.cancel()) this.#hide();
		return { consume: true };
	}

	#handleComposerKey(key: KeyEvent): boolean {
		if (!this.#shown || key.kind === "release" || this.#dialogOpen() || this.#ctx.ui.getEditorText().trim()) return false;
		return this.handleKey(key.id, false);
	}

	handleKey(id: KeyEvent["id"], askFocused: boolean): boolean {
		if (!this.#shown) return false;
		const keys = btwPanelKeys(askFocused);
		if (id === keys.read) return this.#runAction("btw-read");
		if (id === keys.fold) return this.#runAction(this.#folded ? "btw-expand" : "btw-fold");
		if (this.#folded) return false;
		if (id === keys.copy) return !this.#running() && this.#runAction("btw-copy");
		if (id !== keys.details || !this.#turns.some(hasTurnDetails)) return false;
		this.#toolsOpen = !this.#toolsOpen;
		this.#render();
		return true;
	}

	#runAction(action: BtwPanelAction): boolean {
		if (!this.#shown) return false;
		if (action === "btw-stop") return this.cancel();
		if (action === "btw-close") {
			if (!this.cancel()) this.#hide();
			return true;
		}
		if (action === "btw-read") return this.#openReader();
		if (action === "btw-copy") {
			const answer = latestAnswer(this.#turns);
			if (answer === undefined) return false;
			const turn = this.#turns.at(-1);
			void copyToClipboard(answer).then(() => {
				if (this.#shown && this.#turns.at(-1) === turn) {
					this.#copied = true;
					this.#render();
				}
			}, () => this.#ctx.ui.notify("Could not copy the side answer.", "warning"));
			return true;
		}
		this.#folded = action === "btw-fold";
		this.#render();
		return true;
	}

	#state(): BtwPanelState {
		return {
			turns: this.#turns,
			toolsOpen: this.#toolsOpen,
			folded: this.#folded,
			copied: this.#copied,
			fromAsk: this.#fromAsk,
			askFocused: this.session.askFocus() > 0,
			revision: this.#revision(),
		};
	}

	#openReader(): boolean {
		if (this.#turns.length === 0) return false;
		if (this.#closeReader) return true;
		const release = holdOverlay();
		const abort = new AbortController();
		this.#closeReader = () => abort.abort();
		void this.#ctx.ui.custom<void>(
			(ui, _theme, _keys, done) => btwReader(ui, () => this.#state(), action => this.#runAction(action), () => done()),
			{ overlay: true, signal: abort.signal },
		).catch(() => undefined).finally(() => {
			release();
			this.#closeReader = undefined;
		});
		return true;
	}

	#show(): void {
		if (this.#shown) {
			this.#render();
			return;
		}
		this.#shown = true;
		this.#ctx.ui.setWidget(
			WIDGET_KEY,
			ui => btwPanel(ui, () => this.#state(), action => this.#runAction(action)),
			{ placement: "aboveEditor" },
		);
	}

	#hide(): void {
		if (!this.#shown) return;
		this.#shown = false;
		this.#closeReader?.();
		this.#ctx.ui.setWidget(WIDGET_KEY, undefined);
	}

	#render(): void {
		this.#revision.set(untrack(this.#revision) + 1);
	}
}

export default function btw(pi: ExtensionAPI) {
	const dialogOpen = trackHostDialogs(pi);
	let manager: ExtensionContext["sessionManager"] | undefined;
	const track = (ctx: ExtensionContext) => {
		manager = ctx.sessionManager;
		sessionOf(manager).dialogOpen = dialogOpen;
	};
	const end = (_event: unknown, ctx: ExtensionContext) => {
		const key = manager ?? ctx.sessionManager;
		sessions.get(key)?.cycle?.dispose();
		sessions.delete(key);
		manager = undefined;
	};

	pi.on("session_start", (_event, ctx) => track(ctx));
	pi.on("input", (event, ctx) => {
		if (event.source !== "interactive" || ctx.mode !== "tui" || !ctx.hasUI) return undefined;
		const question = parseBtwQuestion(event.text);
		if (question === undefined || !sideQuestionsAvailable(ctx)) return undefined;
		forwardCoachInput(event, ctx);
		track(ctx);
		askBtw(ctx, question, undefined, event.images);
		return { handled: true };
	});
	pi.on("before_agent_start", (_event, ctx) => {
		sessions.get(ctx.sessionManager)?.cycle?.mainPrompt();
	});
	const reset = (event: unknown, ctx: ExtensionContext) => {
		end(event, ctx);
		track(ctx);
	};
	pi.on("session_switch", reset);
	pi.on("session_branch", reset);
	pi.on("session_tree", reset);
	pi.on("session_shutdown", end);
}
