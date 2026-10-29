---
name: verify-tern-plugins
description: Drives the Tern plugins of this repo (goto, html-links, nvim-files, reader-terminal-text, zellij-keys) and bin/open in an isolated Tern window, and captures proof. Use to verify a plugin change through the Tern desktop window (keys, commands, file opens, CSS), the bin/open command, or the tern CLI.
---

# Verify tern-plugins

The app is a set of Tern plugins. Tern loads each plugin folder of a checkout and runs it in its desktop window. The surfaces are:

- The Tern desktop window (primary): plugin commands on keys and in the palette, file open routes, link routes, the goto picker block, and CSS sheets.
- The `bin/open` command, run in a Tern pane.
- The `tern` CLI that a user runs in a pane: `tern open`, `tern plugin reload`, `tern plugin list`.

The harness is Tern's own developer tooling (`tern help dev`). A window started with `--control` takes commands from `tern ctl`: keys, typed text, typed command lines, element trees with computed styles, web calls into browser panes, and shots. The helper `scripts/tern-verify` wraps it.

## Isolation

Each run gets its own Tern instance: its own configuration directory (`TERN_CONFIG_DIR`), daemon socket (`TERN_DAEMON_SOCKET`) and control socket, all under `RUN/data`. The daemon of that instance loads the plugins of the checkout under test, through `<id>.path` links in its own plugins directory. Your own Tern window, its daemon, its sessions and `~/.config/tern` stay untouched. Runs can go side by side, one run dir each.

Drive only the instance that your run started. Every `tern` command goes through the helper, because a bare `tern ls` or `tern plugin reload` in an agent pane acts on the Tern window of that pane.

These stay shared with your own Tern:

- `~/.cache/tern/open-owners`, the handoff dir of `bin/open`.
- The Neovim and omp configurations in your home directory.
- The Stencil account of this Mac. There is no separate sign-in.
- The login shell, fish. `start` sets `shell` to `/opt/homebrew/bin/fish` in the copied `settings.json`, because Tern otherwise starts the `$SHELL` of the process that ran `start`, and an agent's bash has no Homebrew or omp in its `PATH`. So the recipes use fish syntax (`$status`, `function`). In fish, `open` is `~/.local/bin/open`, a link to `bin/open` of the main checkout, not of the checkout under test.

Tern reloads linked plugins when a file of the loaded checkout changes, also under `.omp/`. A full reload resets their Lua state and closes the Go to picker. `tern plugin reload <id>` reloads only that plugin; reloading another plugin leaves goto's picker open. Save no file in the loaded checkout while a drive step runs. For concurrent work, use a private runtime copy and set `TERN_PLUGINS_REPO` to it.

## Helpers

`scripts/tern-verify` sits in the directory that this SKILL.md was read from. Set `V` to its absolute path once per shell:

```sh
V=<directory of this SKILL.md>/scripts/tern-verify
```

Every command takes the run dir first:

- `"$V" start "$RUN"` links the plugins, copies `~/.config/tern/settings.json` with fish as the shell, clears inherited pane variables, marks the omp offer answered, wakes the display, opens the window and waits for a shell prompt. It keeps the display awake until the window closes. With the display off, a new window can stop before it attaches to its daemon. Without the seeded omp state, Tern can show "Tern is better with omp. Install it?" or "Let Tern keep omp up to date?".
- `"$V" doctor "$RUN"` is the read-only instance check.
- `"$V" ctl "$RUN" ARGS...` runs `tern ctl ARGS...` on the instance's control socket.
- `"$V" tern "$RUN" ARGS...` runs a `tern` CLI command against the instance, for example `"$V" tern "$RUN" ls`.
- `"$V" type "$RUN" 'LINE'` types LINE and Enter into the focused pane. LINE cannot hold a double quote.
- `"$V" shot "$RUN" NAME` writes `RUN/NAME.webp` (lossless) and `RUN/NAME.layout.json`.
- `"$V" lens "$RUN"` writes a command lens to `RUN/link-lens` and links it into this instance only. The output block of `echo PROBE_LINK URL` then shows URL as a Tern link that a Cmd-click opens (see Drive). Doctor lists it as `run lens:`.
- `"$V" stop "$RUN"` is the cleanup.

`TERN_PLUGINS_REPO=<checkout>` makes `start` load the plugins of another checkout. By default it loads the checkout that holds the helper.

## Launch

