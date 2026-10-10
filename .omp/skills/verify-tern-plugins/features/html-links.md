# HTML pages

A local HTML file opens as the rendered page in a browser pane, split to the right of the pane that opened it, never as source in an editor. When the opener is a float, the page goes beside the tiled pane under the float. Cmd+R reloads the page after the file changes.

## Sub-features

- `html-tern-open` opens the page beside the pane that ran `tern open FILE.html`.
- `html-bin-open` opens the page beside the pane that ran `bin/open FILE.html`, and `bin/open` exits 0.
- `html-float-opener` docks the page beside the tiled pane under a float opener.
- `html-files-pane` opens the page from the Files pane.
- `html-reload` reloads the focused page, or from another pane the local pages in its tab (Cmd+R).
- `html-other-files` leaves other files to nvim-files or to Tern.

## How to get to it (user POV)

- Run `tern open page.html` in a Tern pane.
- Run `open page.html` in a fish pane (`~/.local/bin/open` is `bin/open`), or Enter on an HTML file in Yazi.
- Open the file from the Files pane (Ctrl+Cmd+E shows it).
- Cmd+click a `file://` link to an HTML file, or a plain path, in a terminal pane.
- Open the file with macOS open or Finder (Tern is the default app for HTML).
- Press Cmd+R to reload.

## Driving it with tern-verify

Preconditions:

- The baseline from `README.md`, with focus on pane 5.
- `RUN/data/page.html` and `RUN/data/page2.html` exist, each with its own `<title>` and `<h1>`.
- Read the focused page with `"$V" ctl "$RUN" webcall '.tn-pane.on .kit-web-page' '{"op":"eval","function":"() => document.title + \" | \" + document.querySelector(\"h1\").textContent"}'`. Focus the page pane first with `"$V" tern "$RUN" focus ID`.

- tern open. Run `"$V" type "$RUN" 'tern open page.html; echo EXIT=$status'`. `"$V" tern "$RUN" ls` lists a new pane `file:///.../data/page.html`, focused, right after pane 5. `"$V" tern "$RUN" capture 5` shows `cannot open in a file block` and `EXIT=1`. The webcall prints the title and heading of the file.
- bin/open from a float. Press `key alt+f` for a floating shell, then run `"$V" type "$RUN" '<checkout>/bin/open page2.html; echo EXIT=$status'`. The float shows `EXIT=0` and no `cannot open in a file block`. `tern ls` lists `file:///.../page2.html` as a tiled browser pane, not a float and not a file block, and the webcall on that pane prints the title and heading of `page2.html`.
- Files pane. Focus pane 5, press `key ctrl+cmd+e`, then run `"$V" ctl "$RUN" files focus`, `"$V" ctl "$RUN" files cursor page.html` and `"$V" ctl "$RUN" key enter`. `tern ls` lists one more `file:///.../page.html` pane.
- Reload. Change the `<h1>` of the file with `printf` into `RUN/data/page.html`, focus the page pane with `"$V" tern "$RUN" focus ID`, and run `"$V" ctl "$RUN" key cmd+r`. The webcall prints the new heading. Before the key, it prints the old one.
- Reload from a shell. Focus the shell pane beside the page, change the file again, and press `key cmd+r`. Then focus the page pane and run the webcall. It prints the new heading.
- Load report. Focus the page pane and run `"$V" ctl "$RUN" webreports '.tn-pane.on .kit-web-page'`. It lists `committed` and `loaded` for the `file://` URL.
- Proof. Run `"$V" shot "$RUN" html-<step>`. The shot shows the rendered heading in the browser pane, not HTML source.

## Gotchas

- `tern open` exits 1 with `cannot open in a file block` when the plugin opened the page. That is the expected result. `bin/open` hides this message and exits 0.
- In fish, `open` runs `bin/open` of the main checkout. To test the checkout under test, call `<checkout>/bin/open` by its path.
- `bin/open` exits 0 and removes its handoff file in `~/.cache/tern/open-owners` also when no plugin took the file, because Tern then opens a file block. Neither the exit code nor that dir proves the plugin. The proof is the browser pane in `tern ls` and its rendered page.
- The Files pane follows the focused pane. With a browser pane focused, `files cursor` finds no file and still prints `{"ok":true}`.
- A clicked link and macOS open have no stable handle in `tern ctl`. Report them as skipped unless you drive them by hand.
- `"$V" type` cannot send a double quote. Use the `webcall` and `printf` steps in your own shell, not in the pane.
