# Neovim files

A local text or code file opens in Neovim (`/opt/homebrew/bin/nvim`) in a terminal pane beside the pane that opened it, not in Tern's code view. A second file in the same tab opens in that Neovim pane. Markdown, notebooks, images, PDFs, databases, binary files, symlinks, files over 4 MiB and HTML files stay with Tern or html-links.

## Sub-features

- `nvim-new-pane` opens the first text file of a tab in a new Neovim pane, split to the right of the opener.
- `nvim-reuse` opens the next text file of the tab in the same Neovim pane.
- `nvim-line` puts the caret on the line of `FILE:LINE`.
- `nvim-float-opener` splits the tiled pane under a float opener.
- `nvim-skip` leaves Markdown, images, binary files and the other kinds above to Tern, and HTML to html-links.
- `nvim-remember` keeps the Neovim pane ids in the plugin store, so a plugin reload does not forget them.

## How to get to it (user POV)

- Run `tern open notes.txt` or `tern open notes.txt:3` in a Tern pane.
- Run `open notes.txt` in a fish pane (`~/.local/bin/open` is `bin/open`).
- Open the file from the Files pane or the palette.
- Cmd+click a `file://` link or a plain path in a terminal pane.

## Driving it with tern-verify

Preconditions:

- The baseline from `README.md`, with focus on pane 5.
- `RUN/data/notes.txt`, `RUN/data/second.txt` and `RUN/data/readme.md` exist, each with a different first line.

- First file. Run `"$V" type "$RUN" 'tern open notes.txt; echo EXIT=$status'`. `"$V" tern "$RUN" ls` lists a new pane with the command `PATH=/opt/homebrew/bin:"$PATH" exec /opt/homebrew/bin/nvim -- <RUN>/data/notes.txt`, focused. `"$V" tern "$RUN" capture ID` of that pane shows the first line of `notes.txt` and `notes.txt` in the Neovim status line.
- Pane store. Read `RUN/data/config/plugin-data/nvim-files/kv.json`. It holds `{"panes": [ID]}`.
- Second file. Focus pane 5 and run `"$V" type "$RUN" 'tern open second.txt; echo EXIT=$status'`. `tern ls` lists no new pane. `capture ID` of the Neovim pane shows the first line of `second.txt` and its path in the status line.
- Line. Focus pane 5 with `"$V" tern "$RUN" focus 5` and run `"$V" type "$RUN" 'tern open notes.txt:3'` with a file of three lines or more. The status line of Neovim ends with `3:1`.
- bin/open. Focus pane 5 and run `"$V" type "$RUN" '<checkout>/bin/open notes.txt; echo EXIT=$status'`. `capture 5` shows `EXIT=0`, and `~/.cache/tern/open-owners` holds no file of this run.
- Files pane. Focus pane 5, press `key ctrl+cmd+e`, then run `"$V" ctl "$RUN" files focus`, `"$V" ctl "$RUN" files cursor notes.txt` and `"$V" ctl "$RUN" key enter`. The file opens in the Neovim pane of the tab, or in a new one when the tab has none.
- Skip. Focus pane 5 and run `"$V" type "$RUN" 'tern open readme.md; echo EXIT=$status'`. `tern ls` lists no Neovim pane for it, `capture 5` shows `EXIT=0`, and Tern shows the Markdown in its own block.
- Proof. Run `"$V" shot "$RUN" nvim-<step>` and keep the `capture` output of the Neovim pane in `RUN/nvim-<step>.txt`.

## Gotchas

- `tern open` exits 1 with `cannot open in a file block` when the plugin opened the file. That is the expected result for a text file.
- Each file open moves the focus to the Neovim pane, and `"$V" type` types into the focused pane. Run `"$V" tern "$RUN" focus 5` before each typed step, or the command goes into Vim.
- Neovim loads your own `~/.config/nvim`. A plugin error there shows in the pane and is not a fault of nvim-files.
- The Neovim pane closes when Neovim quits, and the next file then opens in a new pane.
- The Files pane follows the focused pane. Focus a shell pane in `RUN/data` before `files cursor`.
- A clicked link has no stable handle in `tern ctl`. Report it as skipped unless you drive it by hand.
