# Native files

Text, code, and HTML files open in Tern's native code view. HTML shows source, and Markdown keeps Tern's rendered view. Native code rows follow the terminal's line-height setting in Tern 0.9.8.

## Sub-features

- `file-native` opens text, code, and HTML source in a native file pane, without launching an editor process.
- `file-line` opens `FILE:LINE:COL` at the requested position.
- `file-bin-open` opens local files through `bin/open` and exits successfully.
- `file-links` leaves clicked `file://` text links to Tern.
- `file-row-height` changes native code row spacing with `adjust_cell_height`.

## How to get to it (user POV)

- Run `tern open notes.txt` or `tern open notes.txt:3:5` in a Tern pane.
- Run `open notes.txt` in a fish pane, where `open` is this repo's `bin/open`.
- Open a text or HTML file from the Files pane or the file-open palette.
- Cmd+click a `file://` link in a terminal pane.
- Change the line-height setting.

## Driving it with tern-verify

Preconditions:

- The baseline from `README.md`, with focus on the shell pane.
- `RUN/data/notes.txt` has at least three lines and five characters on line 3. `RUN/data/second.txt`, `RUN/data/readme.md`, and `RUN/data/page.html` have different first lines.

- Native open. Run `"$V" type "$RUN" 'tern open notes.txt:3:5; echo EXIT=$status'`. Wait for the focused pane's `.ed` and capture the file pane, line/column status, `tern ls`, and shell output. The native editor shows the file at line 3, column 5, the shell reports `EXIT=0`, and no Neovim command starts.
- bin/open. Focus the shell, wait until `ctl state` reports its id, then run `"$V" type "$RUN" '<checkout>/bin/open second.txt; echo EXIT=$status'`. A native file pane shows `second.txt`, and the shell reports `EXIT=0`.
- Files pane. Focus the shell, press `key ctrl+cmd+e`, run `files focus`, `files cursor notes.txt`, then `key enter`. Observe the native editor for `notes.txt`.
- Clicked file link. Run `"$V" lens "$RUN"`, focus the shell, and echo `PROBE_LINK file://<RUN>/data/second.txt`. Cmd-click its `.sf-link` by selector using the quoting rules in `../SKILL.md`. Tern opens the native text view.
- Markdown and HTML. Open `readme.md` and confirm Tern's rendered Markdown. From the shell, run `"$V" type "$RUN" 'tern open page.html; echo EXIT=$status'`. The native `.ed` shows HTML source, and the shell reports `EXIT=0`. Repeat with `<checkout>/bin/open page.html`, then open `page.html` through Files. All three paths show source, not a browser page. Open the file from the file-open palette too.
- Row height. With native text open, run `"$V" ctl "$RUN" adjust-cell-height 0`, then `12`, then `40%`. At each value, capture the terminal `.tv-probe`, native `.ed-probe`, computed line-height, and a full-window shot. The painted code rows must change spacing, not just their computed styles. The 0.9.8 check at 13px text measured native rows of 17px, 29px, and 23px respectively. Restore the copied setting after the check.
- Reload. Run `"$V" tern "$RUN" plugin reload`, then `plugin list`. All plugins must be ready. Open another text file and an HTML file to prove that native file routing still works.
- Proof. Save before/after pane listings, shell exit codes, editor trees, and lossless WebP shots.

## Gotchas

- Native file opens, including HTML, return `EXIT=0` through both `tern open` and `bin/open`.
- CLI focus reaches the UI asynchronously. Wait until `ctl state` reports the shell id before typing. If Files retains keyboard focus, click the shell's `.tv-grid`.
- Native code row heights can round differently from terminal probes. Compare their response to the setting and inspect painted rows rather than requiring identical fractional heights.
- Native code text does not currently inherit the terminal's font weight.
- A raw terminal path needs pointer detection before it exposes a link. The link lens proves clicked-link routing, not plain-path detection.
