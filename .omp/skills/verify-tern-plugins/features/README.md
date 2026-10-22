# tern-plugins verification map

This directory is the source for verifying what the plugins of this repo do for a Tern user. Read this index before you drive the window, then use the matching feature file as the recipe. `V` and `RUN` are the helper path and the run dir from `../SKILL.md`.

## Baseline preconditions

- `RUN` is a new dir `<Scratch dir>/verify/tern-plugins-<run-id>`. Proof and `notes.md` go at its top level, app data in `RUN/data`.
- `"$V" start "$RUN"` printed `ready`, and `"$V" doctor "$RUN"` exits 0.
- The instance has one session, `Default`, with one tab and one fish pane in `RUN/data`. Its `settings.json` is a copy of `~/.config/tern/settings.json` with `shell` set to fish, so the keys of `keybinds.html` work, `$status` works in typed lines, and `reduce_motion` starts as `off`. If `"$V" ctl "$RUN" state | jq .focused.label` does not end in `- fish`, the run is not at the baseline: stop it and report the shell.
- Test files go in `RUN/data`. Make them before the step that opens them, and always write them by absolute path, for example `printf '<!doctype html><title>Verify page</title><h1>First</h1>\n' >"$RUN/data/page.html"`. Do not `cd` there first: when the `cd` fails, the files go into the checkout and can overwrite a tracked file (on macOS, `readme.md` is `README.md`).
- Drive only the instance of this run.

## Driving conventions

- Start each recipe from the baseline. When a recipe needs a fresh layout, run `"$V" stop "$RUN"` and start a new run.
- Prefer a key press from `keybinds.html` or the command palette. They are the user paths. `plugins run` skips the key binding and proves only the command.
- Get pane ids from `"$V" tern "$RUN" ls`. A pane id is stable for the life of the pane. A pane number in the goto picker or a position in the window is not.
- Wait for a result by polling a handle (`tree`, `dump`, `tern ls`) in a loop with a limit, not by one fixed sleep. Each step below names the handle.
- After a mutation, read the stored result a second way: `settings.json` or `kv.json` under `RUN/data/config`, the panes in `"$V" tern "$RUN" ls`, or the pane output through `"$V" tern "$RUN" capture ID`.

## Proof and skip reporting

- Capture the state before and after each action: the `tern ls` listing, the `tree` or `dump` output, and a shot with `"$V" shot "$RUN" <feature>-<step>`. Read the `.webp` that it writes.
- For a typed command, keep the command, its output and its exit code from `capture`.
- In `RUN/notes.md`, write the commit under test, then for each check the feature ID, the entry point, the evidence files and the result.
- If an entry point cannot run, write the command you tried and the precondition that failed. Do not report it as verified through another entry point.
- If a step fails, run `"$V" doctor "$RUN"` and read the header comment of the plugin's `window.luau` (and `goto/host.luau`) before you report a bug. The plugins change often, and the comment states the intended behavior.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph about the behavior that the user sees. It then has four H2 sections in this order:

1. `Sub-features` lists short IDs, one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with tern-verify` starts with `Preconditions:` and pairs each user action with an exact command and the result to observe.
4. `Gotchas` lists traps that waste or invalidate a run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands and proof.

## Features

- [Go to picker](./goto.md) covers opening the picker, the agents-only and all-panes views, the jump number that a session shares with its only tab, search, one- and two-digit jump numbers, Enter, Esc, the Waiting on you rows with the done and error rows of finished turns, the tab order by tab status, the idle choice, the box at the palette's place at each interface size, and the timing of the status marks.
- [Zellij floats and panes](./zellij-keys.md) covers floating shells, the cascade of shown floats, the four corner stacks, float moves and resizes, the F2/F3/F4 tool floats at 80% of the tab, hiding floats on Alt+F and on a focus change (also in a new tab and with floats both shown and hidden), a float close, the Go to picker over floats, floating and docking a pane, breaking a pane to a tab, the focus keys, the agent tab through Tern's New agent block, the scroll and find keys of Ctrl+G S, and the `reduce_motion` restore.
- [HTML pages](./html-links.md) covers HTML files that open as rendered pages beside their opener, from `tern open`, `bin/open` and the Files pane, clicked `file://` links that Tern renders itself, web links that go to Microsoft Edge, and the Cmd+R and palette reload.
- [Neovim files](./nvim-files.md) covers text files that open in a Neovim pane, the reuse of that pane, `FILE:LINE:COL`, `--tab`, a float opener, symlinks that open their target, and the files that stay in Tern.
- [Reader terminal text](./reader-terminal-text.md) covers the terminal font size, row height and UI font of omp's composer in the Reader chat style, and the hidden placeholder.
