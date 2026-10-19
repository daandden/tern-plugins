# Go to picker

The Go to picker is a box in the middle of the window, in the place of the command palette. It lists the sessions, tabs and panes of the window as a tree with jump numbers, and moves the focus to the row that you pick. It opens with agent panes only. Panes that wait for you (needs input, error, alert, done, idle) show again above a thin line, as Waiting on you rows.

## Sub-features

- `goto-open` opens the picker over the window. A second f1 closes it.
- `goto-all` switches between agent panes only and all panes with the ctrl+; prefix, then `a`.
- `goto-search` filters the tree rows by typed letters, shows `Nothing matches the search.` with no match, and Esc clears the search.
- `goto-shared-number` gives a session that shows only one tab the same jump number as that tab. The tab row shows no number, and Up and Down skip it.
- `goto-jump` moves the focus to the row of a typed jump number and closes the picker. With more than nine numbers, each number has two digits (`01`), the first digit waits, and Esc clears it.
- `goto-enter` moves the focus to the cursor row with Up, Down and Enter.
- `goto-waiting` shows a pane that waits for you above the line, named `session / tab / pane`, without the tab when its name is the pane's name. It leaves out the pane that you opened the picker from.
- `goto-idle` shows or hides idle agents in the Waiting on you rows with ctrl+; then `i`, and keeps the choice.
- `goto-close` closes the picker on Esc with no search, on a second F1, when the focus goes to another pane, and on `tern plugin reload`.

## How to get to it (user POV)

- Press F1.
- Choose `Go to session, tab or pane` in the command palette.

## Driving it with tern-verify

Preconditions:

- The baseline from `README.md`.
- Two tiled panes: press `"$V" ctl "$RUN" key alt+n` once.
- Read the rows as accessible names: `opts() { "$V" ctl "$RUN" a11y | jq -c '[.. | objects | select(.role=="ListBoxOption") | .name]'; }`. The picker is open when `"$V" ctl "$RUN" tree "[aria-label^='Go to']" | jq .count` prints 1.

- Open with F1. Run `"$V" ctl "$RUN" key f1`, then poll the picker count until it is 1. `opts` prints `["1 Default"]` when no pane runs an agent. The box is at `[320,96,640,511]` after its open animation ends.
- Open from the palette. With the picker closed, run `"$V" ctl "$RUN" palette '"Go to session, tab or pane"'` and `"$V" ctl "$RUN" key enter`. The picker count is 1.
- All panes. Run `"$V" ctl "$RUN" key 'ctrl+;'`. The footer (`tree .ck-foot`) shows `a all i show idle esc cancel`. Then run `"$V" ctl "$RUN" type a`. `opts` lists `1 Default`, `└─ <tab>` with no number (the session shares 1 with its only tab), `2 ├─ <pane>` and `3 └─ <pane>`. The footer is `↑↓ move ↵ go ⌃; actions` again.
- Search miss. Run `"$V" ctl "$RUN" type zzq`. `opts` prints `[]`, `tree "[role=listbox]"` holds `Nothing matches the search.`, and the footer starts with `zzq`.
- Clear the search. Run `"$V" ctl "$RUN" key escape`. The rows come back and the picker stays open.
- Jump number. Note the focused id (`ctl state | jq .focused.id`), then run `"$V" ctl "$RUN" type 2`. The focus goes to the first pane, the picker count is 0, and the picker pane leaves `tern ls`.
- Waiting on you. Focus pane B with `"$V" tern "$RUN" focus B`, run `"$V" ctl "$RUN" alert bell '"verify bell"'`, focus pane A, press F1, then ctrl+; and `a`. The first row is `1 Default / <pane B>` with a bell mark, then `null` for the line, then the tree numbered from 2. `tree "[data-role='goto.sep']"` finds the line.
- Waiting on you order. Make a split tab with panes P1 and P2 (`tab new`, Alt+N) and a tab with one pane P3 (`tab new`); name each pane with `"$V" type "$RUN" 'function fish_title; echo P1; end'`. Focus and ring a bell in P1, then P3, then P2, focus pane A, press F1, then ctrl+; and `a`. The group is `Default / P2`, `Default / P3`, `Default / P2 / P1`: last seen first by pane, not the tree order P2, P1, P3.
- Enter. Run `"$V" ctl "$RUN" key up` until the cursor is on the bell row, then `"$V" ctl "$RUN" key enter`. The focus goes to pane B and the picker closes.
- Close. Open the picker, then each of these closes it (count 0): `key escape` with no search, `"$V" tern "$RUN" focus A`, and a second `key f1`.
- Idle choice. Open the picker, press ctrl+; then `type i`. `RUN/data/config/plugin-data/goto/kv.json` changes to `{"waiting_idle": true}`. A second ctrl+; `i` sets it to `false`.
- Close on reload. Open the picker and run `"$V" tern "$RUN" plugin reload`. The picker count is 0, and `tern ls` lists no `Go to` pane.
- Two digits. Open more tabs and panes (Alt+N, `"$V" ctl "$RUN" tab new`, Alt+Shift+T) until all panes give more than nine numbers. In all panes, `opts` shows `01`, `02` and so on. `type 1` keeps the picker open, and `key escape` clears the digit and keeps the rows. Then read `opts`, pick a number that it shows with a first digit `1` (`10` is always there), and type its two digits one at a time. The focus goes to the pane of that row, and the picker closes. A number that `opts` does not show does nothing: the picker stays open with no digit waiting, so a following Esc closes it.
- Proof. Run `"$V" shot "$RUN" goto-<step>` with the picker open. The shot shows the box with its rows and footer over the dimmed window.

## Gotchas

- Without the ctrl+; prefix, a typed letter goes into the search. `a` and `i` alone search for those letters.
- `tree` text of the list also holds `Nothing matches the search.` while rows show, because the empty text is in the list but hidden. Read rows with `opts`, not with `tree` text.
- In the agents-only view, a plain shell pane never shows, also as a Waiting on you row. Switch to all panes to see it.
- The rect of the box is a little off for about 200 ms while the box opens. Wait before you measure it.
- Jump numbers follow the visible rows, so the number of a pane changes with the view and the search. Read `opts` right before you type a number.
- A typed digit is always a jump number, also in search.
