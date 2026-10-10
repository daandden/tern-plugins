# Zellij floats and panes

The zellij-keys plugin gives Tern the Zellij pane actions that it has no command for: floating shells and tools, floats that are shown or hidden together in a cascade, floating and docking a pane, breaking a pane out to a tab, and moving the focus among floats. A focus on a tiled pane hides the floats of its tab. A float change does not animate, and the `reduce_motion` preference of the user comes back after it.

## Sub-features

- `zk-new-pane` splits a tiled pane to the right, or opens a floating shell from a float (Alt+N).
- `zk-float-tool` opens yazi, lazygit or btop in a float (F2, F3, F4).
- `zk-cascade` draws each shown float at half the tab in width and in height. The first is centered, and each later one sits 16 px to the right and 32 px lower, in open order. After 8 places the cascade starts at the top again and keeps going right. No "Show all" chip shows.
- `zk-corners` spreads the floats of a tiled pane over the four corner stacks, so Tern draws 15 of them instead of 4, and 16 when there are more and the Go to picker is closed. Tern hides the oldest extra floats, never the focused one.
- `zk-toggle-floats` opens a floating shell when the tab has no float, hides the floats from a float, and shows them all from a tiled pane with focus on the last used float (Alt+F). The last used float survives `tern plugin reload`.
- `zk-hide-on-focus` hides the floats of a tab when focus goes to a tiled pane of that tab from a pane of the same tab. A switch to another tab or session and back hides nothing, also when a tiled pane had focus with the floats shown.
- `zk-close-float` sends focus to the last used float, else the float before the closed one, when the focused float closes. The last float sends focus to the tiled pane.
- `zk-picker` sends focus back to the float that opened the Go to picker on Esc. A jump from the picker to another tiled pane hides the floats.
- `zk-toggle-float` floats the focused tiled pane, or docks the focused float (Ctrl+G, P, E).
- `zk-break` moves the focused pane to a new tab (Ctrl+G, T, B), or to the tab on the left or right (Ctrl+G, T, `[` or `]`).
- `zk-focus` moves the focus among the floats from a float, else to the tiled pane on that side, else to the next tab (Alt+H, Alt+J, Alt+K, Alt+L, and the arrows).
- `zk-motion` sets `reduce_motion` to `on` while a float changes, and back to the value before after 400 ms.

## How to get to it (user POV)

- The keys above, from `settings.json`. `keybinds.html` lists them under the Zellij mode of each.
- The command palette, by the command title: `New pane (floating from a floating pane)`, `Float yazi`, `Float lazygit`, `Float btop`, `Toggle floating panes`, `Float or dock the focused pane`, `Break pane to new tab`, `Break pane to the tab on the left`, `Break pane to the tab on the right`, `Focus the pane on the left` (and right, above, below), `Focus the pane or tab on the left` (and right).

## Driving it with tern-verify

Preconditions:

- The baseline from `README.md`: one tiled pane, id 5, and `"reduce_motion": "off"` in `RUN/data/config/settings.json`.
- A layout line per pane: `L() { "$V" tern "$RUN" ls | grep -E '^ +[0-9]+'; }`. A float shows `pip <corner> over <id>`, a hidden float `stashed <side>`.

