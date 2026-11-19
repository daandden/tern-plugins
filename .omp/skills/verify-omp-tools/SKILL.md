---
name: verify-omp-tools
description: Verify omp-tools registration, the ask Picker, Picker btw, /btw Side questions, generate_image, or the English coach. Drive the Tern view, classic text TUI, or RPC in a fresh session that loads the checkout under test.
---

# Verify omp-tools

Read [the feature map](features/README.md), then the recipe for the surface you changed.

## Run entry

Use the Scratch dir from the run brief or resolve it with `skill://vstack-tmp`. Run these commands from the candidate checkout:

```sh
CHECKOUT=$(git rev-parse --show-toplevel)
V="$CHECKOUT/.omp/skills/verify-tern-plugins/scripts/tern-verify"
H="$CHECKOUT/.omp/skills/verify-omp-tools/helpers"
OMP_BIN=$(command -v omp)
mkdir -p "<Scratch dir>/verify"
VERIFY_RUN_DIR=$(mktemp -d "<Scratch dir>/verify/omp-tools-XXXXXX")
verify_ctl() {
	if [ "$1" = shot ]; then
		shift
		"$V" shot "$VERIFY_RUN_DIR" "$@"
	else
		"$V" ctl "$VERIFY_RUN_DIR" "$@"
	fi
}
C=verify_ctl
```

Put session dirs in `$VERIFY_RUN_DIR/data/`. Put notes and captures at the run's top level. Side question files (`SideQuestion-*.jsonl`) are transient. Look under the session's `TMPDIR` for `omp-side-question-*` while the thread is open.

## Doctor

1. Run `"$OMP_BIN" --version` and `(cd "$CHECKOUT/omp" && bun run check)`. After launch, `"$V" doctor "$VERIFY_RUN_DIR"` reports the Tern version and the control socket owner.
2. Use the [local Picker setup](features/ask-picker.md#local-picker-session) for the Picker smokes. For other providers, link `$CHECKOUT/omp` in a disposable OMP home. If a recipe loads entry points directly, require paths under `$CHECKOUT/omp/extensions/`. Never use the owner's omp-tools link. Seed the disposable agent config with `setupVersion: 3` and `advisor.enabled: false`.
3. Save `$C system`, `$C tree`, `$C css`, and `"$V" tern "$VERIFY_RUN_DIR" plugin list`. Require `dialogs: []`, no macOS permissions dialog in the tree, and no OMP Setup after the session starts. For a clean run, require no plugin sheets and `no plugins`. Inspect `instance/config/settings.json` for the zsh shell and no copied user settings.

For the launch guard, skip OMP setup and use the empty run dir. Start the native window, wait five seconds, and run step 3. Save the initial tab's `.focused.cwd` from `$C state`. After `stop`, confirm that both pids from `instance.pid` and `daemon.pid` exited.

## Launch

For headless Tern:

```sh
"$V" start "$VERIFY_RUN_DIR" --profile omp-tools --headless
$C size 1400 900
```

For native Tern, such as a clipboard check:

```sh
"$V" start "$VERIFY_RUN_DIR" --profile omp-tools --dir "$PROJECT"
```

The `omp-tools` profile seeds the alert and permissions state, uses zsh, and links no Tern plugins. It does not copy user Tern settings. Configure a plugin in the owned instance only if the recipe needs one.

Start OMP in the focused pane with `"$V" type "$VERIFY_RUN_DIR" "$LINE"`, where `LINE` is the shell command. Use the absolute OMP executable path. Set the working directory if the drive reads project files. Use a dedicated `--session-dir` under `data/`. For classic TUI drives, set `PI_TUI_NATIVE=0` in the session environment. After Escape in the classic TUI, pause for 0.5 seconds before sending the next key so it does not turn into an Alt chord.

## Drive

- Type text: `$C type '"<text>"'` (the inner double quotes keep spaces). Submit: `$C key Enter`.
- Keys: `$C key Escape`, `$C key t`, `$C key '?'`, `$C key Tab`, `$C key ctrl+o` (expands a folded tool card).
- Click: `$C click '<css selector>'` and `$C dblclick '<css selector>'`. The selector parser takes descendant and `:nth-child` selectors. It rejects `~` and `:has`. Examples: `.sf-section-head` for a collapsible section head, `.sf-list-slot .sf-act:nth-child(3)` for the second option row of the picker (child 1 is the question).
- Inspect: `$C tree` prints the visible element tree with text as JSON. Search it for visible strings instead of reading pixels.
- Wait by polling `$C tree` for the string that marks the state (for example `to cancel` while a Side answer runs), or with `sleep`. Model turns take 10 to 30 seconds with Haiku. A shot taken too early shows a running state, not a result.

For checks without a screen, run `omp --mode rpc --model <m>` with the recipe's isolated environment, config, and `--session-dir "$VERIFY_RUN_DIR/data/rpc"`. Send `{"id":"p1","type":"prompt","message":"..."}` on stdin. Wait for `prompt_result` with that id, then `agent_end` if a turn started.

## Helpers

- For `btw-tools`, `btw-usage`, and `btw-agent`, copy `helpers/side-question-probe.ts` to `$CHECKOUT/omp/extensions/verify-side-question-probe.ts` so it can import `@oh-my-pi/*`. Use the RPC drive with `--no-extensions -e` on that path, `VERIFY_PROBE=tools`, `usage`, or `agent`, and `VERIFY_PROBE_LOG=$VERIFY_RUN_DIR/<check>.json`. Delete the copy after the drive.

## Evidence

- Take a lossless WebP shot and capture layout with `$C shot <feature>-<step>`. Read the WebP.
- Pair each visible result with a second view of state: the session JSONL under `$VERIFY_RUN_DIR/data/<session dir>/` (read it with `jq`), files on disk, or `$C tree` text.
- Record the feature ID, renderer, command, outcome, evidence path, checkout SHA, and loaded extension paths in `$VERIFY_RUN_DIR/notes.md`.

## Cleanup

Run `"$V" stop "$VERIFY_RUN_DIR"` after each drive, including failed starts. If `start` says another instance owns the run dir, leave it alone.

`stop` removes launcher state and sockets. It keeps logs, PID records, shots, and OMP session transcripts in `data/`. Before hashing a finished transcript, exit OMP so it flushes its final session entries. Stop run-owned fixture providers separately.
