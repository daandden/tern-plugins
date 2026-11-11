-- Tern dims every unfocused pane: `.tn-pane.dim` shows a veil over the pane body (`.tn-veil`) and
-- its head (`.tn-head::after`), both painted with `--tn-veil`, which `.tn-stage` defines. This
-- sheet makes that colour transparent, so unfocused panes look like the focused one, as in Zellij.
-- `:root` makes the rule outrank Tern's own. These are Tern's internal classes, not an API.
tern.css("no-pane-dim", [[
:root .tn-stage {
	--tn-veil: transparent;
}
]])
