import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import { Settings, type ExtensionAPI, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { cfgWorktreeOnExit } from "@oh-my-pi/pi-coding-agent/task/settings";
import { postmortem } from "@oh-my-pi/pi-utils";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import ownWorktree from "../extensions/own-worktree";

beforeAll(async () => {
	await Settings.init({ inMemory: true });
	cfgWorktreeOnExit.override(settings, "ask");
});
afterAll(() => cfgWorktreeOnExit.clearOverride(settings));

const roots: string[] = [];
/** Real postmortem registrations, so a keep-alive pass applies `exitOnly`; cancelled after each test. */
const register = spyOn(postmortem, "register");
afterEach(() => {
	for (const result of register.mock.results) if (result.type === "return") result.value();
	register.mockClear();
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

/** Runs the registered callbacks as a real exit's cleanup pass with `reason` does. */
async function exitPass(reason: postmortem.Reason) {
	for (const [, callback] of register.mock.calls) await callback(reason);
}

function git(cwd: string, ...args: string[]): string {
	const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
	return result.stdout.toString().trim();
}

/** A repo with one commit and a linked worktree on `wt/test`, made at that commit as Ctrl+Shift+T does. */
function repoWithWorktree() {
	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "own-worktree-")));
	roots.push(root);
	const main = path.join(root, "main");
	const worktree = path.join(root, "wt");
	fs.mkdirSync(main);
	git(main, "init", "--quiet", "--initial-branch=main");
	git(main, "config", "user.email", "test@example.com");
	git(main, "config", "user.name", "Test");
	fs.writeFileSync(path.join(main, "file.txt"), "one\n");
	git(main, "add", ".");
	git(main, "commit", "--quiet", "-m", "one");
	const base = git(main, "rev-parse", "HEAD");
	git(main, "worktree", "add", "--quiet", "-b", "wt/test", worktree, base);
	return { main, worktree, base };
}

/** Starts the extension as omp does with `--own-worktree <flag>` in `cwd`. */
async function launch(cwd: string, flag: string | undefined) {
	const handlers = new Map<string, ((event: unknown, ctx: ExtensionContext) => unknown)[]>();
	const pi = {
		registerFlag() {},
		getFlag: () => flag,
		on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		},
	} as unknown as ExtensionAPI;
	ownWorktree(pi);
	const prompts: string[] = [];
	const warnings: string[] = [];
	let answer = true;
	let sessionCwd = cwd;
	const ctx = {
		cwd,
		agent: { kind: "main", id: "own-worktree-test" },
		sessionManager: { getCwd: () => sessionCwd },
		abort() {},
		ui: {
			confirm: async (title: string, message: string) => {
				prompts.push(`${title} ${message}`);
				return answer;
			},
			notify: (message: string) => warnings.push(message),
		},
	} as unknown as ExtensionContext;
	const emit = async (type: string, event: object = {}) => {
		for (const handler of handlers.get(type) ?? []) await handler({ type, ...event }, ctx);
	};
	await emit("session_start");
	return {
		prompts,
		warnings,
		answer: (value: boolean) => {
			answer = value;
		},
		moveSession: (to: string) => {
			sessionCwd = to;
		},
		/** The cancellable close gate of `/exit`, where omp asks. */
		gate: () => emit("session_before_shutdown", { signal: new AbortController().signal }),
		/** Teardown, from a quit or a signal. */
		teardown: () => emit("session_shutdown"),
		/** Closes as `/exit` does: the gate, teardown, then the quit's cleanup pass. */
		close: async () => {
			await emit("session_before_shutdown", { signal: new AbortController().signal });
			await emit("session_shutdown");
			await exitPass(postmortem.Reason.MANUAL);
		},
	};
}

test("an approved close removes the worktree and deletes its unmoved branch", async () => {
	const { main, worktree, base } = repoWithWorktree();
	const session = await launch(worktree, base);
	await session.close();
	expect(session.prompts).toEqual([expect.stringContaining("Remove worktree?")]);
	expect(fs.existsSync(worktree)).toBe(false);
	expect(git(main, "branch", "--list", "wt/test")).toBe("");
});

test("a branch with commits after the flag's commit is kept when its worktree goes", async () => {
	const { main, worktree, base } = repoWithWorktree();
	fs.writeFileSync(path.join(worktree, "file.txt"), "two\n");
	git(worktree, "commit", "--quiet", "-am", "two");
	const tip = git(worktree, "rev-parse", "HEAD");
	// A relaunch (omp's /restart) passes the same flag after the agent committed.
	const session = await launch(worktree, base);
	await session.close();
	expect(session.prompts).toEqual([expect.stringContaining("has new commits")]);
	expect(fs.existsSync(worktree)).toBe(false);
	expect(git(main, "rev-parse", "wt/test")).toBe(tip);
});

test("a declined close keeps the worktree", async () => {
	const { worktree, base } = repoWithWorktree();
	const session = await launch(worktree, base);
	session.answer(false);
	await session.close();
	expect(session.prompts).toHaveLength(1);
	expect(fs.existsSync(worktree)).toBe(true);
});

test("a quit another extension refused, then a tab closed with a signal, keeps the worktree", async () => {
	const { worktree, base } = repoWithWorktree();
	const session = await launch(worktree, base);
	await session.gate();
	// The refusal leaves the session open; closing the Tern tab later sends SIGHUP.
	await session.teardown();
	await exitPass(postmortem.Reason.SIGHUP);
	expect(session.prompts).toHaveLength(1);
	expect(fs.existsSync(worktree)).toBe(true);
});

test("a /restart after a refused quit keeps the worktree", async () => {
	const { worktree, base } = repoWithWorktree();
	const session = await launch(worktree, base);
	await session.gate();
	await session.teardown();
	// /restart runs a keep-alive cleanup pass, then replaces the process.
	await postmortem.cleanup();
	expect(fs.existsSync(worktree)).toBe(true);
});

test("a session that moved out of the worktree keeps it without asking", async () => {
	const { main, worktree, base } = repoWithWorktree();
	const session = await launch(worktree, base);
	session.moveSession(main);
	await session.close();
	expect(session.prompts).toEqual([]);
	expect(fs.existsSync(worktree)).toBe(true);
});

test("a launch without the flag, or in the main checkout, owns nothing", async () => {
	const { main, worktree, base } = repoWithWorktree();
	const plain = await launch(worktree, undefined);
	await plain.close();
	const inMain = await launch(main, base);
	await inMain.close();
	expect([plain.prompts, inMain.prompts]).toEqual([[], []]);
	expect(inMain.warnings).toEqual([expect.stringContaining("is a main checkout")]);
	expect(fs.existsSync(worktree)).toBe(true);
	expect(git(main, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
});
