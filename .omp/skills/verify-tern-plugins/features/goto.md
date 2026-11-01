# Go to picker

The Go to picker is a sheet in the middle of the window, in the place of the command palette, drawn by Tern's own picker node. It lists the sessions, tabs and panes of the window as a tree with jump numbers, and moves the focus to the row that you pick. It opens with agent panes only. Panes that wait for you (needs input, error, alert, done, idle) show again under the group header `Waiting on you`, above the tree's header `Sessions`. Agent rows show their working time or waiting time.

## Sub-features

- `goto-open` opens the picker over the window. A second f1 closes it.
- `goto-all` switches between agent panes only and all panes with the ctrl+; prefix, then `a`, or with a click on `All panes` in the action bar.
- `goto-search` filters the tree rows by typed letters, shows Tern's `No panes match` state with no match, and Esc or its Clear button clears the search.
- `goto-shared-number` gives a session that shows only one tab the same jump number as that tab. The tab row shows no number, and Up and Down skip it.
- `goto-jump` moves the focus to the row of a typed jump number and closes the picker. With more than nine numbers, each number has two digits (`01`), the first digit waits, and Esc clears it.
- `goto-enter` moves the focus to the cursor row with Up, Down and Enter.
- `goto-waiting` shows a pane that waits for you under `Waiting on you`, named `session / tab / pane`, without the tab when its name is the pane's name. It leaves out the pane that you opened the picker from.
- `goto-tab-order` lists the tabs of a session by their tab status (input, error, alert, done, idle, retrying, compacting, working, background, running, exited, then quiet), and tabs of the same status last seen first. A split tab takes the most urgent status of its panes in the view.
- `goto-finished` shows an agent whose turn ended while its pane had no focus as `done` in the Waiting on you rows, and one whose turn failed as `error`, until you focus that pane. A turn that ends while its pane has focus adds no row. An agent that exits stays out of the group.
- `goto-idle` shows or hides idle agents in the Waiting on you rows with ctrl+; then `i`, or `Show idle` in the action bar, and keeps the choice.
- `goto-close` closes the picker on Esc with no search, on a second F1, when the focus goes to another pane (also by a click outside the box), and on `tern plugin reload`.
- `goto-zoom` puts the box where Tern's command palette sits, as wide as it, at each interface size, with the action bar in the window.
- `goto-marks` gives each row the status mark of its pane after the jump number; busy panes have a moving mark.
- `goto-times` shows the working time of a working agent in the accent, and the waiting time of an agent that waits on you in the warning tone, on every row of its pane.

## How to get to it (user POV)

- Press F1.
- Choose `Go to session, tab or pane` in the command palette.

## Driving it with tern-verify

Preconditions:

- The baseline from `README.md`.
- Two tiled panes: press `"$V" ctl "$RUN" key alt+n` once.
- Read the rows as text: `opts() { "$V" ctl "$RUN" tree '.sf-picker .pk-row' | jq -c '[.nodes[].text]'; }`. Group headers show as rows too (`Waiting on you1`, `Sessions`), and a row's time ends its text (`… fish10.5s`). The picker is open when `"$V" ctl "$RUN" tree "[aria-label^='Go to,']" | jq .count` prints 1. Keep the comma: the picker's own sheet is named `Go to…` and also matches `Go to`.

