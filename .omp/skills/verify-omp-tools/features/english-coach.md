# English coach

The English coach checks submitted English in the background with `@tiny`, without changing the main prompt. It shows a private panel only for corrections. `/english-coach` opens the dashboard for local Coach memory.

## Sub-features

- `coach-correction`: the coach note shows the prompt with marked changes. In Tern, use `$C dump "[data-role='omp-tools.english-coach.change']"` to locate a change and move the pointer over it. Its hover card shows the changed words and explanation. Classic lists each explanation below the prompt.
- `coach-correct`: the editor has no coach panel while the check runs or after `No mistakes`.
- `coach-theme`: in Tern, the correction shares the native note frame with `/btw`, including border and surface. Its tag is `coach`, and its changed words use the theme's deletion and insertion styles.
- `coach-limit`: prose over 300 tokens stays quiet, with no tiny request.
- `coach-fence`: a short sentence above 500 fenced code lines is checked. The coach request contains a placeholder, not the code, and the panel shows one `[code block, 500 lines]` marker.
- `coach-btw`: one coach request for the question text, with both the correction and the Side question answer visible.
- `coach-command`: `/model coach-smoke/main` removes the coach panel and makes no tiny request. The host's handling of the command is not the coach's contract.
- `coach-close`: with the editor empty, Escape removes the panel without altering Coach memory. Tern also has a Close control.
- `coach-memory`: the third prompt with an article fix shows one cue; the dashboard shows Articles with three prompts and opens its examples and practice.

## How to get to it (user POV)

Submit a prompt in the main interactive editor. The coach starts enabled with a 300-token limit. It does not run in RPC, ACP, print mode, or subagents. The editor keeps focus while the panel shows. Submit another line to replace or clear the outcome.

For live proof, use the local provider below instead of real credentials. It supplies deterministic corrections, not a correction-quality assessment.

## Driving it with tern ctl

Use a fresh `$VERIFY_RUN_DIR` for each renderer. Read [the parent skill](../SKILL.md) first. This recipe uses explicit entry paths and a local provider. Keep the version, typecheck, and instance checks.

1. Set `PROVIDER="$H/english-coach-provider.ts"` using `H` from the parent skill.
2. Start `bun "$PROVIDER" "$VERIFY_RUN_DIR"` as an owned process. Wait for `ready:` and keep its PID. It seeds the agent directory and writes the provider extension and scenario inputs. Requests go to localhost and are recorded in `requests.jsonl`.
3. Start `"$V" start "$VERIFY_RUN_DIR" --profile omp-tools --headless`. Require `dialogs: []`. Size the renderer with `$C size 900 650` to exercise the height cap.
4. Start OMP in the focused pane with this shell command. Use absolute paths and quote any path with spaces.

   ```sh
   cd "$VERIFY_RUN_DIR/data/project" && exec env \
   HOME="$VERIFY_RUN_DIR/data/home" \
   PI_CODING_AGENT_DIR="$VERIFY_RUN_DIR/data/agent" \
   PI_PROFILE= PI_SMOL_MODEL= PI_SLOW_MODEL= PI_PLAN_MODEL= \
   "$OMP_BIN" --no-extensions -e "$VERIFY_RUN_DIR/provider.ts" \
   -e "$CHECKOUT/omp/extensions/generate-image.ts" \
   -e "$CHECKOUT/omp/extensions/english-coach.ts" \
   -e "$CHECKOUT/omp/extensions/btw.ts" \
   --no-skills --no-rules --no-context-files --no-lsp --no-title \
   --offline --thinking off \
   --model coach-smoke/main --smol coach-smoke/side \
   --config "$VERIFY_RUN_DIR/smoke-config.yml" \
   --session-dir "$VERIFY_RUN_DIR/data/sessions"
   ```

   Create `data/home` before launch. For classic, add `PI_TUI_NATIVE=0` to `env`. For Tern, leave that variable unset. The configuration pins `default`, `tiny`, and `smol` to local models and disables retry fallback. The project, HOME, and agent directory are fresh. Do not copy user auth or plugin state.

