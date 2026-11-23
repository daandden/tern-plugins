import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { planWorktreeExit, removeExitWorktrees, type WorktreeExitPlan } from "@oh-my-pi/pi-coding-agent/session/session-worktree";
import { cfgWorktreeOnExit } from "@oh-my-pi/pi-coding-agent/task/settings";
import type { SessionWorktree } from "@oh-my-pi/pi-coding-agent/worktree/backend";
import { pathIsWithin, postmortem } from "@oh-my-pi/pi-utils";

const FLAG = "own-worktree";
/** How long exit waits for the removal of a worktree with many files, such as a cloned node_modules. */
const REMOVE_DEADLINE_MS = 5 * 60_000;

/** Runs git in `cwd` and returns its trimmed stdout; throws with git's first stderr line on failure. */
async function git(cwd: string, ...args: string[]): Promise<string> {
	const proc = Bun.spawn(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, status] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (status !== 0) {
		const why = stderr.split("\n").find(line => line.trim()) ?? `exit ${status}`;
		throw new Error(`git ${args[0]} failed in ${cwd}: ${why.trim()}`);
	}
	return stdout.trim();
}

/**
 * Describes the linked worktree that holds `cwd` as omp describes one `/wt` made: its branch was
 * made at `base` and the main checkout is its source. Throws when `cwd` is in a main checkout, HEAD
 * is detached, or `base` names no commit.
 */
async function startingWorktree(cwd: string, base: string): Promise<SessionWorktree> {
	const [checkout, gitDir, commonDir] = (
		await git(cwd, "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-dir", "--git-common-dir")
	).split("\n");
	if (!checkout || gitDir === commonDir) throw new Error(`${checkout ?? cwd} is a main checkout, not a worktree`);
	const branch = await git(cwd, "symbolic-ref", "--quiet", "--short", "HEAD").catch(() => {
		throw new Error(`HEAD of ${checkout} is not on a branch`);
	});
	const baseCommit = await git(cwd, "rev-parse", "--verify", "--quiet", `${base}^{commit}`).catch(() => {
		throw new Error(`${base} is not a commit in ${checkout}`);
	});
	const sourceCwd = /^worktree (.+)$/m.exec(await git(cwd, "worktree", "list", "--porcelain"))?.[1];
	if (!sourceCwd) throw new Error(`No main checkout for ${checkout}`);
	return { path: checkout, branch, sourceCwd, baseCommit, keptChanges: false };
}

/**
 * `--own-worktree <commit>` makes this launch own the worktree it starts in, as if `/wt` had made it
 * at `<commit>`, so `worktree.onExit` applies to it on close. Tern's Ctrl+Shift+T passes it.
 */
export default function ownWorktree(pi: ExtensionAPI) {
	pi.registerFlag(FLAG, {
		type: "string",
		description: "Apply worktree.onExit to the worktree omp starts in, made at this commit",
	});
	let started = false;
	let owned: SessionWorktree | undefined;
	let plan: WorktreeExitPlan[] = [];

	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		if (started || ctx.agent.kind !== "main") return;
		started = true;
		const base = pi.getFlag(FLAG);
		if (typeof base !== "string" || base === "") return;
		try {
			owned = await startingWorktree(ctx.cwd, base);
		} catch (error) {
			ctx.ui.notify(`--${FLAG} ignored: ${error instanceof Error ? error.message : String(error)}`, "warning");
		}
	});

	// Asks while the screen is still up, as omp does for `/wt` worktrees. A session that moved
	// out of the worktree (`/wt`, `/move`) left it as the source of its new checkout, which stays.
	pi.on("session_before_shutdown", async (event, ctx) => {
		plan = [];
		if (!owned || ctx.agent.kind !== "main" || !pathIsWithin(owned.path, ctx.sessionManager.getCwd())) return;
		const policy = cfgWorktreeOnExit.get(settings);
		if (policy === "keep") return;
		ctx.abort();
		plan = await planWorktreeExit(
			[owned],
			policy,
			(title, message) => ctx.ui.confirm(title, message, { signal: event.signal }),
			message => ctx.ui.notify(message, "warning"),
		);
	});

	// Input after the gate means another extension refused the close, so its answer no longer holds.
	pi.on("input", () => {
		plan = [];
	});

	// Removes after teardown, when nothing in the session still runs in the worktree. Only the
	// cleanup pass of a quit (reason manual) removes: `exitOnly` skips `/restart`'s keep-alive pass,
	// and a signal or crash pass after a refused close finds the plan and leaves the worktree.
	pi.on("session_shutdown", () => {
		const approved = plan;
		plan = [];
		if (approved.length === 0) return;
		postmortem.register(
			"omp-tools.own-worktree",
			async reason => {
				if (reason !== postmortem.Reason.MANUAL) return;
				for (const message of await removeExitWorktrees(approved)) process.stderr.write(`${message}\n`);
			},
			{
				exitOnly: true,
				deadlineMs: REMOVE_DEADLINE_MS,
				waitMessage: `Removing worktree ${approved[0]!.worktree.path}`,
			},
		);
	});
}
