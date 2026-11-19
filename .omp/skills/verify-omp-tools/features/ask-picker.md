# Ask picker

When the agent calls `ask` with an HTML `<form>`, the plugin shows its own picker in the composer's place. Each named radio group, checkbox group, `<select>`, `<select multiple>`, text or number `<input>`, and `<textarea>` is a question tab; the form's context (headings, paragraphs, lists, `<pre>`, tables, `<img>`, inline `<svg>`) shows above the options. Each key has one meaning: j/k or arrows move, h/l, arrows, or Tab switch tabs, Space toggles the row (on a text field, opens its editor), Enter finishes the question, `n` edits the row's note, `Other` text, or text field, `x` clears it. Several questions, multi-select, or a text field get a Submit tab. The agent receives native form data JSON (a number input as a number), then labeled Notes, Other answers, the Submit note, and pasted images.

## Sub-features

- `ask-single` picks one radio option with Enter.
- `ask-multi` ticks several options with Space on a checkbox group.
- `ask-other` types an `Other (type your own)` answer.
- `ask-note` saves a per-option note with `n` and Enter; a note on an unpicked option is still sent.
- `ask-image` pastes an image into a note; it reaches the agent after its `[Image #N]` label.
- `ask-submit` reviews and sends several answers from the Submit tab, with an optional Submit note.
- `ask-required` refuses Submit while a field breaks native's rules (`required`, `min`/`max`, length, email, URL, `pattern`) and opens the first such field.
- `ask-context` shows the form's context blocks and pictures above the options.
- `ask-card` shows the answers in the transcript's `ask` card.
- `ask-pointer` picks a row by click (Space) and finishes by double-click (Enter) in the Tern view.
- `ask-timeout` submits the current answers of an idle picker when `ask.timeout` is set, marked as not the user's choice, and gives no answer when a field fails its checks, as native does.
- `ask-draft` keeps the answers through Esc and restores them on F5.
- `ask-text` answers text, number, and textarea fields beside choices in the same editor as notes; a password shows as bullets outside its editor.
- `ask-reanswer` answers a past `ask` again from `/tree`; on stock OMP it opens OMP's native form, not the Picker.
- `ask-hostdialog` shows a host `askDialog` caller (ratchet approvals) in the Picker and returns that caller's own result shape, Notes included.
- `ask-transport` hands the HTML form to OMP's native `ask` in RPC-UI, and returns `Native ask tool unavailable for delegation` in plain RPC and print, where no native `ask` exists.

## How to get to it (user POV)

