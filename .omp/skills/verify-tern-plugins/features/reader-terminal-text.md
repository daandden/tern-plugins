# Reader terminal text

When omp runs in a Tern pane, Tern shows its chat in the Reader style. With this plugin, omp's prose and composer use the terminal's font size and row height instead of Reader's own (14 px, 22 px rows), and the composer uses the UI font of `settings.json`. The empty composer hides its placeholder text (the session title, or "What are we cooking?") but keeps its height.

## Sub-features

- `rtt-composer-size` gives the composer the terminal font size and row height.
- `rtt-composer-font` puts `ui_font` first in the composer font list, before Geist.
- `rtt-placeholder` hides the placeholder of the empty composer and keeps the line.
- `rtt-chat-text` gives user messages, assistant prose, assistant headings and ask questions the terminal size and row height.

## How to get to it (user POV)

- Run `omp` in a Tern pane. The rules apply as soon as the composer shows.
- Send a prompt to see a user message and an assistant reply.

## Driving it with tern-verify

Preconditions:

- The baseline from `README.md`. The copied `settings.json` sets `ui_font` and `adjust_cell_height`, and the composer values follow them.
- A helper for the composer: `ED=".sf-chat-reader .sf-col[data-role^='omp.editor']"`.

- Start omp. Run `"$V" type "$RUN" 'omp'`, then poll `"$V" ctl "$RUN" tree "$ED" | jq .count` until it is 1 (one second on this Mac).
- Composer with the plugin. Run `"$V" ctl "$RUN" dump "$ED .sf-editor" | jq -c '.elements[0] | {rect, fontFamily, fontSize}'` and `"$V" ctl "$RUN" dump "$ED .sf-ed-ph" | jq -c '.elements[0].visible'`. With the copied settings: `fontSize` `13px`, a rect height of 17, a `fontFamily` that starts with `"JetBrainsMono Nerd Font Mono"`, and a placeholder that is `false`.
- Composer without the plugin. Drop both sheets in this window only: `"$V" ctl "$RUN" css plugin:local:reader-terminal-text:reader-terminal-text` and `"$V" ctl "$RUN" css plugin:local:reader-terminal-text:composer-placeholder`. Each prints `{"ok":true,"dropped":1}`. The same dumps now give `14px`, height 22, a font list that starts with `Geist, "Berkeley Mono"`, and a placeholder that is `true`.
- Restore. Run `"$V" tern "$RUN" plugin reload`. The dumps give the values with the plugin again, and `"$V" ctl "$RUN" css` lists both sheets.
- Chat text. Send a short prompt with `"$V" ctl "$RUN" type '"say ok"'` and `"$V" ctl "$RUN" key enter`, wait for `tree ".sf-chat-reader [data-role^='omp.assistant']"`, and dump `.sf-chat-reader [data-role^='omp.assistant'] > .sf-md` and `.sf-chat-reader .sf-card[data-role='omp.user'] .sf-md .md` with and without the sheet, as above.
- Proof. Run `"$V" shot "$RUN" rtt-with` and `"$V" shot "$RUN" rtt-without` around the drop, and keep each `dump` output in `RUN/rtt-<step>.json`.

## Gotchas

- The prompt step sends a real request to the model that your omp configuration names, and it costs tokens. Ask the user before you run it. The composer steps send nothing.
- `omp` in the fish pane is `/opt/homebrew/bin/omp`, not the omp that Tern manages under `~/.config/tern/omp/bin`. Name the path in `notes.md`.
- Dropping a sheet with `ctl css NAME` changes this window only, until the next plugin reload. It does not prove that a rule matches when the file changes. To test an edit to `window.luau`, run `"$V" tern "$RUN" plugin reload` and dump again.
- The rules match Tern's class names and omp's `data-role` values (`.sf-chat-reader`, `omp.editor`, `omp.assistant`, `omp.user`). If `tree "$ED"` finds nothing while omp runs, a Tern or omp update renamed them. Report that, not a size bug.
- `stop` removes the omp session dir of `RUN/data`. omp in another dir leaves a session dir that `stop` does not know.
