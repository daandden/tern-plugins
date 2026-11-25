import type { ImageContent } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { type KeyEvent, signal, untrack } from "@oh-my-pi/pi-tui";
import { btwPanel } from "./btw-panel";
import { forwardCoachInput } from "./english-coach-input";
import { panelInterrupt, trackHostDialogs } from "./panel-layout";
import { LazySideQuestionThread, sideQuestionsAvailable } from "./side-question";
import { answerInto, hasToolCalls, newTurn, type SideQuestionTurn } from "./side-question-view";

const WIDGET_KEY = "omp-tools.btw";
const BTW_COMMAND = /^\/btw(?:\s+([\s\S]*))?$/;

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
	readonly #revision = signal(0);
	#shown = false;
	readonly #dialogOpen: () => boolean;
	readonly #stopKeys: () => void;
	readonly #stopToolsKey: () => void;

	constructor(ctx: ExtensionContext, dialogOpen: () => boolean) {
		this.#ctx = ctx;
		this.#dialogOpen = dialogOpen;
		this.#thread = new LazySideQuestionThread(ctx);
		this.#stopKeys = ctx.ui.onTerminalInput(data => this.#handleInterrupt(data));
		this.#stopToolsKey = ctx.ui.composer?.addKeyHandler(key => this.#toggleTools(key)) ?? (() => {});
	}

	ask(question: string, images?: ImageContent[]): void {
		if (this.#running()) {
			this.#ctx.ui.notify("Wait for the side question's answer, or press Esc to cancel it.", "warning");
			return;
		}
		if (this.#followUpsEnded) this.#endThread();
		const turn = newTurn(question);
		this.#turns.push(turn);
		const abort = new AbortController();
		this.#abort = abort;
		this.#show();
		void answerInto(
			turn,
			async callbacks =>
				(await this.#thread.get(abort.signal)).ask(question, callbacks, abort.signal, images),
			() => this.#render(),
		).then(() => {
			if (this.#abort === abort) this.#abort = undefined;
			if (this.#followUpsEnded) this.#thread.dispose();
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
		this.#stopToolsKey();
	}

	#running(): SideQuestionTurn | undefined {
		const last = this.#turns.at(-1);
		return last?.status === "running" ? last : undefined;
	}

	#cancel(): void {
		const running = this.#running();
		if (running) running.status = "cancelled";
		this.#abort?.abort();
		this.#abort = undefined;
		this.#render();
	}

	#endThread(): void {
		this.#thread.dispose();
		this.#turns = [];
		this.#followUpsEnded = false;
		this.#toolsOpen = false;
	}

	#handleInterrupt(data: string): { consume: boolean } | undefined {
		if (!this.#shown || !panelInterrupt(this.#ctx, this.#dialogOpen, data)) return undefined;
		if (this.#running()) this.#cancel();
		else this.#hide();
		return { consume: true };
	}

	#toggleTools(key: KeyEvent): boolean {
		if (!this.#shown || key.id !== "t" || key.kind === "release" || this.#ctx.ui.getEditorText().trim()) return false;
		if (!this.#turns.some(hasToolCalls)) return false;
		this.#toolsOpen = !this.#toolsOpen;
		this.#render();
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
			ui =>
				btwPanel(ui, () => ({
					turns: this.#turns,
					toolsOpen: this.#toolsOpen,
					revision: this.#revision(),
				})),
			{ placement: "aboveEditor" },
		);
	}

	#hide(): void {
		if (!this.#shown) return;
		this.#shown = false;
		this.#ctx.ui.setWidget(WIDGET_KEY, undefined);
	}

	#render(): void {
		this.#revision.set(untrack(this.#revision) + 1);
	}
}

export default function btw(pi: ExtensionAPI) {
	let cycle: BtwCycle | undefined;
	const dialogOpen = trackHostDialogs(pi);
	const end = () => {
		cycle?.dispose();
		cycle = undefined;
	};

	pi.on("input", (event, ctx) => {
		if (event.source !== "interactive" || ctx.mode !== "tui" || !ctx.hasUI) return undefined;
		const question = parseBtwQuestion(event.text);
		if (question === undefined || !sideQuestionsAvailable(ctx)) return undefined;
		forwardCoachInput(event, ctx);
		cycle ??= new BtwCycle(ctx, dialogOpen);
		cycle.ask(question, event.images);
		return { handled: true };
	});
	pi.on("before_agent_start", () => {
		cycle?.mainPrompt();
	});
	pi.on("session_switch", end);
	pi.on("session_branch", end);
	pi.on("session_tree", end);
	pi.on("session_shutdown", end);
}