- Split. Run `"$V" ctl "$RUN" key alt+n`. `L` shows a second tiled pane, focused, and pane 5 at half its width.
- Floating shell. Run `"$V" ctl "$RUN" key alt+f` in a tab with no float. `L` shows a new pane with `pip br over <tiled id>  focused`.
- Motion restore. Read `settings.json` and `RUN/data/config/plugin-data/zellij-keys/kv.json` right after the key and again after 1.5 s. Right after: `"reduce_motion": "on"` and `"reduce_motion_before_float": "off"` in `kv.json`. After: `"reduce_motion": "off"` and no `reduce_motion_before_float` key. A hide on focus (`"$V" tern "$RUN" focus 5` from a float) gives the same result. `ctl focus` returns only after about 0.5 s, so poll after `tern focus` or a key instead.
- Cascade. With three floats (Alt+F, then Alt+N twice), run `"$V" ctl "$RUN" dump '.tn-stage > .pip' | jq -c '[.elements[] | {rect, transform}]'` and `"$V" ctl "$RUN" dump .tn-stage | jq -c '.elements[0].rect'`. For stage x, y, w, h, drawn float k (from 0, in open order) has the rect x + 0.25 w + 16 k, y + 0.25 h + 32 (k mod 8), 0.5 w, 0.5 h, and the transform `none`. `"$V" ctl "$RUN" state | jq -c '[.pips[] | .mode]'` gives `["glance","glance","focus"]`. `dump .tn-pip-chip` gives `visible: false`.
- Many floats. Press Alt+N until the tab has 17 floats. `dump '.tn-stage > .pip'` shows 16 elements with `visible: true`, and `"$V" tern "$RUN" ls` shows them as `pip br`, `pip bl`, `pip tr` and `pip tl`. Then run `"$V" tern "$RUN" focus <oldest id>`. The `.pip-focus` element is visible, and 16 floats are still drawn. With the Go to picker open, 15 floats and the picker are drawn.
- Hide floats. Run `"$V" ctl "$RUN" key alt+f` again from a float, or `"$V" ctl "$RUN" focus left` to a tiled pane. Every `.pips[].mode` is `hidden`, and `L` shows up to 3 floats as `stashed right` (the 4th and later sit in other corners and stash there). Alt+F from the tiled pane shows them all and focuses the last used float.
- Tab round trip. Hide the floats with `focus left`, show them with Tern's own key (`"$V" ctl "$RUN" key ctrl+alt+cmd+p`) so the tiled pane keeps focus, then run `"$V" ctl "$RUN" tab new` and `tab 1`. Every `.pips[].mode` is still `glance`.
- Close a float. With three floats shown, run `"$V" ctl "$RUN" close`. The float before the closed one has focus, and the others stay `glance`. After the last close, the tiled pane has focus.
- Picker. From a shown float, run `"$V" ctl "$RUN" plugins run plugin.goto.open`, then `key escape`. The float that opened it has focus, and the floats stay shown. In a split tab, a jump from the picker to the tiled pane that is not under the floats hides them.
- Floating shell from a float. Focus a float, then run `"$V" ctl "$RUN" key alt+n`. `L` shows one more float over the same tiled pane.
- Tool float. Run `"$V" ctl "$RUN" key f2`. `L` shows `Yazi: <dir>` as a focused float. F3 and F4 need `/opt/homebrew/bin/lazygit` and `/opt/homebrew/bin/btop`.
- Float and dock. With two tiled panes, focus one and press `"$V" ctl "$RUN" key ctrl+g`, then `key p`, then `key e`. `L` shows that pane as `pip bl over <other>`. The same keys again dock it, and it is tiled again.
- Break to a new tab. Press `key ctrl+g`, `key t`, `key b`. `"$V" ctl "$RUN" state | jq -c '[.tabs[] | {panes, active}]'` shows one more tab, active, with the pane.
- Break to the left. In the new tab, press `key ctrl+g`, `key t`, `key '['`. The tab list loses that tab, and the tab on the left has one more pane.
- Palette. Run `"$V" ctl "$RUN" palette '"Break pane to new tab"'` and `"$V" ctl "$RUN" key enter`. The tab list changes as with the keys.
- Proof. Run `"$V" shot "$RUN" zk-<step>` after each layout change. The cascade shot shows the floats as half-tab boxes, each one a little lower and to the right of the one before it, with the focused one on top.

## Gotchas

- Ctrl+G, P, E does not float the only tiled pane of a tab. Split first.
- A chord is three `key` calls. `key 'ctrl+g>p>e'` is not a key.
- The settings file changes back about 400 ms after the key, and Tern writes it a moment later. Read it 1.5 s after the key, not at 400 ms.
- `.tabs[].panes` in `ctl state` counts tiled panes only. Count floats from the `pip` lines of `L`.
- A float that the mouse focuses still animates. The motion check covers key and palette paths only.
- `ctl state` gives `glance` for a shown float without focus. `glance` is not a corner preview here: the `dump` box tells. A hidden float is `hidden`.
- goto closes the picker before it focuses a jump target, and Tern first moves focus to the tiled pane under the picker. So a jump to that tiled pane, or to the tab row of a one-pane tab, acts like Esc and goes back to the float.
- `.pips[].deck` in `ctl state` is `whole`, `peek1` to `peek3` or `hidden`, and `hidden` means that Tern does not draw the float. `"$V" ctl "$RUN" pip fan '"#1"'` fans the stack of the oldest float as if the pointer were over it, and Tern then draws every float of that stack. Count drawn floats before any `pip fan`, because the fan stays until a fan of another stack.