- Ask the agent for something that makes it call `ask`, or tell it to call `ask` with a given form.
- Use the [local Picker session](#local-picker-session) for the fixed radio form. For a different form or tool call, use a local provider that sends those arguments. The fixed provider cannot generate them from a prompt.
- Keys in the picker; clicks on rows, tabs, and buttons in the Tern view (a click on an option is Space, a double-click is Enter).

## Driving it with tern ctl

Preconditions:

- Baseline from `README.md`.

- Single. Send `Call the ask tool please` and press Enter. Wait until `$C tree` contains `Ask aside`, then take `ask-open`. Press `j`, then Enter. Wait for the reply `blue`, then take `ask-single`. The card shows Blue checked, and the tool result has one answer with `"color": "blue"`.
- Note on an unpicked option. Run Single again, but before `$C key j` run `$C key n`, `$C type '"why not"'`, and `$C key Enter` on the `red` row. The note shows under `red` and stays after `$C key j`, and `$C key Enter` sends `blue`. The answer text holds `Option notes:` with `red` and `(not picked)` and `why not`, and the card shows `red (not picked): why not`.
- Image in a note. Start a native window with `--dir "$VERIFY_RUN_DIR/data/project"` and confirm `.focused.cwd` in `$C state`. Open the radio Picker as in Single. Press `n` on Red and confirm `Note for Red` in `$C tree`. Run the command below with the note editor focused. It generates a raster PNG, puts only image data on the general pasteboard, and sends Cmd+V to the owned window. It restores the clipboard as soon as the image chip appears. It keeps clipboard bytes in memory only and skips restoration if a later write changed the pasteboard. Require matching item counts, type lists, and item hashes before proceeding. Press Enter twice to save the note and submit. In the session's `ask` tool result, require `[Image #1]` followed by an image block with data. Require no image data in `details`.

  ```sh
  swift "$H/paste-picker-image.swift" "$V" "$VERIFY_RUN_DIR" >"$VERIFY_RUN_DIR/clipboard-proof.txt" 2>&1
  ```
- Several with multi-select, Other, and Submit note. Ask for a form with a radio group `color` (red, blue) and a checkbox group `extras` (tea, coffee). On the first tab, `$C key Enter` picks `red` and moves on. On the second, run `$C key Space`, `$C key j`, `$C key Space`, then `$C key j` to `Other (type your own)`, `$C key n`, `$C type '"water"'`, `$C key Enter`. Then `$C key Enter` opens the Submit tab, which shows `Submit note`. Run `$C key n`, `$C type '"all done"'`, `$C key Enter`, `$C shot ask-submit`, then `$C key Enter` to send. `$C key ctrl+o` shows the card: `red`, `tea, coffee, Other: water`, and `Note on all answers` with `all done`. The data is `{"color":"red","extras":["tea","coffee","water"]}`.
- Submit review with a long option Note. Use two radio groups with checked defaults. Give the first option a label longer than 200 characters, add a Note to it with `n`, save, and press Enter through both questions to Submit. Both answers, the Note, and the Submit note must be visible inside the Picker. Inspect `$C dump '.sf-kv-v'`: each value must have positive width and stay within the Picker's horizontal bounds. Repeat in a narrow pane. A long Note label must wrap instead of forcing the answer column offscreen.
- Required. Ask for a form with a `required` radio group and a second question. Press `h` to the Submit tab and Enter: the picker stays, opens the required question, and shows `Required`.
- Context. Ask for a form with a heading, a list, a `<pre>`, a `<table>`, and an `<img src>` of a small PNG in the repository. The picker shows them above the options; in the classic TUI a picture the scroll window cuts shows as one `▣ <alt>` line.
- Pointer (Tern view). Prompt for a two-option `ask` as in Single. Run `$C click '.sf-list-slot .sf-act:nth-child(3)'`. The second option is picked and the picker stays open. Run `$C dblclick '.sf-list-slot .sf-act:nth-child(3)'`. The picker closes and the form data holds the second option's value.
- Timeout. Add `ask.timeout: 30` through the [shared setup](../SKILL.md#set-up-disposable-omp). Use a provider that calls `ask` with a radio group `size` (`small`, and `large` checked by default). Press nothing for 45 seconds. The card shows `auto-selected after timeout — not a user choice`, the data is `{"size":"large"}`, and the answer text says the values were submitted automatically. With no option checked, the data omits `size`. With a `required` empty text field or `<input type="number" name="days" max="10" value="99">`, the result text is `The ask timed out before the user answered its required fields; no answer was given.` with no form data and `details.timedOut`, as native OMP 19 returns.
- Esc and F5. Pick an option and add a note, press Esc, then F5. The picker reopens with `Restored your answers`, the pick and the note, and sends nothing until Enter.
- Text fields (`ask-text`). Ask for a form with a radio group, `<input name="title">`, `<input type="number" name="days" min="1" max="90">`, `<textarea name="why">`, and `<input type="password" name="token">`. On the title row `$C key Enter` opens its editor; type, paste an image chip, `$C key Enter` saves. On days type `200`, save, go to the Submit tab, and `$C key Enter`: the picker opens Days with `Must be at most 90`. Fix it and submit. The data holds `days` as a number, the textarea's lines, and the token; the token row, the Submit tab, and the card show bullets. Esc before submitting and F5 restore the typed text.
- Second view. The main session JSONL's `toolResult` for `ask` holds the text the agent received: `User answers:` (or the timeout line) and the form data JSON, then `Option notes:`, `Other answers`, and `Note on all answers:` lines when present. `details.answers` holds one entry per question.
- Re-answer (`ask-reanswer`). On the installed OMP, answer an ask once, then `$C type '"/tree"'`, `$C key Enter`, `$C key Up` to the `[ask: …]` entry, and `$C key Enter`: OMP's native form opens (no `Ask aside` in `$C tree`), with no provider request. Answer it: the JSONL holds a new `ask` result with the same parent and call id as the old one, holding native form data and Notes on picked options only.
- Host dialog (`ask-hostdialog`). Make the provider answer `Call the ratchet approval please` with an `eval` call (`language: "js"`) running `await ratchet("demo").init({ cases: "cases", harness: "harness", change: "change" }); JSON.stringify(await ratchet("demo").approve("inputs", { question: "Approve the demo inputs?", preview: "cases/a.json holds one case" }))`, in a project that holds `cases/a.json`, an executable `harness/run.sh`, and `change/prompt.md`. The Picker opens with `Approve the demo inputs?`, the preview, and `Approve`, `Revise`, `Abort`, and `Other (type your own)`. Picking `Approve` makes the eval print `{"approved":true}`. A Note `not yet` on `Approve` while `Revise` is picked prints `{"approved":false,"aborted":false,"feedback":"Approve (not picked): not yet"}`.
- Transport (`ask-transport`, no screen). Start OMP with `--mode rpc-ui` and the provider: the `ask` call sends one `extension_ui_request` per field (`select` for a radio group, `input` for a text field), and the answers come back as the native form data (`User answers:` and the JSON). A cancelled `select` ends the call with `Ask tool was cancelled by the user`. With `--mode rpc` or `-p`, the same call returns `Native ask tool unavailable for delegation`, and no `select` or `input` request reaches the client.

### Local Picker session

The fixed provider opens `Pick a color` with Red and Blue for prompts that start with `Call the ask tool`. It echoes the submitted color. Its Side model streams fixed text for about 20 seconds without using tools or interpreting the question. Use it for Single, Image in a note, and Go to picker's Picker status, not for other forms or assertions about Side answer content.

For an omp-tools instance, follow the [shared setup and launch](../SKILL.md#launch) for the fixed Picker smoke. For Go to picker's Picker status, start the Tern plugin profile first and use the setup below with `VERIFY_RUN_DIR=$RUN`.

```sh
CHECKOUT=$(git rev-parse --show-toplevel)
H="$CHECKOUT/.omp/skills/verify-omp-tools/helpers"
OMP_BIN=${OMP_BIN:-$(command -v omp)}
OMP_BIN="$OMP_BIN" "$H/picker-omp" "$VERIFY_RUN_DIR" setup | tee "$VERIFY_RUN_DIR/candidate.txt"
```

Check the resolved `omp/` link and the four manifest entries. Start `bun "$H/picker-provider.ts" "$VERIFY_RUN_DIR"` as an owned process and wait for `ready:`. In the test pane, start:

```sh
"$V" type "$VERIFY_RUN_DIR" "OMP_BIN='$OMP_BIN' '$H/picker-omp' '$VERIFY_RUN_DIR' session"
```

Type `/skill:generate-image` without submitting. Capture the completion entry and clear the composer. `requests.jsonl` records the local requests.

## Gotchas

- With `ask.timeout` set, an idle picker submits; take shots before the countdown ends or press a key to restart it.
- In RPC-UI and ACP, `ask` goes to OMP's native tool, which asks one field at a time. Plain RPC and print have no native `ask` to hand it to. This picker is TUI only.
- Seed the disposable agent directory before launch. A Setup screen means the seed did not load.
- A long question first shows from its top; after PgUp/PgDn the first move only reveals the highlighted row.

