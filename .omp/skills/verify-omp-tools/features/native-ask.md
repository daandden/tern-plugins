# Ask card and native re-answer

omp-tools replaces the interactive `ask` card with a native-looking form that takes the composer. The form accepts multiline Notes and a General note. `/tree` still opens omp's native form.

## Sub-features

- `ask-registration`: the linked omp-tools plugin registers the Ask card.
- `ask-native`: compare the Ask card against the native form in both renderers.
- `ask-notes`: option Notes and the General note keep line breaks and pasted pictures.
- `ask-reanswer`: `/tree` opens omp's native form and saves a sibling result.

## How to get to it (user POV)

Send `Call the ask tool please` to the local fixture. Use Down to focus Blue, Enter to pick it, then Enter on Submit. After the model replies, open `/tree` and select the `[ask: …]` row.

## Driving it with tern ctl

### Local native ask session

The provider serves `vfix/main` and `vfix/side` on localhost. `Call the ask tool please` opens the one-question color form. `Call the ask tool for Side questions` also asks for a shape and a label, for [the `/btw` drive](side-question-btw.md#during-the-ask-card). Keep the provider running until the drive ends.

Use `CHECKOUT`, `H`, `V`, `OMP_BIN`, and the fresh `VERIFY_RUN_DIR` from [the parent skill](../SKILL.md). For a Tern plugin recipe using its own run directory, set `VERIFY_RUN_DIR=$RUN` and set the paths to the same checkout. Seed the disposable omp home and record the plugin link and manifest:

```sh
OMP_BIN="$OMP_BIN" "$H/native-ask-omp" "$VERIFY_RUN_DIR" setup >"$VERIFY_RUN_DIR/candidate.txt"
bun "$H/native-ask-provider.ts" "$VERIFY_RUN_DIR"
```

Start the provider as an owned process and wait for `ready:`. Start the isolated Tern instance if the caller has not already started it. To open the candidate session:

```sh
"$V" type "$VERIFY_RUN_DIR" "OMP_BIN='$OMP_BIN' '$H/native-ask-omp' '$VERIFY_RUN_DIR' session"
```

For the native baseline, use `native` in place of `session` in a fresh run. For classic, prefix the pane command with `PI_TUI_NATIVE=0`. Run [Doctor](../SKILL.md#doctor) on each run. Require a disposable `omp-tools` link into `CHECKOUT/omp`, no extension errors, and no omp Setup dialog.

### Answer and re-answer

1. Check the five extension paths in `candidate.txt`. In Tern, open `/extensions` and verify the paths loaded from the disposable link. Close the dashboard.
2. Send `Call the ask tool please`. Capture the card. In the native baseline the composer stays visible; the Ask card takes its place and adds **General note**. Compare Red, Blue, Other, and Submit in both renderers. Use `$C tree "[data-role='omp.ask.card']"` in Tern and `$C expect '"Pick a color"'` in classic.
3. In the Ask card, press Down and Space to pick Blue. Press `n`, paste two lines and an image path, and press Enter. Press Alt+U to open **General note**. For `ctl type`, send the literal bytes ESC and `u`, or click `button[title^="General note"]` in Tern. Paste two more lines and an image path, then press Enter to save and Enter to submit. Send literal `ESC[200~` and `ESC[201~` around pasted text. Check the session JSONL for `color: blue`, both multiline Notes, and two numbered image blocks. In a native Tern window with a synthetic clipboard image, try the clipboard image key and the app's own Paste action in separate Notes. Report any path the driver could not exercise.
4. Submit `/tree`, press Up from the model's reply to the `[ask: …]` row, and press Enter. If omp asks whether to summarize, choose **No summary**. Capture the same native form. Check that reopening the form sent no main-model request in `requests.jsonl`.
5. With Red focused, press Enter, then Enter on Submit. Check for a second `ask` result containing `"color": "red"`, with a new entry ID and the original parent and tool call IDs.
6. Exit omp to flush the transcript, then stop the owned Tern instance and the provider. Keep the screenshots, tree captures, requests, and transcript.

## Gotchas

- The fixture proves host behavior, not model quality. Every request goes to localhost.
- Inspect the classic form in the terminal grid, not through a native form selector.
- Submitting a re-answer can start another model request. Count `main` requests before selecting the tree entry and again before submitting Red.
