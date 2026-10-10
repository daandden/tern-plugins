# Zellij floats and panes

The zellij-keys plugin gives Tern the Zellij pane actions that it has no command for: floating shells and tools, a float that fills the middle 75% of the tab while it has focus, hiding and showing the floats of a tab, floating and docking a pane, breaking a pane out to a tab, and moving the focus among floats. A float change does not animate, and the `reduce_motion` preference of the user comes back after it.

## Sub-features

- `zk-new-pane` splits a tiled pane to the right, or opens a floating shell from a float (Alt+N).
- `zk-float-tool` opens yazi, lazygit or btop in a float (F2, F3, F4).
- `zk-float-size` puts the focused float in the middle 75% of the tab.
- `zk-toggle-floats` opens a floating shell when the tab has no float, hides the floats from a float, and shows them again from a tiled pane (Alt+F).
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
- Motion restore. Read `settings.json` and `RUN/data/config/plugin-data/zellij-keys/kv.json` right after the key and again after 1.5 s. Right after: `"reduce_motion": "on"` and `{"reduce_motion_before_float": "off"}`. After: `"reduce_motion": "off"` and `{}`.
- Float size. Run `"$V" ctl "$RUN" tree ".tn-pane.pip.pip-focus" | jq -c '.nodes[0].rect'` and `"$V" ctl "$RUN" dump .tn-stage | jq -c '.elements[0].rect'`. The float rect is the stage rect with 12.5% off each side: x + 0.125 w, y + 0.125 h, 0.75 w, 0.75 h.
- Hide floats. Run `"$V" ctl "$RUN" key alt+f` again from the float. `L` shows the float as `stashed right`, and `tree .tn-pane.pip.pip-focus` finds nothing.
- Floating shell from a float. Focus a float, then run `"$V" ctl "$RUN" key alt+n`. `L` shows one more float over the same tiled pane.
- Tool float. Run `"$V" ctl "$RUN" key f2`. `L` shows `Yazi: <dir>` as a focused float. F3 and F4 need `/opt/homebrew/bin/lazygit` and `/opt/homebrew/bin/btop`.
- Float and dock. With two tiled panes, focus one and press `"$V" ctl "$RUN" key ctrl+g`, then `key p`, then `key e`. `L` shows that pane as `pip bl over <other>`. The same keys again dock it, and it is tiled again.
- Break to a new tab. Press `key ctrl+g`, `key t`, `key b`. `"$V" ctl "$RUN" state | jq -c '[.tabs[] | {panes, active}]'` shows one more tab, active, with the pane.
- Break to the left. In the new tab, press `key ctrl+g`, `key t`, `key '['`. The tab list loses that tab, and the tab on the left has one more pane.
- Palette. Run `"$V" ctl "$RUN" palette '"Break pane to new tab"'` and `"$V" ctl "$RUN" key enter`. The tab list changes as with the keys.
- Proof. Run `"$V" shot "$RUN" zk-<step>` after each layout change. The float shot shows the float in the middle of the tab with the tiled panes dimmed around it.

## Gotchas

- Ctrl+G, P, E does not float the only tiled pane of a tab. Split first.
- A chord is three `key` calls. `key 'ctrl+g>p>e'` is not a key.
- The settings file changes back about 400 ms after the key, and Tern writes it a moment later. Read it 1.5 s after the key, not at 400 ms.
- `.tabs[].panes` in `ctl state` counts tiled panes only. Count floats from the `pip` lines of `L`.
- A float that the mouse focuses still animates. The motion check covers key and palette paths only.
