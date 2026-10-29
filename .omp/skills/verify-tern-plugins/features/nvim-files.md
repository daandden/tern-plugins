# Neovim files

A local text or code file opens in Neovim (`/opt/homebrew/bin/nvim`) in a terminal pane beside the pane that opened it, not in Tern's code view. A second file in the same tab opens in that Neovim pane. Markdown, notebooks, images, PDFs, databases, binary files, files over 4 MiB and HTML files stay with Tern or html-links. Tern resolves a symlink before it asks the plugin, so a symlink to a text file opens its target in Neovim.

## Sub-features

- `nvim-new-pane` opens the first text file of a tab in a new Neovim pane, split to the right of the opener (below it with `tern open --split down`).
- `nvim-reuse` opens the next text file of the tab in the same Neovim pane.
- `nvim-tab` opens the file in a new tab with a new Neovim pane for `tern open --tab FILE`.
- `nvim-line` puts the caret on the line and column of `FILE:LINE` or `FILE:LINE:COL`, in a new pane and in a reused one.
- `nvim-float-opener` splits the tiled pane under a float opener.
- `nvim-skip` leaves Markdown, notebooks, images, PDFs, databases, binary files, files over 4 MiB and the other kinds above to Tern, and HTML to html-links.
- `nvim-symlink` opens the target of a symlink to a text file in Neovim, from `tern open`, `bin/open` and the Files pane.
- `nvim-file-link` opens a clicked `file://` link to a text file in Neovim, and a `file://` link to another kind in Tern's file block.
- `nvim-remember` keeps the Neovim pane ids in the plugin store, so a plugin reload does not forget them.

## How to get to it (user POV)

- Run `tern open notes.txt`, `tern open notes.txt:3`, `tern open notes.txt:3:5` or `tern open --tab notes.txt` in a Tern pane.
- Run `open notes.txt` in a fish pane (`~/.local/bin/open` is `bin/open`).
- Open the file from the Files pane or the palette.
- Cmd+click a `file://` link or a plain path in a terminal pane.

## Driving it with tern-verify

Preconditions:

- The baseline from `README.md`, with focus on pane 5.
- `RUN/data/notes.txt`, `RUN/data/second.txt` and `RUN/data/readme.md` exist, each with a different first line. `RUN/data/link.txt` is a symlink to `notes.txt` (`ln -s notes.txt "$RUN/data/link.txt"`).

- In Tern 0.9.7 (`c2f7563`), retain this plugin. With it unlinked in an isolated instance, `adjust-cell-height 0`, `12`, and `40%` changed terminal line height to 16, 28, and 22 px. The native code editor kept a 13 px line height. Closing SDK issue #20 did not remove the limitation.

