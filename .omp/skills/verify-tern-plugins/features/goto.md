# Go to picker

The Go to picker is a sheet in the middle of the window, in the place of the command palette, drawn by Tern's own picker node. It lists the sessions, tabs and panes of the window as a tree with jump numbers, and moves the focus to the row that you pick. It opens with agent panes only. Panes that wait for you (needs input, error, alert, done, paused, idle) show again under the group header `Waiting on you`, above the tree's header `Sessions`. Agent rows show their working time or waiting time, except idle and paused rows.

## Sub-features

- `goto-open` opens the picker over the window. A second f1 closes it.
- `goto-all` switches between agent panes only and all panes with the ctrl+; prefix, then `a`, or with a click on `All panes` in the action bar.
- `goto-search` filters the tree rows by typed letters, shows Tern's `No panes match` state with no match, and Esc or its Clear button clears the search.
- `goto-shared-number` gives a session that shows only one tab the same jump number as that tab. The tab row shows no number, and Up and Down skip it.
- `goto-jump` moves the focus to the row of a typed jump number and closes the picker. With more than nine numbers, each number has two digits (`01`), the first digit waits, and Esc clears it.
- `goto-enter` moves the focus to the cursor row with Up, Down and Enter.
- `goto-waiting` shows a pane that waits for you under `Waiting on you`, named `session / tab / pane`, without the tab when its name is the pane's name. It leaves out the pane that you opened the picker from.
- `goto-tab-order` lists the tabs of a session by their tab status (input, error, alert, done, paused, idle, retrying, compacting, working, background, running, exited, then quiet), and tabs of the same status by working time or waiting time, longest first, then in Tern's order. A split tab takes the most urgent status of its panes in the view, and the longest time among those panes. The panes of a split tab come by time, longest first.
- `goto-native-ask-status` shows a waiting native `ask` under `Waiting on you` with a needs-input mark and waiting time.
- `goto-panel-status` leaves a working pane with the `/btw` panel and an idle pane with the English coach panel out of `Waiting on you`.
- `goto-finished` shows an agent whose turn ended while its pane had no focus as `done` in the Waiting on you rows, and one whose turn failed as `error`, until you focus that pane. A turn that ends while its pane has focus adds no row. An agent that exits stays out of the group.
- `goto-idle` shows or hides idle agents in the Waiting on you rows with ctrl+; then `i`, or `Show idle` in the action bar, and keeps the choice.
- `goto-close` closes the picker on Esc with no search, on a second F1, when the focus goes to another pane (also by a click outside the box), and on `tern plugin reload`.
- `goto-zoom` puts the box where Tern's command palette sits, as wide as it, at each interface size, with the action bar in the window.
- `goto-marks` gives each row the status mark of its pane after the jump number; busy panes have a moving mark.
- `goto-times` shows the working time of a working agent in the accent, and the waiting time of an agent that waits on you in the warning tone, on every row of its pane.
- `goto-paused` shows omp's `/pause` as a still muted pause glyph with tooltip `Paused`. It outranks every status except exited, joins Waiting on you after done and before idle even with idle hidden, and shows no time. Resume restores the other status and keeps the turn's original working-time start.

## How to get to it (user POV)

- Press F1.
- Choose `Go to session, tab or pane` in the command palette.

## Driving it with tern-verify

Preconditions:

- The baseline from `README.md`.
- Two tiled panes: press `"$V" ctl "$RUN" key alt+n` once.
- Read the rows as text: `opts() { "$V" ctl "$RUN" tree '.sf-picker .pk-row' | jq -c '[.nodes[].text]'; }`. Group headers show as rows too (`Waiting on you1`, `Sessions`), and a row's time ends its text (`… data10.5s`). The picker is open when `"$V" ctl "$RUN" tree "[aria-label^='Go to,']" | jq .count` prints 1. Keep the comma: the picker's own sheet is named `Go to…` and also matches `Go to`.

