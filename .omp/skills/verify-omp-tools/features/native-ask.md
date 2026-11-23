# Native ask

omp supplies `ask` and its own host dialogs. In Tern, a waiting HTML form appears at the end of the transcript, above the composer. In the classic TUI, it appears as a text form. Selecting an `ask` result in `/tree` reopens the same form.

## Sub-features

- `ask-registration`: omp-tools loads `generate-image.ts`, `english-coach.ts`, and `btw.ts` in a fresh omp session.
- `ask-native`: the native form returns the selected value, and the local model echoes it.
- `ask-reanswer`: `/tree` opens the same native form and saves a new sibling result for the original call.

## How to get to it (user POV)

Send `Call the ask tool please` to the local fixture. Use Down to focus Blue, Enter to pick it, then Enter on Submit. After the model replies, open `/tree` and select the `[ask: …]` row.

## Driving it with tern ctl

### Local native ask session

The provider serves `vfix/main` and `vfix/side` on localhost. `Call the ask tool please` opens the one-question color form. `Call the ask tool for Side questions` also asks for a shape and a label. The latter form is for [the `/btw` drive](side-question-btw.md#during-a-native-ask). Keep the provider running until the drive ends.

Use `CHECKOUT`, `H`, `V`, `OMP_BIN`, and the fresh `VERIFY_RUN_DIR` from [the parent skill](../SKILL.md). For a Tern plugin recipe using its own run directory, set `VERIFY_RUN_DIR=$RUN` and set the paths to the same checkout. Seed the disposable omp home and record the plugin link and manifest:

```sh
OMP_BIN="$OMP_BIN" "$H/native-ask-omp" "$VERIFY_RUN_DIR" setup >"$VERIFY_RUN_DIR/candidate.txt"
bun "$H/native-ask-provider.ts" "$VERIFY_RUN_DIR"
```

Start the provider as an owned process and wait for `ready:`. Start the isolated Tern instance if the caller has not already started it. For the native view in the test pane:

```sh
"$V" type "$VERIFY_RUN_DIR" "OMP_BIN='$OMP_BIN' '$H/native-ask-omp' '$VERIFY_RUN_DIR' session"
```

For classic, use a separate run and prefix the pane command with `PI_TUI_NATIVE=0`. Run [Doctor](../SKILL.md#doctor) on each run. Require a disposable `omp-tools` link into `CHECKOUT/omp`, no extension errors, and no omp Setup dialog.

### Answer and re-answer

1. Check the four extension paths in `candidate.txt`. In Tern, open `/extensions` and capture the `generate-image`, `english-coach`, `btw`, and `own-worktree` entries. Close the dashboard. Type `/skill:generate-image` without submitting to check the autocomplete entry, then clear the composer.
2. Send `Call the ask tool please`. Capture the open form and its Red, Blue, Other, and Submit controls. In Tern, use `$C tree ".sf-main [data-role='omp.ask.card']"` to locate the form in the transcript. Capture the composer below it. Use `$C expect '"Pick a color"'` to check grid text in classic.
3. Press Down, Enter, then Enter. Save the answer card and wait for the model to reply `blue`. Check the transcript under `data/sessions` for an `ask` tool result containing `"color": "blue"`.
4. Submit `/tree`, press Up from the model's reply to the `[ask: …]` row, and press Enter. If omp asks whether to summarize, choose **No summary**. Capture the same native form. Check that reopening the form sent no main-model request in `requests.jsonl`.
5. With Red focused, press Enter, then Enter on Submit. Check for a second `ask` result containing `"color": "red"`, with a new entry ID and the original parent and tool call IDs.
6. Exit omp to flush the transcript, then stop the owned Tern instance and the provider. Keep the screenshots, tree captures, requests, and transcript.

## Gotchas

- The fixture proves host behavior, not model quality. Every request goes to localhost.
- Inspect the classic form in the terminal grid, not through a native form selector.
- Submitting a re-answer can start another model request. Count `main` requests before selecting the tree entry and again before submitting Red.
