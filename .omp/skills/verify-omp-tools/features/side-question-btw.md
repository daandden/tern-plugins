# Side question with /btw

`/btw <question>` in the main editor asks a Side question. It has the enabled file tools plus Keenable search and fetch when both are connected at thread start. The answer shows in a panel above the editor, and the editor keeps focus. The answer's text and its tool calls show in the order they happened. Each group of calls folds into one "N tool calls" line. A later `/btw` follows up in the same thread. The next main prompt ends the thread and clears the panel. The main agent never sees a Side question. A thread starts from the saved transcript on the branch selected in `/tree`. It includes saved eval state and knows which main calls are still open. Bare `/btw` still opens omp's own BTW history.

## Sub-features

- `btw-answer` answers using a read-only tool and shows the panel.
- `btw-fold` folds each group of tool calls; `t` (or a click on a line in Tern) opens and folds them.
- `btw-order` shows text written before a tool call above its "N tool calls" line, and the answer after it.
- `btw-follow` keeps a later `/btw` in the same thread, also after Esc closed the panel.
- `btw-cancel` cancels a running answer with Esc; the next Esc closes the panel.
- `btw-tools` offers only the enabled `read`, `grep`, `glob`, and `find` tools and the two Keenable MCP tools when both are connected. It never offers `web_search`, `bash`, or `write`.
- `btw-usage` records each Side question request in the main session's usage ledger, and a later thread's first request reads the earlier thread's cached prefix.
- `btw-agent` reads `agent://<id>` of a main-session agent that is still running and has no output yet.
- `btw-main-ends` ends the thread at the next main prompt; an answer still running finishes and shows first.
- `btw-private` keeps Side questions out of the main transcript.
- `btw-seed` starts a thread from the saved transcript: after compaction, after a `/tree` jump with or without a new prompt, and with a call still pending.
- `btw-native-ask` answers from the composer while a native form waits. The form keeps the answers, and its focused controls keep their keys.

## How to get to it (user POV)

- Type `/btw <question>` in the main editor and press Enter (Tern view or classic TUI).
- While a native `ask` waits, press Esc on the form to focus the composer. Send `/btw <question>` or `? <question>`. Press Shift+Tab to return to the form.
- Press `t` or Esc while the panel shows and the empty composer has focus.
- Click the "N tool calls" line (Tern view only).

## Driving it with tern ctl

Preconditions:

- Baseline from `README.md`, including one answered main prompt.