5. Wait for the OMP composer. Setup must not open. Click `.tv-input` if the terminal lacks focus.
6. For each scenario below, run `bun "$PROVIDER" "$VERIFY_RUN_DIR" <scenario>` to paste its input, then `$C key Enter` to submit. The helper sends literal bracketed-paste delimiters, preserving multiline input. For `fence`, first choose **Paste inline** in OMP's paste dialog with Down, Down, Enter, wait half a second, then submit with Enter. Do not choose **Attach as local file**.

   | Scenario | Expected panel and request evidence |
   |---|---|
   | `mistakes` | No panel during the provider delay. Then the correction leaves the composer visible. Tern puts explanations on the changed words; classic lists them below. One tiny request. |
   | `correct` | No coach panel. One tiny request and one more checked English prompt in memory. |
   | `paragraphs` | The reply's rewrite keeps the prompt's blank line. The correction marks both paragraphs, and no `unreadable reply` warning shows. One tiny request. |
   | `over` | No coach panel and no tiny request. |
   | `fence` | The correction shows one `[code block, 500 lines]` marker. The tiny request contains `[[COACH_1]]` and no `const value` code. |
   | `btw` | The coach correction and `Local Side question answer.` coexist; exactly one tiny request for `why it not work?`. |
   | `model` | No English coach panel and no tiny request. |
   | `dashboard`, `report`, `button` | Three corrections of the same rule. The first two have no cue. The third says how often Articles occurred, and points to `/english-coach`. |

   Wait for each completed outcome before sending the next scenario. Capture a shot and tree for every scenario. In classic, `$C expect '"<expected text>"'` checks grid text when the tree has no terminal contents. Pair screenshots with `requests.jsonl` and the saved session JSONL. Record request indices before and after each submission, rather than counting the entire file.

7. On the long correction, check that the panel stays above the composer and within the pane width. In Tern, inspect `$C dump '[data-role="omp-tools.panel-body"] > .sf-list-scroll'`. Hover the body and run `$C wheel 0 600`. The capped body must not grow. Classic ends a clipped correction with `… N more lines` and leaves the editor visible.
8. After the three article corrections, send `/english-coach`. In Tern, capture the centered popup: four stat cards, the Articles focus card with Open and Practice, and the Articles rule row. Click the row (or press Enter) and check the explanation and the before-and-after word diff; press `p` and answer one practice choice, which marks the right choice in green. In classic, capture the full-screen text dashboard, select Articles and press Enter; check the observed frequency and the examples, and run one practice exercise. Closing a correction must not change the counts. To check reset, do it only in this disposable home; confirm both the empty dashboard and absence of request traffic.
9. Keep the shots, trees, requests, and session transcript. Record the feature IDs, renderer, and evidence in `notes.md`. Run `"$V" stop "$VERIFY_RUN_DIR"`, then stop the provider PID this run started.

## Gotchas

- Tern's scenario parser does not decode JSON `\u001b` escapes. The input helper emits actual ESC bytes. Plain `type` with embedded newlines submits separate prompts and invalidates the fenced-paste check.
- Repetitive synthetic replies can trigger `completeSimple` stall retries. The fixture uses distinct mistakes so the long-panel scenario tests layout instead of retry behavior.
- Side question startup may make auxiliary skill-hint requests on `smol`. They remain local. Count coach requests on the `tiny` model separately from `side` requests.
- The local provider ignores the real semantic task. It cannot prove real tiny-model correction quality. A smoke also covers only one real eager/deferred startup order; the input-handler tests cover the two explicit entry-point orders. Keep both proof gaps named in the result.
- Since omp 19.2, `--no-tools` loads no extensions, so the launch leaves it out: with it, omp rejects the `-e` entry points.
