# Worktree exit

`extensions/own-worktree.ts` gives a worktree that omp did not create the exit handling of a `/wt` worktree. Tern's Ctrl+Shift+T (`worktree_agent_tab` in `tern/zellij-keys/window.luau`) makes the worktree before omp starts, then runs `omp --own-worktree <commit>` in it, where `<commit>` is the commit the press made the `wt/<time>` branch at.

## Why a flag

omp 19.1.1 applies `worktree.onExit` only to the worktrees in `InteractiveMode#ownedWorktrees`, which `/wt` and `worktree.onStart` fill in memory. No API adds a worktree to that list. `worktree.onStart` cannot replace the press: it branches from the HEAD of the folder omp starts in, and the press starts at the remote default branch while the main checkout stays on any branch.

The flag is not an environment variable, so a nested omp or a subagent process does not inherit it. `/restart` keeps it, because omp relaunches with the original argv. The commit in the flag keeps the branch's starting point across that restart, so a commit made before the restart still counts as new and its branch is kept. A later `omp --resume` has no flag and owns nothing, like a resumed `/wt` session.

## Flow

1. `session_start` (main agent, once): `git rev-parse` gives the worktree root, which must not be a main checkout. HEAD must be on a branch. The flag must name a commit. The first `worktree` of `git worktree list` is the source checkout. A failure shows a warning and owns nothing.
2. `session_before_shutdown`: omp emits it only for a close the user can cancel, such as `/exit`. If the session's cwd is still inside the worktree and `worktree.onExit` is not `keep`, the handler aborts the turn and calls omp's `planWorktreeExit` with `ctx.ui.confirm`. So the policy, the prompt text ("Remove worktree?" with the risk list), and the fingerprint match `/wt`. omp pauses the handler's 30 s budget while the dialog is open.
3. `input`: clears an approved plan. Input after the gate means another extension cancelled the close. A refused close emits no event, and its close signal stays live, so this handler cannot catch a refusal that no input follows.
4. `session_shutdown`: fires inside dispose and has a 2 s budget, which is too short for removal. The handler registers an `exitOnly` `postmortem` callback with a five-minute deadline. It calls omp's `removeExitWorktrees`, which keeps a worktree whose fingerprint changed since the answer, deletes the branch unless it moved, and changes the process cwd out of the worktree first. Messages go to stderr after the TUI stops.

The callback removes only in the cleanup pass of a quit, `postmortem.quit`, whose reason is `manual`. `/restart` runs a keep-alive `postmortem.cleanup()`, which skips `exitOnly` callbacks, then replaces the process. A signal pass (Tern's close button sends SIGHUP) or a crash pass has another reason, so the callback returns and the worktree stays. The tests cover both sequences after a refused close. A plan left by a refused close can still be used by a later quit that skips the gate, such as an extension's `ctx.shutdown()` or the quit after a failed `/restart` exec. The fingerprint check still keeps a worktree that changed after the answer.

A session that moved out of the worktree (`/wt`, `/move`) is not asked. With `/wt`, the worktree is the source of the new checkout, and omp never offers to remove a source checkout. A tab closed with Tern's close button ends omp with a signal. omp then skips `session_before_shutdown`, so the worktree stays, as a `/wt` worktree does.

## Imports

`session/session-worktree`, `task/settings`, and `config/settings` are package exports of `@oh-my-pi/pi-coding-agent`, which the compiled 19.1.1 registry serves (probed with `omp -e`). `worktree/backend` is type-only. `postmortem` and `pathIsWithin` come from `@oh-my-pi/pi-utils`.