1. Get the Scratch dir with `bun "$(realpath skill://vstack-tmp/scripts/path.ts)"` from inside the repo.
2. Make the run dir. `mktemp -d` creates a new dir with a random name in one step, so two runs never get the same dir, also when they start in the same second or from two worktrees:

   ```sh
   mkdir -p "<Scratch dir>verify"
   RUN=$(mktemp -d "<Scratch dir>verify/tern-plugins-XXXXXX")
   ```

3. Run `"$V" start "$RUN"`. It is ready when it prints `ready: window pid N, daemon pid M, repo <checkout>`. The window opens on screen and can take the keyboard focus from you. `ctl` sends input to it either way.

If `start` stops with `no plugin sheets after 30 s`, `no shell prompt` or `no session daemon`, read `RUN/window.log`, run `"$V" stop "$RUN"`, and start a new run. Report the failure if it repeats.

If `start` stops with `RUN/data exists`, another run owns that dir. Do not run `stop` or any other command on it. Make a new `RUN` with `mktemp -d` and start again.

## Doctor

Run `"$V" doctor "$RUN"` first, and again whenever a result looks wrong. It changes nothing. It exits 1 when a check fails. It prints:

- The checkout and its commit, and the Tern version (`tern 0.9.7` at the last check, with omp 18.13.3).
- The window pid and the owner of `RUN/data/ctl.sock`. Both must be the same pid.
- The daemon pid, as the owner of `RUN/data/daemon.sock`. `daemon: NOT RUNNING` fails the check: the daemon of the run ended, so panes and `tern` CLI commands do not work, and the window shows a pane named `data` with no shell. Stop the run and start a new one.
- The sessions of the instance. A fresh instance has one session, `Default`, with one tab. Your own sessions must not show here. `daemon sessions: NONE` fails Doctor even when the window's local state lists a session: the window did not attach to the daemon.
- `tern plugin list` of the instance. Every plugin must say `ready`, and every link must point into the checkout, or be the `run lens:` of this run.
- The plugin CSS sheets that the window loaded, named `plugin:local:<id>:<sheet>`.
- The account: `Signed in to Stencil as @<user>`, the name of the account button. `NOT SIGNED IN` means that the button is missing. Take a shot and look for the sign-in gate before you drive anything.
- Open native alerts of the window, from `"$V" ctl "$RUN" system`. A shot does not show a native alert. `NATIVE ALERT OPEN` means that the window waits for an answer: name it in `notes.md`, and close it with `"$V" ctl "$RUN" dialog button N`, where N counts the buttons from 0.

## Drive

Read `features/README.md`, then the feature file for the behavior under test. The stable handles are:

- Keys that the copied `settings.json` binds, one key per call: `"$V" ctl "$RUN" key f1` (goto), `key alt+n` (zellij-keys `new_pane`), `key escape`, `key enter`, `key down`, `key 'ctrl+;'`, `key pageup`. A key press is the user path. `keybinds.html` in the checkout lists every bound key.
- Chords: a chord such as Ctrl+G M L is one `key` call per key: `key ctrl+g`, `key m`, `key l`. Tern leaves the Ctrl+G mode after the last key, so a second step needs the whole chord again. A bare `l` after it goes to the pane as text.
- Plugin commands by id: `"$V" ctl "$RUN" plugins run plugin.<plugin id>.<command id>`. It runs the action as a key does, but skips the key binding, so it does not prove a key. It prints `{"ok":true}` also for an id that does not exist, so prove each run by a change of state.
- The command palette: `"$V" ctl "$RUN" palette '"Break pane to new tab"'`, then `key enter`.
- The Files pane: `key ctrl+cmd+e` shows it. Focus a shell pane in the data dir first, because the tree follows the focused pane. Then `"$V" ctl "$RUN" files focus`, `"$V" ctl "$RUN" files cursor NAME` and `key enter` open the file.
- Typed text and command lines: `"$V" ctl "$RUN" type TEXT` and `"$V" type "$RUN" 'LINE'`.
- Buttons by accessible name: `"$V" ctl "$RUN" a11y | jq '.. | objects | select(.role=="Button") | .name'`.
- Elements by CSS selector: `"$V" ctl "$RUN" tree SELECTOR` (visible matches with text), `"$V" ctl "$RUN" dump SELECTOR` (rect, `visible`, font and color).
- Clicks by CSS selector: `"$V" ctl "$RUN" click SELECTOR [MODS]`. A selector with spaces needs double quotes inside the argument, and its strings single quotes: `"$V" ctl "$RUN" click "\".tn-pane.on .sf-link[title^='$URL']\"" cmd` is a Cmd-click on a link. `#` starts a comment in a `ctl` line, so write an id as `[id=dt-el-cur]`, not `#dt-el-cur`.
- Computed styles that `dump` does not give (animation, custom properties): run `"$V" ctl "$RUN" devtools open` and `"$V" ctl "$RUN" target devtools`. Then `click '.dt-tab:nth-child(2)'` (Console), `click .dc-input` (a click on the tab of an open Console focuses the tab, not the input), `type "\"\$('.goto-box .sf-t-num'):style('animation')\""` and `key enter`. The result is the first `.dc-row` after the last row with class `dc-in` in `tree .dc-row`; its text starts with the time. `$$(SEL)` gives all matches as a table. When done, run `"$V" ctl "$RUN" target main` and `devtools close`: every `ctl` command goes to the target that you chose last.
- Pane ids: `"$V" tern "$RUN" ls`, `"$V" tern "$RUN" focus ID`, `"$V" tern "$RUN" capture ID`.
- App state: `"$V" ctl "$RUN" state | jq .focused`.
- Browser panes: `"$V" ctl "$RUN" webcall '.tn-pane.on:not(.off) .kit-web-page' '{"op":"eval","function":"() => document.title"}'` and `"$V" ctl "$RUN" webreports '.tn-pane.on:not(.off) .kit-web-page'`. `.tn-pane.on:not(.off)` is the focused pane of the visible tab. `.on` also matches a focused pane of another tab, with `off`; a dump lists it with an empty rect. A bare `.kit-web-page` matches the first page in the window.

