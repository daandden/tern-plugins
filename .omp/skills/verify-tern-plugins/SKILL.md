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
- The login shell, fish. In it, `open` is `~/.local/bin/open`, a link to `bin/open` of the main checkout, not of the checkout under test.

## Helpers

`scripts/tern-verify` sits in the directory that this SKILL.md was read from. Set `V` to its absolute path once per shell:

```sh
V=<directory of this SKILL.md>/scripts/tern-verify
```

Every command takes the run dir first:

- `"$V" start "$RUN"` links the plugins, copies `~/.config/tern/settings.json` into the instance, opens the window and waits until it is ready.
- `"$V" doctor "$RUN"` is the read-only instance check.
- `"$V" ctl "$RUN" ARGS...` runs `tern ctl ARGS...` on the instance's control socket.
- `"$V" tern "$RUN" ARGS...` runs a `tern` CLI command against the instance, for example `"$V" tern "$RUN" ls`.
- `"$V" type "$RUN" 'LINE'` types LINE and Enter into the focused pane. LINE cannot hold a double quote.
- `"$V" shot "$RUN" NAME` writes `RUN/NAME.webp` (lossless) and `RUN/NAME.layout.json`.
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

If `start` stops with `no plugin sheets after 30 s`, read `RUN/window.log`, run `"$V" stop "$RUN"`, and report the failure.

If `start` stops with `RUN/data exists`, another run owns that dir. Do not run `stop` or any other command on it. Make a new `RUN` with `mktemp -d` and start again.

## Doctor

Run `"$V" doctor "$RUN"` first, and again whenever a result looks wrong. It changes nothing. It exits 1 when a check fails. It prints:

- The checkout and its commit, and the Tern version (`tern 0.7.2` when this skill was written).
- The window pid and the owner of `RUN/data/ctl.sock`. Both must be the same pid.
- The daemon pid, as the owner of `RUN/data/daemon.sock`.
- The sessions of the instance. A fresh instance has one session, `Default`, with one tab. Your own sessions must not show here.
- `tern plugin list` of the instance. Every plugin must say `ready`, and every link must point into the checkout.
- The plugin CSS sheets that the window loaded, named `plugin:local:<id>:<sheet>`.
- The account: `Signed in to Stencil as @<user>`, the name of the account button. `NOT SIGNED IN` means that the button is missing. Take a shot and look for the sign-in gate before you drive anything.

## Drive

Read `features/README.md`, then the feature file for the behavior under test. The stable handles are:

- Keys that the copied `settings.json` binds, one key per call: `"$V" ctl "$RUN" key f1` (goto), `key alt+n` (zellij-keys `new_pane`), `key escape`, `key enter`, `key down`, `key 'ctrl+;'`. A key press is the user path. `keybinds.html` in the checkout lists every bound key.
- Plugin commands by id: `"$V" ctl "$RUN" plugins run plugin.<plugin id>.<command id>`. It runs the action as a key does, but skips the key binding, so it does not prove a key. It prints `{"ok":true}` also for an id that does not exist, so prove each run by a change of state.
- The command palette: `"$V" ctl "$RUN" palette '"Break pane to new tab"'`, then `key enter`.
- The Files pane: `key ctrl+cmd+e` shows it. Focus a shell pane in the data dir first, because the tree follows the focused pane. Then `"$V" ctl "$RUN" files focus`, `"$V" ctl "$RUN" files cursor NAME` and `key enter` open the file.
- Typed text and command lines: `"$V" ctl "$RUN" type TEXT` and `"$V" type "$RUN" 'LINE'`.
- Buttons by accessible name: `"$V" ctl "$RUN" a11y | jq '.. | objects | select(.role=="Button") | .name'`.
- Elements by CSS selector: `"$V" ctl "$RUN" tree SELECTOR` (visible matches with text), `"$V" ctl "$RUN" dump SELECTOR` (rect, `visible`, font and color).
- Pane ids: `"$V" tern "$RUN" ls`, `"$V" tern "$RUN" focus ID`, `"$V" tern "$RUN" capture ID`.
- App state: `"$V" ctl "$RUN" state | jq .focused`.
- Browser panes: `"$V" ctl "$RUN" webcall '.tn-pane.on .kit-web-page' '{"op":"eval","function":"() => document.title"}'` and `"$V" ctl "$RUN" webreports '.tn-pane.on .kit-web-page'`. `.tn-pane.on` is the focused pane. A bare `.kit-web-page` matches the first page in the window, which is not always the focused one.

Do not use coordinates (`click X Y`, `pick X Y`). The window size and the user's fonts change them.

`tern ctl` joins its arguments with spaces and reads them again, with `"..."` as one argument. So an argument with spaces needs double quotes inside single quotes, as in the palette example. Write a JSON argument compact, with no space after its `:` and `,`, in single quotes, as in the webcall example.

## Evidence

Each run keeps its proof at the top level of `RUN` (`<Scratch dir>/verify/tern-plugins-<run-id>/`). Throwaway app data goes in `RUN/data`, which `stop` deletes. Never commit either.

- Capture the state before and after each action, not only the final screen. Save the command output with `| tee "$RUN/<feature>-<step>.json"` or `.txt`.
- A shot: `"$V" shot "$RUN" <feature>-<step>`. It renders the window at full resolution (2560 by 1600 for the default 1280 by 800 window) and converts the PNG to lossless WebP without a resize. Read the `.webp` path to look at it.
- Prove side effects as well: `RUN/data/config/settings.json`, `RUN/data/config/plugin-data/<id>/kv.json`, the files in `~/.cache/tern/open-owners`, the exit code and output of a typed command (`"$V" tern "$RUN" capture ID`).
- Write `RUN/notes.md`: the commit under test, each feature ID and entry point you drove, the evidence file of each, and each skipped entry point with the reason.

## Cleanup

Run `"$V" stop "$RUN"` after every run, also after a failed one. The one exception is a `start` that stopped with `RUN/data exists`: that dir belongs to another run. `stop`:

1. Closes the window with `ctl quit`, and sends SIGTERM to the window pid of this run if the window is still open after 2 s.
2. Sends SIGTERM to the daemon pid that owns `RUN/data/daemon.sock`. Its panes (shells, Neovim, omp) end with it.
3. Deletes `RUN/data` and the omp session dir of a pane that ran omp in `RUN/data` (`~/.omp/agent/sessions/-<path of RUN/data under home, with / as ->`).
4. Lists what stays in `RUN`: the proof, `notes.md`, `start.log` and `window.log`.

`stop` selects processes only by the pid files and sockets of this run. After `stop`, make sure that `ps -Ao pid,command | grep -F "$RUN/data"` shows only the grep itself.
