# Reader terminal text

When omp runs in a Tern pane, Tern shows its chat in the Reader style. This plugin gives omp's prose and composer the terminal's font size, row height, and weight. Reader supplies the UI font from `settings.json`. The empty composer hides its placeholder text, the session title or "What are we cooking?", but keeps its height. Markdown horizontal rules use omp's theme colour.

## Sub-features

- `rtt-composer-size` gives the composer the terminal font size and row height.
- `rtt-composer-font` preserves Reader's `ui_font`-first font list and removes Reader's tight letter spacing.
- `rtt-placeholder` hides the placeholder of the empty composer and keeps the line. This rule applies to omp's composer in every chat style.
- `rtt-chat-text` gives user messages, assistant prose, annotated assistant headings, and ask questions the terminal size and row height. Body text uses the terminal weight; bold text and headings use `bolder`. Sized headings keep Reader's font size. Horizontal rules keep the theme colour on a one-row block.

## How to get to it (user POV)

- Run `omp` in a Tern pane. The rules apply as soon as the composer shows.
- Send a prompt to see a user message and an assistant reply. Request headings, bold text, and a horizontal rule to check their formatting.
- Open Settings and search for **Chat style** to choose Reader, Spine, or Console and the Markdown heading style.

## Driving it with tern-verify

Preconditions:

- The baseline from `README.md`. Read `ui_font`, `font_size`, `adjust_cell_height`, and `font_weight` from `RUN/data/config/settings.json`; do not assume their values.
- The terminal row: before omp starts, run `"$V" ctl "$RUN" dump '.tn-pane.on .tv-probe' | jq -c '.elements[0] | {rect, fontSize}'` in the shell pane. Its rect height is the row height `R` and its `fontSize` the terminal size `S` (13px when `font_size` is null).
- A helper for the composer: `ED=".sf-chat-reader .sf-col[data-role^='omp.editor']"`.