- Answer. Run `$C type '"/btw which extensions does omp/package.json register? read it"'` and `$C key Enter`. While it runs, `$C tree` contains `Answering…` and `to cancel`. When `$C tree` contains `to close`, run `$C shot btw-answer`. In the Tern view the heading reads `/btw` and `side question · only you see the answers` (two text nodes in `$C tree`), the question shows as a user bubble like the main chat's (a `sf-card` with an `sf-card-body` in `$C tree`), a `1 tool call` line shows, and the answer lists the extension files. In the classic TUI the question is a padded block on the user message background. The count is the number of calls the model made, so it can differ from 1.
- Fold. Run `$C key t`, `$C shot btw-fold-open`. The fold shows `read <path>` under it, and the hint reads `to fold tool calls`. In Tern, `$C click '.sf-section-head'` toggles the same line.
- Order. Run `$C type '"/btw First write one short line saying you will check omp/package.json. Then read it. Then say which test runner it uses."'` and `$C key Enter`. When the answer is done, run `$C shot btw-order`. The panel shows the short line, then the `1 tool call` line, then the answer naming `bun test`.
- Follow-up. Run `$C key Escape` (the panel closes), then `$C type '"/btw what file did you read for my first side question? one line, no tools"'`, `$C key Enter`, `sleep 20`, `$C shot btw-follow`. The answer names `omp/package.json`, the earlier turns show in the panel, and the Side question listing in `../SKILL.md` still shows the same single new `SideQuestion-*.jsonl` with every `<btw>` prompt.
- Cancel. Run `$C type '"/btw read README.md and summarize every section in detail"'` and `$C key Enter`. As soon as `$C tree` contains `to cancel`, run `$C key Escape` and `$C shot btw-cancel`. The turn ends with `Cancelled`. `$C key Escape` again closes the panel (`$C tree` no longer contains `only you see`).
- Tools. Run the [Keenable roster probe](#keenable-roster-probe).
- Usage. Run the same helper with `VERIFY_PROBE=usage` on an available Codex model. Set `modelRoles.smol` to that exact model in the owned smoke config; the Side question otherwise defaults to a different model. Send one main prompt of about 20k tokens (`Reply with only: ok.` followed by the text of the `omp-tools` section of the root `README.md`, `AGENTS.md`, and the files in `omp/docs/agents/`). The helper asks two threads different questions. `usage.json` holds one entry with purpose `side-question` per Side request (two here); entries with purpose `side-question:<purpose>` are the mirror's own off-transcript calls (cache warms, the `unexpected-stop` judge). The first `side-question` entry's `cacheRead` is near 0, since a thread's first request cannot reuse the main prompt cache. The second one's `cacheRead` is at least the first one's prompt (`input + cacheRead + cacheWrite`) less the first question's length (a few hundred tokens): the second thread reuses the shared conversation, not just an identical prompt. Assert on these numbers, not on the cache-miss marker, which never shows on Codex.
- Agent. Run the same helper with `VERIFY_PROBE=agent` and send `Use the task tool to spawn exactly one subagent named Sleeper (agent: task). Its task: run bash \`sleep 120\`, then yield the word done. Do not wait for it: right after spawning, end your turn with one short line.` `agent.json` shows `read agent://Sleeper` as `done`, and the answer quotes `# Sleeper (running)`.
- Main prompt ends it. With a thread open, run `$C type '"Reply with only: done"'`, `$C key Enter`, `sleep 15`. The Side question listing shows no new `SideQuestion-*.jsonl` and the panel is gone. A new `/btw` answers as a first question: the panel shows only the new turn.
- Running answer at a main prompt. Run `$C type '"/btw how many lines does AGENTS.md have? read it"'` and `$C key Enter`. While `$C tree` contains `to cancel`, send a main prompt, then `sleep 25`. The main reply and the Side answer both show, and the `SideQuestion-*.jsonl` is gone. The next main prompt clears the panel.
- Private. `jq -c 'select(.type=="message") | .message.role' <main session>.jsonl` and a read of the main transcript show no Side question text.
- Seed (`btw-seed`). Use the [shared launch](../SKILL.md#launch) with a local provider that records the full messages for each request. Configure these replies and start each case in a new session:
  - `Run the eval please`: call `eval` with `language: "js"` and `globalThis.counter = 41; "counter is " + (counter + 1)`, then acknowledge the result.
  - `Say alpha`, `Say beta`, and `Say alpha again`: reply with the requested text. For the compaction request, reply with a distinct summary you can find in the Side request.
  - `Call the small ask please`: call `ask` with a two-option radio form, then acknowledge the result.
  - The pending non-`ask` case needs a `bash` call with `sleep 60`. Side requests can return plain text without tools.

  Compare each captured Side request with the main request for the same history.
  - Compaction. Before launch, add `compaction:` and an indented `keepRecentTokens: 1` to `$OMP_CONFIG`. Send `Run the eval please`, `Say alpha`, `Say beta`, compact the session (`/compact`), then send `/btw what do you see?`. The Side request starts with the summary and holds the kept turn and the `Eval runtime state is host-retained` reminder the next main request also holds. It contains nothing from before the summary.
  - Tree, then a prompt. Send `Run the eval please`, then a turn on another subject (`Call the small ask please` and answer it). `/tree` back to the eval answer, send `Say alpha again`, then `/btw what do you see?`. After its system prompt, the Side request holds the same messages as the main request for `Say alpha again`, then that turn's reply and the `<btw>` prompt; nothing from the abandoned turn.
  - Tree, no prompt. Do the same `/tree` jump and ask `/btw` at once. The Side request ends at the selected eval answer and its saved eval state, then the `<btw>` prompt; nothing from the abandoned turn.
  - Pending call. The [local native ask session](native-ask.md#local-native-ask-session) can hold an `ask` while you send `/btw` from the composer. Check the Side request for the still-open `ask` result. For another tool, make the provider call `bash` with `sleep 60` and ask `/btw` while it runs. The Side result for that call reads `This call is still running in the main conversation. Its result is not known here. Do not call it again.`, and no later Side request calls `bash`.

### Keenable roster probe

Set up the [local native ask session](native-ask.md#local-native-ask-session) and start its provider. Do not launch the interactive session. Set `find.enabled: on` in `"$VERIFY_RUN_DIR/data/agent/config.yml"`. In the isolated agent directory, configure only the local `keenable` stand-in:

```sh
jq -n --arg bun "$(command -v bun)" \
	--arg server "$CHECKOUT/omp/test/helpers/keenable-mcp.ts" \
	--arg log "$VERIFY_RUN_DIR/mcp.jsonl" \
	'{mcpServers:{keenable:{type:"stdio",command:$bun,args:[$server,$log]}}}' \
	>"$VERIFY_RUN_DIR/data/agent/mcp.json"
```

Copy the Side question probe as [Helpers](../SKILL.md#helpers) describes. From `"$VERIFY_RUN_DIR/data/project"`, launch RPC:

```sh
VERIFY_PROBE=tools VERIFY_PROBE_LOG="$VERIFY_RUN_DIR/tools.json" \
	"$H/isolated-omp" "$VERIFY_RUN_DIR" "$OMP_BIN" --mode rpc --offline \
	--no-extensions -e "$VERIFY_RUN_DIR/provider.ts" \
	-e "$CHECKOUT/omp/extensions/verify-side-question-probe.ts" \
	--model vfix/main --session-dir "$VERIFY_RUN_DIR/data/sessions"
```

Send `{"id":"p1","type":"prompt","message":"Reply with only: ok"}` on stdin. Wait for `prompt_result` and `tools.json` before closing stdin. If launching RPC inside an isolated Tern pane, put the command and input in a run-local script. Pass the script path to `tern-verify type`, which rejects double quotes in the command line.

In `tools.json`, `threads[0].tools` contains exactly `read`, `grep`, `glob`, `find`, `mcp__keenable_search_web_pages`, and `mcp__keenable_fetch_page_content`. `calls` shows one completed `read` of `side-fixture.txt`. In `requests.jsonl`, check that the first request with a `<btw>` message offers the same six tools and that its prompt names them. This probe requires neither real Keenable nor a remote model.

### During a native ask

Run the [local native ask session](native-ask.md#local-native-ask-session) once in Tern and once with `PI_TUI_NATIVE=0`. Use a fresh session for each renderer. The open `ask` turn provides the saved transcript, so skip the baseline main prompt.

1. Send `Call the ask tool for Side questions`. In **Pick a color**, move to Blue with Down and pick it with Space. Press `n`, type `PrivateNote-407`, and press Enter to save the Note.
2. Press Tab to move to **Pick a shape**, then Down twice to reach **Other**. Type `PrivateOther-581` and press Enter. In **Label**, type `PrivateLabel-963`. Capture the form without submitting it.
3. Press Esc to focus the composer. Send `/btw Read the local fixture`. Wait for `Local Side read answer.` and `1 tool call`. The form stays open. In classic, pause half a second after Esc before you type.
4. Send `? Check the follow-up`. Wait for `Local Side follow-up answer.`. Verify that both questions appear in the same panel. With the empty composer focused, press `t` to show `read side-fixture.txt`, then press `t` again to fold it.
5. Press Shift+Tab to return to **Label**. Press `t` and verify the field shows `PrivateLabel-963t` while tool calls stay folded. Press Esc and verify focus returns to the composer while the panel stays open.
6. Press Shift+Tab, Tab, and Enter to submit. Check the main transcript for a native `ask` result with `color: blue`, `shape: PrivateOther-581`, `label: PrivateLabel-963t`, and the Note `PrivateNote-407` on Blue.
7. In `requests.jsonl`, select the `side` requests with a `<btw>` message. Each has the pending `ask` call and the still-open result with the same call ID, no submitted `answers` or `notes` result, and none of the three private markers. Blue is present in the form's HTML, not as a submitted pick. Check that the main transcript contains neither Side question nor answer.
8. Start a separate fresh session with the same local provider. Open the form again, press Esc, and send `Continue with the ordinary message`. Check that the native form closes and the main model replies `Local main received the ordinary message.`. Confirm the user message in the main transcript and provider log.

## Gotchas

- `/btw` sent before the main prompt's reply lands is answered from the transcript as it was then; the Side question does not see the reply still streaming.
- The Side question's thread file (`SideQuestion-<uuid>.jsonl` under `$TMPDIR/omp-side-question-*/`, never in the sessions dir) exists only while the thread lives. Read usage from the main session's `model_usage` entries with `purpose: "side-question"` instead (`jq -c 'select(.type=="model_usage" and .purpose=="side-question") | .usage' <main session>.jsonl`).
- `t` and Esc pass through while the composer has text or another component has focus. Esc is the default `app.interrupt` key. If the user's keybindings change it, use that key.
- Bare `/btw`, a focused subagent view, and RPC go to OMP's own `/btw`; they are not this feature.
- Classic TUI (`PI_TUI_NATIVE=0`) and the Tern view are separate entry points.
- `/btw` uses `sideQuestionModel`, default `@smol`, with the selected role's thinking and fallback chain. Model-setting changes apply to the next thread.
- For retry and terminal-error proof, use an owned finite chain. Inherited default chains can revisit earlier failed models and keep switching until Esc; Side questions deliberately preserve OMP's policy. Model-specific empty terminal chains prevent that inheritance.
- Provider transport retries precede the session-level recovery events. A panel showing `Answering…` before the first retry event does not establish a missing fallback.
- The Side request carries notices from the mirror's own session after the copied history and before the `<btw>` prompt: `No retained eval runtime is registered in this process` and, after a ratchet run, `` `eval` prelude globals changed `` naming `ratchet` as no longer available. These are an accepted transformation (Seed in `omp/docs/agents/side-questions.md`). Leave them out when comparing with the main request.