- Open with F1. Run `"$V" ctl "$RUN" key f1`, then poll the picker count until it is 1. `opts` prints `["Sessions","1 Default"]` when no pane runs an agent. The box is at `[320,96,640,511]` (`dump "[aria-label^='Go to,']"`) after its open animation ends.
- Open from the palette. With the picker closed, run `"$V" ctl "$RUN" palette '"Go to session, tab or pane"'` and `"$V" ctl "$RUN" key enter`. The picker count is 1.
- All panes. Run `"$V" ctl "$RUN" key 'ctrl+;'`. The head's title (`tree '.sf-picker .pk-title'`) shows `A all panes I show idle esc cancel`: Tern 0.9.34 draws the action keys as upper-case keycaps. Then run `"$V" ctl "$RUN" type a`. `opts` lists `Sessions`, `1 Default`, `<tab>` with no number (the session shares 1 with its only tab), `2 <pane>` and `3 <pane>`, and `tree '.sf-picker .pk-btn.on'` is `All panes`. A click on that button (`click '.sf-picker .pk-btn:nth-child(1)'`) switches back.
- Row alignment. In all panes, `tree '.sf-picker .pk-label > span'` shows each row starting with its jump number at one x, then one 22 px mark slot (`sf-t-icon` or `sf-t-num`), and `tree '.sf-picker .pk-chev'` and `'.sf-picker .pk-lead'` show nothing drawn. Tab rows have one `.sf-t-code` cell and pane rows two; `tree '.sf-picker .pk-label .sf-t-code'` gives each cell the y and height of its row (`.pk-row`), at interface sizes 13, 10, 18 and 24, so the lines of rows join.
- Search miss. Run `"$V" ctl "$RUN" type zzq`. `opts` prints `[]`, and `tree '.sf-picker .pk-state'` holds `No panes match “zzq”` with a `Clear search` button.
- Clear the search. Run `"$V" ctl "$RUN" key escape`, or click `.sf-picker .pk-state button`. The rows come back and the picker stays open.
- Jump number. Note the focused id (`ctl state | jq .focused.id`), then run `"$V" ctl "$RUN" type 2`. The focus goes to the first pane, the picker count is 0, and the picker pane leaves `tern ls`.
- Waiting on you. Focus pane B with `"$V" tern "$RUN" focus B`, run `"$V" ctl "$RUN" alert bell '"verify bell"'`, focus pane A, press F1, then ctrl+; and `a`. `opts` starts with `Waiting on you1`, then `1 Default / <pane B>`, then `Sessions` and the tree numbered from 2. The bell row's `title` is `Alert` and its label holds the bell glyph span `sf-t-icon sf-t-error`.
- Time order. Make tabs `T1`, `T2`, `T3` (`tab new`, each named by `cd` into a folder of its name) and a split tab with panes `P1` and `P2` (`tab new`, Alt+N), ring `alert bell` in each of those five panes, and focus pane A last: a focus ends the waiting time of the focused pane. Then write `RUN/instance/config/plugin-data/goto/kv.json` (make the folder; goto writes no file until it stores something) with `.since` holding, by pane id, `{"kind":"waiting","at":<now - N>}` with N = 100 for T1, 600 for T2, 300 for T3, 50 for P1 and 400 for P2. Press F1, then ctrl+; and `a`. The group is T2 (10m), P2 (6m40s), T3 (5m), T1 (1m40s), P1 (50s). Under `Default` the tabs are T2, the split tab, T3, T1, then `BASE`, and the split tab lists P2 before P1.
- Tab order. From the baseline, name pane A `BASE`. Then make these tabs with `tab new`, each named by `cd` into a folder of its name: `BELL` (ring `alert bell`), `SPLIT` (Alt+N, name the new pane `RING` and ring a bell in it, then `"$V" tern "$RUN" focus <SPLIT id>`), `SLEEP` (type `sleep 300`, which makes its label `SLEEP: sleep 300`) and `QUIET`. Press F1, then ctrl+; and `a`. The tab rows under `Default` are `BELL`, `SPLIT`, `SLEEP`, `BASE`, `QUIET`: the two alert tabs first, then the busy tab, then the quiet tabs, each status in Tern's order, because a bell starts no waiting time. Type `s`: the tab rows are `SPLIT`, `SLEEP`, `BASE`.
- Enter. Run `"$V" ctl "$RUN" key up` until the cursor is on the bell row (`.pk-row.sel`), then `"$V" ctl "$RUN" key enter`. The focus goes to pane B and the picker closes.
- Close. Open the picker, then each of these closes it (count 0): `key escape` with no search, `"$V" tern "$RUN" focus A`, a click on the head of a tiled pane above the box (`"$V" ctl "$RUN" click '".tn-stage > section.tn-pane:not(.off):not(.pip) > header.tn-head"'`), and a second `key f1`.
- Idle choice. Open the picker, press ctrl+; then `type i`. `RUN/instance/config/plugin-data/goto/kv.json` holds `"waiting_idle": true`. A second ctrl+; `i` sets it to `false`.
- Close on reload. Open the picker and run `"$V" tern "$RUN" plugin reload`. The picker count is 0, and `tern ls` lists no `Go to` pane.
- Targeted reload. Open the picker, run `"$V" tern "$RUN" plugin reload reader-terminal-text`, and wait for the reload. The picker stays open. `plugin reload goto` closes it and removes its pane.
- Two digits. Open more tabs and panes (Alt+N, `"$V" ctl "$RUN" tab new`, Alt+Shift+T) until all panes give more than nine numbers. In all panes, `opts` shows `01`, `02` and so on. `type 1` keeps the picker open, and `key escape` clears the digit and keeps the rows. Then read `opts`, pick a number that it shows with a first digit `1` (`10` is always there), and type its two digits one at a time. The focus goes to the pane of that row, and the picker closes. A number that `opts` does not show does nothing: the picker stays open with no digit waiting, so a following Esc closes it.
- Interface size. For each size of 18, 24 and 10: run `"$V" ctl "$RUN" ui-font-size 18`, open Tern's palette with `"$V" ctl "$RUN" palette '""'`, read `"$V" ctl "$RUN" dump '[id=pal] .tn-cmdk' | jq -c '.elements[0].rect'`, close it with `key escape`, press F1 and wait 0.5 s. The rect of `dump "[aria-label^='Go to,']"` has the x, y and width of the palette box, and `dump '.sf-picker .pk-bar'` is `visible: true` and ends inside the window (y + h at most 800). The row label (`dump '.sf-picker .pk-label'`) grows and shrinks with the size (17.3 px at 18, 9.6 px at 10). Close the picker after each size. Then run `ui-font-size 13`: the box is at `[320,96,640,511]` again.
- Palette veil. Open the file tree, then compare a palette shot with a Go to picker shot. Both dim the window through Tern's `--modal-dim`, including tab-bar text and the file tree. In a dark theme, the computed body shadow while goto is open uses 30% black. Read `$('body'):style('box-shadow')` in devtools. Tab-bar and file-tree pseudo-elements use the same dim; no brightness filter should remain. Close with Enter into another tab and confirm its pane has focus and the body shadow is `none`. Repeat the shadow check after Esc, a second F1, focus elsewhere, native pane close, and a targeted goto reload. The fixed veil sheet uses `:has()` to follow the visible picker, so none of these paths should leave dimming behind.
- Veil style cost. The veil rules must not make a pane switch restyle the whole window. Fill two tabs with long Reader transcripts (`omp --resume <copy of a long session> --session-dir <run dir>`; `ctl stats` should report 100,000 nodes or more), then trace five switches between them: `ctl trace start`, `ctl tab <n>`, `ctl wait 400`, `ctl trace stop`. Sum the `style` spans of each trace. Drop the sheet with `ctl css plugin:local:goto:veil`, trace again, and reload goto. The two sums should match within noise. A veil rule with a descendant combinator after `:has()` gave 300 to 400 ms against 20 to 40 ms at 211,000 nodes.
- Working time. These steps start omp in panes and send each a prompt: a real model request. Write `RUN/data/quiet.yml` with `completion:` and `error:`, each with `  notify: "off"`, so omp's own notices stay out. In pane B, run `"$V" type "$RUN" 'omp --config=<RUN>/data/quiet.yml '\''Write the numbers from 1 to 300 as English words, one per line. Do not use tools.'\'''` and at once `"$V" tern "$RUN" focus 5` (pane A). Poll `kv.json` until `.since` holds B's id with `"kind": "working"`. Press F1 a few seconds later: B's row ends with a time close to omp's own working timer, `dump '.sf-picker .pk-row[data-tone] .pk-fact'` gives the accent color, and the row's `title` is `Working`. Close the picker.
- Finished turns. Poll `kv.json` until `.finished` holds B's id with `"done"` and `.since` holds it with `"kind": "waiting"`. Run `"$V" ctl "$RUN" inbox clear`, because Tern's own inbox alert also shows as `done`. F1 then shows `1 Default / <tab> / omp` under `Waiting on you`, its `title` is `Done`, and both of B's rows end with the same time, which equals now minus `.since.<B>.at` within a second, in the warning color. `"$V" tern "$RUN" plugin reload` keeps it. Focus B, then A: `.finished` and `.since` are empty, and F1 shows no Waiting on you rows.
- Focused turn. Focus B, run `"$V" ctl "$RUN" type '"Reply with the word OK again."'` and `key enter`, and stay on B until `"$V" ctl "$RUN" state | jq .inbox.count` grows (Tern's alert at the end of the turn). `.finished` and `.since` stay empty. Focus A, run `inbox clear` and press F1: no Waiting on you rows.
- Failed turn. Write `RUN/data/fail.yml` as `quiet.yml` plus `retry:` `fallbackChains:` with `default: []`, `slow: []`, `vision: []` and `plan: []`. In a pane C (Alt+N), run `omp --config=<RUN>/data/fail.yml --provider anthropic --model claude-sonnet-4-5 --api-key=sk-ant-invalid-verify 'Reply with OK'` and focus A at once. `.finished` holds C's id with `"error"` within a few seconds. After `inbox clear`, F1 shows C under `Waiting on you` with the `title` `Error` and the `sf-t-icon sf-t-error` warning glyph. This request fails at the API and costs nothing.
- Exit. Focus C, run `"$V" ctl "$RUN" type '"/exit"'` and `key enter`, then focus A and run `inbox clear` (the shell's completed omp command can raise a new done alert). `.finished` and `.since` lose C, and F1 with all panes shows no Waiting on you row for C.
- Busy mark. In pane B after `/exit`, or a new shell pane, type `sleep 300` with `ctl type` and press Enter, then focus A, open F1 and switch to all panes. B's row has the `title` `Running a command`, no time, and a `sf-t-num sf-t-em` span whose `transform` in `ctl dump '.sf-picker .pk-label .sf-t-num.sf-t-em'` changes between two dumps 100 ms apart (screenshots freeze animations, so compare dumps). Take the dumps after `reduce_motion` in `RUN/instance/config/settings.json` is back to `off`: the picker holds it `on` for 400 ms after it opens, and dumps in that time both show `none`. A working omp row has `sf-t-num sf-t-accent`.
- Pause without a model request. In an idle omp pane B, type `/pause` with `ctl type` and press Enter. The layer sheet reads `Paused`. Focus pane A and press F1. With idle rows hidden, B has a Waiting on you row and a tree row, both titled `Paused`; `tree ".sf-picker .pk-row[title='Paused'] .sf-t-icon.sf-t-muted"` shows U+F04C, and `tree ".sf-picker .pk-row[title='Paused'] .pk-fact"` has count 0. Close the picker, focus B and press Esc to resume. Focus A and press F1 again: B is `Idle` and absent from Waiting on you. Keep the before, paused and resumed row dumps and shots.
- Pause precedence and time at the local protocol boundary. A disposable TSP sender can emit the same `omp.overlay.pause` role in the layer, alongside ask, retry, compacting or error nodes, and report OSC 7501 `working`, `done` or `error` with `app=omp`. Write TSP frames as `ESC _tsp;<verb>;<json> ESC \` and the state as `ESC ]7501;state=<state>:app=omp ESC \`; a `;` between the fields or a BEL terminator gives no state event. Open F1 from another pane. Paused wins over those statuses and has no elapsed fact, including with a stored done or error. Remove the layer pause and check that the earlier status returns. With `working` unchanged, compare the visible working time before and after the hold: it includes the hold. A pause role under main or dock, or composer badges `Goal`, `Loop paused` and `Plan (paused)`, must not produce Paused. Use this boundary only for combinations; keep the real `/pause` check above as proof of the integration.
- Proof. Run `"$V" shot "$RUN" goto-<step>` with the picker open. The shot shows the sheet with its rows and action bar over the dimmed window.

### Native ask and panel status with local models

Start from the baseline with one shell pane, A. Run `"$V" tern "$RUN" plugin reload goto`, then `"$V" tern "$RUN" plugin list`. Save both outputs and require `goto` to show `ready`. Leave idle rows hidden.

Run from the checkout root. Link this read-only status probe into the isolated instance only:

```sh
CHECKOUT=$PWD
H="$CHECKOUT/.omp/skills/verify-omp-tools/helpers"
OMP_BIN=$(command -v omp)
"$V" tern "$RUN" plugin link "$CHECKOUT/.omp/skills/verify-tern-plugins/fixtures/goto-agent-status"
"$V" tern "$RUN" plugin reload goto-agent-status
```

With the Go to picker open, run `"$V" ctl "$RUN" plugins run plugin.goto-agent-status.capture`. Save `RUN/instance/config/plugin-data/goto-agent-status/kv.json` as a separate capture for each case. Match `.agents[].pane` to the pane ID and check its `state`. This list comes directly from Tern, not from Go to.

1. **Native ask.** Set `VERIFY_RUN_DIR=$RUN` and follow [Local native ask session](../../verify-omp-tools/features/native-ask.md#local-native-ask-session). After `setup` and before starting omp, enable status reports in the disposable config:

   ```sh
   printf '\nterminal:\n  programStatus: true\n' >>"$RUN/data/agent/config.yml"
   "$H/isolated-omp" "$RUN" "$OMP_BIN" config get terminal.programStatus
   ```

   Require `true`. Open a second tab with `"$V" ctl "$RUN" tab new` and launch the session there. Submit `Call the ask tool please`. Poll `tree ".sf-main [data-role='omp.ask.card']"` for `Pick a color`. Capture the form without answering.

   Focus pane A with `"$V" tern "$RUN" focus <A>`, then press F1. Save the rows and the probe's list while the picker is open. Require the unfocused omp pane to report `waiting_input`. Its row under `Waiting on you` has the title `Waits for your input`, a `.sf-t-icon.sf-t-warning` mark, and a `.pk-fact` with the waiting time. Capture the picker and the corresponding `since` entry in Go to's `kv.json`. Close the picker. Answer the form, exit omp, and close the test tab before the next case.

2. **Side question in a held turn.** Keep the disposable omp config and plugin link from step 1. Start `bun "$CHECKOUT/.omp/skills/verify-tern-plugins/helpers/goto-held-provider.ts" "$RUN"` as an owned process. Wait for `ready:`. Start a fresh tab and launch:

   ```sh
   "$V" type "$RUN" "cd '$RUN/data/project' && exec '$H/isolated-omp' '$RUN' '$OMP_BIN' -e '$RUN/held-provider.ts' --offline --model goto-held/main --smol goto-held/side --session-dir '$RUN/data/held-sessions'"
   ```

   Submit `Say ready` and wait for `Main ready.`. Submit `Hold the main turn` and wait for `Main turn held open.`. The local provider keeps that response open without an `ask` call. Submit `/btw What is the local status?` and wait for `Local Side answer during a held turn.` in the panel. Capture the panel and save `held-requests.jsonl`.

   Focus A, clear Tern's inbox with `"$V" ctl "$RUN" inbox clear`, and press F1. Require `working` in the probe's list. In Go to, the pane belongs only under `Sessions`, with title `Working`, an `.sf-t-num.sf-t-accent` mark, and a working time. Close the picker and focus the omp pane. Press Esc to close the panel, then Esc again to cancel the turn before exiting omp and closing its tab.

3. **English coach.** Set `COACH=$RUN/coach`. Create its disposable home, tmp, and session directories:

   ```sh
   mkdir -p "$COACH/data/home" "$COACH/data/tmp" "$COACH/data/sessions"
   ```

   Start `bun "$H/english-coach-provider.ts" "$COACH"` as an owned process. Wait for `ready:`. In a fresh tab, launch:

   ```sh
   "$V" type "$RUN" "cd '$COACH/data/project' && exec '$H/isolated-omp' '$COACH' '$OMP_BIN' --no-extensions -e '$COACH/provider.ts' -e '$CHECKOUT/omp/extensions/english-coach.ts' --no-skills --no-rules --no-context-files --no-lsp --offline --thinking off --model coach-smoke/main --config '$COACH/smoke-config.yml' --session-dir '$COACH/data/sessions'"
   ```

   Submit `it not work`. Wait for the main answer and for `tree "[data-role='omp-tools.english-coach.change']"` to show the correction. Capture the panel. Focus A, clear the inbox, and press F1. Require `idle` in the probe's list and a row titled `Idle` under `Sessions`. The pane has no needs-input mark and does not join `Waiting on you`.

Save the rows, shots, raw agent lists, and provider requests. Record the results and resolved candidate paths in `RUN/notes.md`. Copy transcripts out of `RUN/data` before stopping the instance and the owned providers.

## Gotchas

- Without the ctrl+; prefix, a typed letter goes into the search. `a` and `i` alone search for those letters.
- On Tern 0.9.34, after ctrl+; and `a` with a Waiting on you row, two rows can keep `.pk-row.sel` and `aria-selected=true`: the cursor's row and a stale `Default` row (#42). Only the cursor's row is painted, and Enter follows it. Pick the row with an attribute it alone has, such as `.pk-row.sel[title=Alert]`, rather than assuming one `.pk-row.sel`.
- In the agents-only view, a plain shell pane never shows, also as a Waiting on you row. Switch to all panes to see it.
- The rect of the box is a little off for about 200 ms while the box opens. Wait before you measure it.
- Jump numbers follow the visible rows, so the number of a pane changes with the view and the search. Read `opts` right before you type a number. With ten or more numbers, every number has two digits, and `type 2` only waits for a second digit.
- A typed digit is always a jump number, also in search.
- Tern raises its own finished or failed inbox alert after each agent turn, and goto shows a pane with an alert as `done`. Run `"$V" ctl "$RUN" inbox clear` before you judge a done row. `ctl inbox` with no word opens the inbox; close it with `inbox close`.
- `ui-font-size` changes the interface size of this instance until you set it back. Set it to the copied `ui_font_size` (13) before the next step.
- An Esc in omp's composer cancels a turn without an `agent_finished` event, and Tern keeps the agent `working`. That is Tern's behavior, not a goto fault.
- A working agent that was already working before a plugin reload or before Tern started shows no time: goto did not see its start.
- The user's `ui_font` (copied into the run) sets the picker's font; a mono `ui_font` makes the picker look mono.
- On Tern 0.9.7 an over-budget hook pauses briefly instead of staying disabled until reload. Native calls, including `tern.kv`, do not count toward its Lua budget. Read `plugin hook exceeded its budget; paused` and the resumed entry in the runtime log if behavior stops. A plugin may show a paused state rather than `ready` during that interval.