- First file. Run `"$V" type "$RUN" 'tern open notes.txt; echo EXIT=$status'`. `"$V" tern "$RUN" ls` lists a new pane with the command `PATH=/opt/homebrew/bin:"$PATH" exec /opt/homebrew/bin/nvim -- <RUN>/data/notes.txt`, focused. `"$V" tern "$RUN" capture ID` of that pane shows the first line of `notes.txt` and `notes.txt` in the Neovim status line.
- Pane store. Read `RUN/data/config/plugin-data/nvim-files/kv.json`. It holds `{"panes": [ID]}`.
- Second file. Focus pane 5 and run `"$V" type "$RUN" 'tern open second.txt; echo EXIT=$status'`. `tern ls` lists no new pane. `capture ID` of the Neovim pane shows the first line of `second.txt` and its path in the status line.
- Line. Focus pane 5 with `"$V" tern "$RUN" focus 5` and run `"$V" type "$RUN" 'tern open notes.txt:3'` with a file of three lines or more. The status line of Neovim ends with `3:1`. `tern open notes.txt:2:4` gives `2:4`.
- bin/open. Focus pane 5 and run `"$V" type "$RUN" '<checkout>/bin/open second.txt; echo EXIT=$status'`. `capture 5` shows `EXIT=0`. `tern ls` lists no new pane and no file block, and `capture ID` of the Neovim pane shows `second.txt` in its status line.
- Files pane. Focus pane 5, press `key ctrl+cmd+e`, then run `"$V" ctl "$RUN" files focus`, `"$V" ctl "$RUN" files cursor notes.txt` and `"$V" ctl "$RUN" key enter`. The file opens in the Neovim pane of the tab, or in a new one when the tab has none. Pick a file that the Neovim pane does not show yet, so the change is visible.
- Palette. Focus the shell, run `"$V" ctl "$RUN" palette '"Open file"'`, then `key enter`. This opens the palette's Files scope, not a native file dialog. Run `"$V" ctl "$RUN" type second.txt` and `key enter`. The existing Neovim pane shows `second.txt`.
- Skip. Focus pane 5 and run `"$V" type "$RUN" 'tern open readme.md; echo EXIT=$status'`. `tern ls` lists no Neovim pane for it, `capture 5` shows `EXIT=0`, and Tern shows the Markdown in its own block. Each of `skip.ipynb`, `skip.png`, `skip.pdf`, `skip.db` (SQLite), `skip.bin` (bytes with a NUL) and a text file of 4 MiB + 1 byte opens in a Tern block too, and the Neovim pane keeps its file.
- Symlink. Focus pane 5 and run `"$V" type "$RUN" 'tern open link.txt; echo EXIT=$status'`. The Neovim pane of the tab shows `notes.txt` (the target), not `link.txt`, and `capture 5` shows `EXIT=1`. `<checkout>/bin/open link.txt` opens the same target and exits 0. The Files pane (`files cursor link.txt`, `key enter`) gives the same target too; open `second.txt` in between, so each change shows.
- Clicked file link. Run `"$V" lens "$RUN"`, focus pane 5, run `"$V" type "$RUN" 'echo PROBE_LINK file://<RUN>/data/second.txt'` and Cmd-click the link (see `html-links.md`). The Neovim pane of the tab shows `second.txt`. A `file://` link to `readme.md` opens a Tern block, not Neovim.
- Reload. Run `"$V" tern "$RUN" plugin reload`, focus pane 5 and open a text file again. It goes into the same Neovim pane.
- New tab. Focus pane 5 and run `"$V" type "$RUN" 'tern open --tab second.txt'`. `ctl state` shows one more tab, active, with a new Neovim pane, and `kv.json` lists both pane ids.
- Float opener. In a tab with no Neovim pane, press `key alt+f` for a floating shell and run `"$V" type "$RUN" 'tern open second.txt'`. `"$V" tern "$RUN" ls` lists the new Neovim pane as tiled, right after the tiled pane under the float, not as `pip … over`.
- Nonfocused tab. In a shell, type `sleep 3; <checkout>/bin/open second.txt; echo EXIT=$status`, press Enter, then focus a pane in another tab before the delay ends. The Neovim pane opens or is reused in the opener's tab, and the shell reports `EXIT=0`.
- Proof. Run `"$V" shot "$RUN" nvim-<step>` and keep the `capture` output of the Neovim pane in `RUN/nvim-<step>.txt`.

## Gotchas

- `tern open` exits 1 with `cannot open in a file block` when the plugin opened the file. That is the expected result for a text file.
- Each file open moves the focus to the Neovim pane, and `"$V" type` types into the focused pane. Run `"$V" tern "$RUN" focus 5` before each typed step, or the command goes into Vim.
- CLI pane focus reaches the UI asynchronously. After `tern focus ID`, wait until `ctl state` reports that focused id. If the Files pane owns keyboard focus, click `.tn-pane.on:not(.off) .tv-grid` before typing. Wait for the shell's completion marker before the next command; an immediate capture can still show the previous file.
- Neovim loads your own `~/.config/nvim`. A plugin error there shows in the pane and is not a fault of nvim-files.
- The Neovim pane closes when Neovim quits, and the next file then opens in a new pane.
- The Files pane follows the focused pane. Focus a shell pane in `RUN/data` before `files cursor`.
- A raw path in terminal output is a link only after Tern finds it under the pointer, which needs coordinates. The link lens covers the route of a clicked `file://` link, not the detection of the text.
- On 0.9.7, an echoed plain path exposed no `.sf-link`, `.tv-link`, or accessibility Link node before pointer detection. Record this detection path as unverified when coordinate input is unavailable. Do not count a link-lens click as plain-path proof.