- Start omp. Run `"$V" type "$RUN" '/opt/homebrew/bin/omp --no-title'`, then poll `"$V" ctl "$RUN" tree "$ED" | jq .count` until it is 1. If the shell retained text at startup, press `key ctrl+c` before typing the command.
- Composer with the plugin. Run `"$V" ctl "$RUN" dump "$ED .sf-editor" | jq -c '.elements[0] | {rect, fontFamily, fontSize, fontWeight}'`. Its size is `S`, its height is `R`, and its weight matches `font_weight`. The font list starts with the copied `ui_font`. Dump `"$ED .sf-ed-ph"`; its `visible` value is `false`.
- Composer without the plugin. Drop both sheets in this window only: `"$V" ctl "$RUN" css plugin:local:reader-terminal-text:reader-terminal-text` and `"$V" ctl "$RUN" css plugin:local:reader-terminal-text:composer-placeholder`. Each prints `{"ok":true,"dropped":1}`. On Tern 0.9.7 the editor is `14px`, 22px high, and weight `400`. Its font list still starts with `ui_font`, followed by Reader's fallbacks and `"Berkeley Mono"`. The placeholder becomes visible.
- Restore with `"$V" tern "$RUN" plugin reload reader-terminal-text`. The dumps return to the plugin values. To check changed settings, run `"$V" ctl "$RUN" font 15` and `"$V" ctl "$RUN" adjust-cell-height 3`. Compare the composer height with a fresh `.tv-probe` dump. The 0.9.7 check gave 15px text and 21px rows for both. Restore the copied settings after this step.
- Chat text. Send `"$V" ctl "$RUN" type '"Reply with a Markdown h1, a paragraph with bold text and inline code, a horizontal rule, an h2, and a final short paragraph. Do not use code fences."'`, then `key enter`. Poll `tree ".sf-chat-reader [data-role^='omp.assistant'] > .sf-md"` until the answer appears. Dump that selector and `.sf-chat-reader .sf-card[data-role='omp.user'] .sf-md .md` before and after dropping the main sheet. With it, both use `S`, row height `R`, and the terminal weight. Without it, both use 14px and weight 400. Reader's assistant line height is 23.1px; the user line height is 21px.
- Bold and sized headings. Dump `.sf-chat-reader .sf-md .md strong` and `.sf-chat-reader .sf-md .md :is(h1,h2,h3,h4)`. At terminal weight 600, the plugin gives bold text and headings weight 900. Without it, the observed headings use 600. Automatic Reader headings keep 20px h1 and 17px h2 sizes with either sheet state.
- Annotated headings. Open `"$V" ctl "$RUN" prefs search '"chat style"'`. Verify `tree '.pf .pf-row:nth-child(5) .pf-seg > button:nth-child(2)'` names **Annotated**, then click that selector with the quoting from `../SKILL.md`. Close settings with `prefs close`. Confirm `.sf-chat-reader.sf-h-annotated` exists. Repeat the heading dumps with and without the main sheet. With it, headings use `S` and `R`; without it, the observed headings use 14px and 21px rows. Restore **Automatic** with the first button of the same group.
- Ask questions. Ask the model to call the real `ask` tool with a short question and two options. Wait for `.sf-chat-reader .sf-md[data-role='omp.ask.question']`. Dump it with and without the main sheet. The plugin gives it `S` and the terminal weight. On the 0.9.7 check, the native question instead used 15px and weight 550. Cancel or answer the question before cleanup.
- Horizontal rule. Dump `.sf-chat-reader .sf-md .md hr` and inspect its `background-image` in the developer console. Compare it with the same element's `--omp-mdHr`, using the console commands in `../SKILL.md`. It must use that colour, not `--l2`. The 0.9.7 dark Catppuccin check gave `linear-gradient(#7e8095, #7e8095)`. The old rule instead gave `linear-gradient(rgb(205 214 244 / 0.09), rgb(205 214 244 / 0.09))`.
- Placeholder in other chat styles. Search settings for **Chat style** again. The first `.pf .pf-seg` group contains Reader, Spine, and Console in that order. Select Spine, then Console, and dump each style's `.sf-ed-ph` before and after dropping only `composer-placeholder`. It changes from hidden to visible with identical geometry. Reload the plugin and restore Reader.
- Proof. Save each dump as `RUN/rtt-<step>.json` and take `"$V" shot "$RUN" rtt-<step>` before and after each sheet drop. Read the WebP shots. For `line-height`, `letter-spacing`, and `background-image`, keep the developer console's `.dc-row` output as well.

## Gotchas

- The prompt step sends a real request to the model that your omp configuration names, and it costs tokens. Ask the user before you run it. The composer steps send nothing.
- `omp` in the fish pane is `/opt/homebrew/bin/omp`, not the omp that Tern manages under `~/.config/tern/omp/bin`. Name the path in `notes.md`.
- Dropping a sheet with `ctl css NAME` changes this window only, until the next plugin reload. It does not prove that a rule matches when the file changes. To test an edit to `window.luau`, run `"$V" tern "$RUN" plugin reload` and dump again.
- The rules match Tern's class names and omp's `data-role` values (`.sf-chat-reader`, `omp.editor`, `omp.assistant`, `omp.user`). If `tree "$ED"` finds nothing while omp runs, a Tern or omp update renamed them. Report that, not a size bug.
- `stop` removes the omp session dir of `RUN/data`. omp in another dir leaves a session dir that `stop` does not know.
- Tern 0.9.7 already uses the UI font in Reader's composer. Expect the same first family with and without the plugin, not Geist first without it.
- The 0.9.7 engine accepts a stylesheet containing `font-weight: min(900, calc(var(--tv-weight) + 300))` without reporting a parse error, but does not apply the weight. A live weight-500 check gave 500 with that expression, 700 with `bolder`, and 800 with a numeric control. Keep the `bolder` comparison.
- Native warnings and notices are outside these four checks. Record any observed nodes and their computed values; do not add styles as part of verification.
