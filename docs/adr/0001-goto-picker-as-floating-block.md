# The Go to picker is a floating plugin block

Herdr and Orca draw their go to pickers as overlays over the window, but Tern has no overlay API for plugins. So the goto plugin shows its picker as a plugin block that floats over the current tab and closes after a jump or on Esc. A CSS sheet draws that float like Tern's command palette: the palette's position and width, no pane header, and a veil over the tab. A float moves nothing in the tab layout. The command palette has no groups, no agent state and no jump numbers.

## Considered options

- One Tern palette command for each destination. It uses Tern's fuzzy search, but destinations mix with all other commands, and the plugin must rebuild them each time a tab opens or closes.
- A split pane beside the focused pane. It changes the layout of the current tab while the picker is open.

If Tern adds an overlay API for plugins, this decision is open again.