Do not use coordinates (`click X Y`, `pick X Y`). The window size and the user's fonts change them.

`tern ctl` joins its arguments with spaces and reads them again, with `"..."` as one argument. So an argument with spaces needs double quotes inside single quotes, as in the palette and click examples. `tree` and `dump` take the rest of the line as one selector, so give their selector no inner quotes: `dump '.tn-pane.on .tv-thumb'`. Write a JSON argument compact, with no space after its `:` and `,`, in single quotes, as in the webcall example.

## Evidence

Each run keeps its proof at the top level of `RUN` (`<Scratch dir>/verify/tern-plugins-<run-id>/`). Throwaway app data goes in `RUN/data`, which `stop` deletes. Never commit either.

- Capture the state before and after each action, not only the final screen. Save the command output with `| tee "$RUN/<feature>-<step>.json"` or `.txt`.
- A shot: `"$V" shot "$RUN" <feature>-<step>`. It captures the full window at its actual display scale and converts the PNG to lossless WebP without resizing. A 1280 by 800 window is 2560 by 1600 on a 2x display, or 1280 by 800 on a 1x display. Read the `.webp` path.
- Prove side effects as well: `RUN/data/config/settings.json`, `RUN/data/config/plugin-data/<id>/kv.json`, the panes in `"$V" tern "$RUN" ls`, and the exit code and output of a typed command (`"$V" tern "$RUN" capture ID`).
- Write `RUN/notes.md`: the commit under test, each feature ID and entry point you drove, the evidence file of each, and each skipped entry point with the reason.

## Cleanup

Run `"$V" stop "$RUN"` after every run, also after a failed one. The one exception is a `start` that stopped with `RUN/data exists`: that dir belongs to another run. `stop`:

1. Closes the window with `ctl quit`, and sends SIGTERM to the window pid of this run if the window is still open after 2 s.
2. Sends SIGTERM to the daemon pid that owns `RUN/data/daemon.sock`. Its panes (shells, Neovim, omp) end with it.
3. Ends each process left with `RUN/data/` in its command line, such as an orphaned `nvim --embed` that ignores SIGTERM: SIGTERM, then SIGKILL after 1 s.
4. Deletes `RUN/data` and the omp session dir of a pane that ran omp in `RUN/data` (`~/.omp/agent/sessions/-<path of RUN/data under home, with / as ->`).
5. Lists what stays in `RUN`: the proof, `notes.md`, `start.log` and `window.log`.

`stop` selects processes only by the pid files and sockets of this run and by the path of `RUN/data`, which no other run has. After `stop`, make sure that `ps -Ao pid,command | grep -F "$RUN/data"` shows only the grep itself.