- Open with F1. Run `"$V" ctl "$RUN" key f1`, then poll the picker count until it is 1. `opts` prints `["Sessions","1 Default"]` when no pane runs an agent. The box is at `[320,96,640,511]` (`dump "[aria-label^='Go to,']"`) after its open animation ends.
- Open from the palette. With the picker closed, run `"$V" ctl "$RUN" palette '"Go to session, tab or pane"'` and `"$V" ctl "$RUN" key enter`. The picker count is 1.
- All panes. Run `"$V" ctl "$RUN" key 'ctrl+;'`. The head's title (`tree '.sf-picker .pk-title'`) shows `a all panes i show idle esc cancel`. Then run `"$V" ctl "$RUN" type a`. `opts` lists `Sessions`, `1 Default`, `<tab>` with no number (the session shares 1 with its only tab), `2 <pane>` and `3 <pane>`, and `tree '.sf-picker .pk-btn.on'` is `All panes`. A click on that button (`click '.sf-picker .pk-btn:nth-child(1)'`) switches back.
- Row alignment. In all panes, `tree '.sf-picker .pk-label > span'` shows each row starting with its jump number at one x, then one 22 px mark slot (`sf-t-icon` or `sf-t-num`), and `tree '.sf-picker .pk-chev'` and `'.sf-picker .pk-lead'` show nothing drawn. Tab rows carry `├─` or `└─` and pane rows `│` or spaces before their branch, in `.sf-t-code` spans whose rects are 31 px tall, so the lines join across 24 px rows.
- Search miss. Run `"$V" ctl "$RUN" type zzq`. `opts` prints `[]`, and `tree '.sf-picker .pk-state'` holds `No panes match “zzq”` with a `Clear search` button.
- Clear the search. Run `"$V" ctl "$RUN" key escape`, or click `.sf-picker .pk-state button`. The rows come back and the picker stays open.
- Jump number. Note the focused id (`ctl state | jq .focused.id`), then run `"$V" ctl "$RUN" type 2`. The focus goes to the first pane, the picker count is 0, and the picker pane leaves `tern ls`.
- Waiting on you. Focus pane B with `"$V" tern "$RUN" focus B`, run `"$V" ctl "$RUN" alert bell '"verify bell"'`, focus pane A, press F1, then ctrl+; and `a`. `opts` starts with `Waiting on you1`, then `1 Default / <pane B>`, then `Sessions` and the tree numbered from 2. The bell row's `title` is `Alert` and its label holds the bell glyph span `sf-t-icon sf-t-error`.
- Waiting on you order. Make a split tab with panes P1 and P2 (`tab new`, Alt+N) and a tab with one pane P3 (`tab new`); name each pane with `"$V" type "$RUN" 'function fish_title; echo P1; end'`. Focus and ring a bell in P1, then P3, then P2, focus pane A, press F1, then ctrl+; and `a`. The group is `Default / P2`, `Default / P3`, `Default / P2 / P1`: last seen first by pane, not the tree order P2, P1, P3.
- Tab order. From the baseline, name pane A `BASE`. Then make these tabs with `tab new`, each named with `fish_title`: `BELL` (ring `alert bell`), `SPLIT` (Alt+N, name the new pane `RING` and ring a bell in it, then `"$V" tern "$RUN" focus <SPLIT id>`), `SLEEP` (type `sleep 300`) and `QUIET`. Press F1, then ctrl+; and `a`. The tab rows under `Default` are `SPLIT`, `BELL`, `SLEEP`, `QUIET`, `BASE`: the two alert tabs first, the newer one first, then the busy tab, then the quiet tabs last seen first. Type `s`: the tab rows are `SPLIT`, `SLEEP`, `BASE`.
- Enter. Run `"$V" ctl "$RUN" key up` until the cursor is on the bell row (`.pk-row.sel`), then `"$V" ctl "$RUN" key enter`. The focus goes to pane B and the picker closes.
- Close. Open the picker, then each of these closes it (count 0): `key escape` with no search, `"$V" tern "$RUN" focus A`, a click on the head of a tiled pane (`"$V" ctl "$RUN" click 'section.tn-pane.dim > header.tn-head'`, above the box), and a second `key f1`.
- Idle choice. Open the picker, press ctrl+; then `type i`. `RUN/data/config/plugin-data/goto/kv.json` holds `"waiting_idle": true`. A second ctrl+; `i` sets it to `false`.
- Close on reload. Open the picker and run `"$V" tern "$RUN" plugin reload`. The picker count is 0, and `tern ls` lists no `Go to` pane.
- Targeted reload. Open the picker, run `"$V" tern "$RUN" plugin reload html-links`, and wait for the reload. The picker stays open. `plugin reload goto` closes it and removes its pane.
- Two digits. Open more tabs and panes (Alt+N, `"$V" ctl "$RUN" tab new`, Alt+Shift+T) until all panes give more than nine numbers. In all panes, `opts` shows `01`, `02` and so on. `type 1` keeps the picker open, and `key escape` clears the digit and keeps the rows. Then read `opts`, pick a number that it shows with a first digit `1` (`10` is always there), and type its two digits one at a time. The focus goes to the pane of that row, and the picker closes. A number that `opts` does not show does nothing: the picker stays open with no digit waiting, so a following Esc closes it.
- Interface size. For each size of 18, 24 and 10: run `"$V" ctl "$RUN" ui-font-size 18`, open Tern's palette with `"$V" ctl "$RUN" palette '""'`, read `"$V" ctl "$RUN" dump '[id=pal] .tn-cmdk' | jq -c '.elements[0].rect'`, close it with `key escape`, press F1 and wait 0.5 s. The rect of `dump "[aria-label^='Go to,']"` has the x, y and width of the palette box, and `dump '.sf-picker .pk-bar'` is `visible: true` and ends inside the window (y + h at most 800). The row label (`dump '.sf-picker .pk-label'`) grows and shrinks with the size (17.3 px at 18, 9.6 px at 10). Close the picker after each size. Then run `ui-font-size 13`: the box is at `[320,96,640,511]` again.
- Palette veil. Open the file tree, then compare a palette shot with a Go to picker shot. Both dim the window through Tern's `--modal-dim`, including tab-bar text and the file tree. In a dark theme, the computed body shadow while goto is open uses 30% black. Read `$('body'):style('box-shadow')` in devtools. Tab-bar and file-tree pseudo-elements use the same dim; no brightness filter should remain. Close the picker and check that the extra dim disappears.
- Working time. These steps start omp in panes and send each a prompt: a real model request. Write `RUN/data/quiet.yml` with `completion:` and `error:`, each with `  notify: "off"`, so omp's own notices stay out. In pane B, run `"$V" type "$RUN" 'omp --config=<RUN>/data/quiet.yml '\''Write the numbers from 1 to 300 as English words, one per line. Do not use tools.'\'''` and at once `"$V" tern "$RUN" focus 5` (pane A). Poll `kv.json` until `.since` holds B's id with `"kind": "working"`. Press F1 a few seconds later: B's row ends with a time close to omp's own working timer, `dump '.sf-picker .pk-row[data-tone] .pk-fact'` gives the accent color, and the row's `title` is `Working`. Close the picker.
- Finished turns. Poll `kv.json` until `.finished` holds B's id with `"done"` and `.since` holds it with `"kind": "waiting"`. Run `"$V" ctl "$RUN" inbox clear`, because Tern's own inbox alert also shows as `done`. F1 then shows `1 Default / <tab> / omp` under `Waiting on you`, its `title` is `Done`, and both of B's rows end with the same time, which equals now minus `.since.<B>.at` within a second, in the warning color. `"$V" tern "$RUN" plugin reload` keeps it. Focus B, then A: `.finished` and `.since` are empty, and F1 shows no Waiting on you rows.
- Focused turn. Focus B, run `"$V" ctl "$RUN" type '"Reply with the word OK again."'` and `key enter`, and stay on B until `"$V" ctl "$RUN" state | jq .inbox.count` grows (Tern's alert at the end of the turn). `.finished` and `.since` stay empty. Focus A, run `inbox clear` and press F1: no Waiting on you rows.
- Failed turn. Write `RUN/data/fail.yml` as `quiet.yml` plus `retry:` `fallbackChains:` with `default: []`, `slow: []`, `vision: []` and `plan: []`. In a pane C (Alt+N), run `omp --config=<RUN>/data/fail.yml --provider anthropic --model claude-sonnet-4-5 --api-key=sk-ant-invalid-verify 'Reply with OK'` and focus A at once. `.finished` holds C's id with `"error"` within a few seconds. After `inbox clear`, F1 shows C under `Waiting on you` with the `title` `Error` and the `sf-t-icon sf-t-error` warning glyph. This request fails at the API and costs nothing.
- Exit. Focus C, run `"$V" ctl "$RUN" type '"/exit"'` and `key enter`, then focus A and run `inbox clear` (the shell's completed omp command can raise a new done alert). `.finished` and `.since` lose C, and F1 with all panes shows no Waiting on you row for C.
- Busy mark. In pane B after `/exit`, or a new shell pane, type `sleep 300` with `ctl type` and press Enter, then focus A, open F1 and switch to all panes. B's row has the `title` `Running a command`, no time, and a `sf-t-num sf-t-em` span whose `transform` in `ctl dump '.sf-picker .pk-label .sf-t-num.sf-t-em'` changes between two dumps 100 ms apart (screenshots freeze animations, so compare dumps). A working omp row has `sf-t-num sf-t-accent`.
- Proof. Run `"$V" shot "$RUN" goto-<step>` with the picker open. The shot shows the sheet with its rows and action bar over the dimmed window.

## Gotchas

- Without the ctrl+; prefix, a typed letter goes into the search. `a` and `i` alone search for those letters.
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
