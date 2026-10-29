# HTML pages

A local HTML file (`.html` or `.htm`, in any case) that Tern would open as source opens as the rendered page in a browser pane, split to the right of the pane that opened it. When the opener is a float, the page goes beside the tiled pane under the float. A clicked `file://` link to an HTML file is Tern's own: Tern renders it beside its opener in the same way, and the plugin leaves it alone. Cmd+R reloads the page after the file changes. A web link that Tern routes opens in Tern when it points to this machine, and in Microsoft Edge otherwise.

## Sub-features

- `html-tern-open` opens the page beside the pane that ran `tern open FILE.html`.
- `html-bin-open` opens the page beside the pane that ran `bin/open FILE.html`, and `bin/open` exits 0.
- `html-float-opener` docks the page beside the tiled pane under a float opener.
- `html-files-pane` opens the page from the Files pane.
- `html-reload` reloads the focused page, or from another pane the local pages in its tab (Cmd+R, or `Reload page or run SQLite action` in the palette). In SQLite it runs only the active area's refresh or Execute action.
- `html-file-links` leaves a clicked `file://` link to Tern, which renders an HTML page beside the opener, also from a float. A fragment alone renders the file with the fragment dropped. A query with a fragment (`page.html?x=1#top`) opens as a Tern file block named `page.html?x=1`: an accepted cost, not a fault.
- `html-web-links` keeps a clicked web link to this machine (`localhost`, `*.localhost`, `127.x.x.x`, `::1`, `0.0.0.0`, the host name, also with `.local`) in Tern, and opens every other clicked web link in Microsoft Edge. A link clicked inside a Tern page stays in that page.
- `html-other-files` leaves other files to nvim-files or to Tern.

## How to get to it (user POV)

- Run `tern open page.html` in a Tern pane.
- Run `open page.html` in a fish pane (`~/.local/bin/open` is `bin/open`), or Enter on an HTML file in Yazi.
- Open the file from the Files pane (Ctrl+Cmd+E shows it).
- Cmd+click a `file://` link to an HTML file, a plain path or a web link in a terminal pane.
- Run `open -a Tern page.html`. Finder and a plain macOS `open` send HTML files to Microsoft Edge, the default app for HTML.
- Press Cmd+R, or choose `Reload page or run SQLite action` in the command palette.

## Driving it with tern-verify

Preconditions:

- The baseline from `README.md`, with focus on pane 5.
- The link lens: `"$V" lens "$RUN"`. A click on a link of its output block is `"$V" ctl "$RUN" click "\".tn-pane.on .sf-link[title^='$URL']\"" cmd`, with `URL=<the URL that you echoed>`. The lens output block must be in the focused pane, and wide enough to show the link.
- `RUN/data/page.html`, `RUN/data/page2.html` and `RUN/data/UP.HTM` exist, each with its own `<title>` and `<h1>`.
- Read the focused page with `"$V" ctl "$RUN" webcall '.tn-pane.on .kit-web-page' '{"op":"eval","function":"() => document.title + \" | \" + document.querySelector(\"h1\").textContent"}'`. Focus the page pane first with `"$V" tern "$RUN" focus ID`.

- tern open. Run `"$V" type "$RUN" 'tern open page.html; echo EXIT=$status'`. `"$V" tern "$RUN" ls` lists a new pane `file:///.../data/page.html`, focused, right after pane 5. `"$V" tern "$RUN" capture 5` shows `cannot open in a file block` and `EXIT=1`. The webcall prints the title and heading of the file. An upper-case `UP.HTM` opens the same way.
- bin/open from a float. Press `key alt+f` for a floating shell, then run `"$V" type "$RUN" '<checkout>/bin/open page2.html; echo EXIT=$status'`. The float shows `EXIT=0` and no `cannot open in a file block`. `tern ls` lists `file:///.../page2.html` as a tiled browser pane, not a float and not a file block, and the webcall on that pane prints the title and heading of `page2.html`.
- Yazi Enter. Press F2 and wait until the pane capture shows Yazi's `NOR` status, not an empty startup grid. Press `f`, type `page2.html`, and wait for the filter. Press Enter to accept the filter, then Enter to open the selected file. The page renders beside the tiled pane under the Yazi float, which becomes stashed.
- Files pane. Focus pane 5, press `key ctrl+cmd+e`, then run `"$V" ctl "$RUN" files focus`, `"$V" ctl "$RUN" files cursor page.html` and `"$V" ctl "$RUN" key enter`. `tern ls` lists one more `file:///.../page.html` pane.
- Palette. Focus the shell, run `"$V" ctl "$RUN" palette '"Open file"'`, then `key enter`. In the Files scope, type `page2.html` and press Enter. A new browser pane renders `page2.html`.
- Nonfocused tab. Type `sleep 3; <checkout>/bin/open page2.html; echo EXIT=$status` in a shell, press Enter, then focus another tab before the delay ends. The rendered page docks in the opener's tab and the shell reports `EXIT=0`. Keep the owner handoff while open requests do not name a pane.
- Reload. Change the `<h1>` of the file with `printf` into `RUN/data/page.html`, focus the page pane with `"$V" tern "$RUN" focus ID`, and run `"$V" ctl "$RUN" key cmd+r`. The webcall prints the new heading. Before the key, it prints the old one.
- Reload from a shell. Focus the shell pane beside the page, change the file again, and press `key cmd+r`. Then focus the page pane and run the webcall. It prints the new heading.
- Reload from the palette. Change the file again, focus the page pane, and run `"$V" ctl "$RUN" palette '"Reload page or run SQLite action"'` and `"$V" ctl "$RUN" key enter`. The webcall prints the new heading.
- SQLite key dispatch. Bind Cmd+R to `plugin.html-links.reload` alone through `cx.settings:bind`. The command reads the focused database's `area` through `cx.session:read` with one-record and one-character caps, then runs only that area's native action. These caps minimize the returned data; zero caps are clamped to one in Tern 0.9.7, not a metadata-only read. An ordered action list is not enough: Browse before Execute and Pragmas blocks those modes, while Execute before Browse consumes the first Browse refresh in a fresh window. All four native action IDs remain valid.
- First-use checks. Use a separate fresh window for each SQLite mode, with no earlier Cmd+R or direct refresh to warm dispatch. In Structure, add a table through a separate connection, press Cmd+R, and wait for `.sq-structure` to show it. In Browse, insert a unique row externally and wait for the first Cmd+R to show it in `.sq-br-grid`; do not run Execute first.
- Execute. Enter a SELECT with a new numeric marker, focus the SQL editor, and press Cmd+R. Wait for the results grid to show the marker. Do not count a direct Execute-button action or Cmd+Enter as Cmd+R proof.
- Pragmas. Open Pragmas, click `.sq-pr-top` to leave the previous editor's keyboard focus, and capture `.sq-pragmas input`. Change `PRAGMA user_version` through a separate connection. Press Cmd+R and wait for the field to show the new number. A hidden error node in a broad tree is not a visible error; inspect the actual field value or screenshot.
- Keep the same single-action binding for all four first-use checks and HTML reload. Then switch between modes and confirm that a Browse refresh does not run SQL left in Execute. Capture effective `cx.actions:keys()` and the isolated settings. `cx.actions:describe` and `list` do not discover native SQLite actions in 0.9.7, even for working IDs; an Unknown action response there does not prove a rename.
- Load report. Focus the page pane and run `"$V" ctl "$RUN" webreports '.tn-pane.on .kit-web-page'`. It lists `committed` and `loaded` for the `file://` URL.
- Clicked file link. Focus pane 5, run `"$V" type "$RUN" 'echo PROBE_LINK file://<RUN>/data/page.html'` and Cmd-click the link. `tern ls` lists a new `file:///.../page.html` browser pane right after pane 5, and the webcall on it prints the page. From a float (Alt+F), the same with `page2.html` gives a tiled browser pane right after the tiled pane under the float.
- Query link. From pane 5, Cmd-click the link `file://<RUN>/data/page.html?x=1#top`. `tern ls` lists a new pane named `page.html?x=1` that is a Tern file block (`tree '.tn-pane.on .kit-web-page'` finds nothing in it), not a browser pane.
- Fragment link. Cmd-click `file://<RUN>/data/page.html#top`. On 0.9.7, a browser pane renders `page.html` and `location.href` omits the fragment. Do not group this result with the query-link fallback.
- Local web link. In a second tiled pane, run `"$V" type "$RUN" 'python3 -m http.server 8765 --bind 127.0.0.1 --directory <RUN>/data'`. From pane 5, Cmd-click `http://localhost:8765/page.html`. A new browser pane shows that URL, and the webcall prints the page. Make `RUN/data/links.html` with `<a href=http://127.0.0.1:8765/page2.html>next</a>`, open it with `tern open`, and run `"$V" ctl "$RUN" webcall '.tn-pane.on .kit-web-page' '{"op":"eval","function":"() => document.querySelector(\"a\").click()"}'`. The same pane now shows `page2.html` (`location.href` in the webcall), and `tern ls` lists no new pane.
- Other web link. From pane 5, Cmd-click `https://example.com/?tern-verify`. `tern ls` lists no new pane and no error toast shows (`tree .toast`), because the route sent it to Microsoft Edge. Edge opens a tab with it, outside the instance; close it by hand or leave it.
- Proof. Run `"$V" shot "$RUN" html-<step>`. The shot shows the browser pane, but a shot can draw its native page as an empty placeholder. The webcall output (title, heading, `location.href`) and the load report are the proof of the rendered page, not the shot.
- Wait for native page loading after every open or reload. An immediate webcall can return `about:blank` or the previous heading. Poll the title, body, or URL for the expected value. For a quote-free webcall, use `{"op":"eval","function":"()=>[document.title,document.body.innerText,location.href]"}`.

## Gotchas

- `tern open` exits 1 with `cannot open in a file block` when the plugin opened the page. That is the expected result. `bin/open` hides this message and exits 0.
- In fish, `open` runs `bin/open` of the main checkout. To test the checkout under test, call `<checkout>/bin/open` by its path.
- `bin/open` exits 0 and removes its handoff file in `~/.cache/tern/open-owners` also when no plugin took the file, because Tern then opens a file block. Neither the exit code nor that dir proves the plugin. The proof is the browser pane in `tern ls` and its rendered page.
- The Files pane follows the focused pane. With a browser pane focused, `files cursor` finds no file and still prints `{"ok":true}`.
- After CLI focus, wait until `ctl state` reports the requested pane id before typing or clicking. A Files selection can retain keyboard focus after a pane focus; click the shell's `.tv-grid` to return it.
- `open -a Tern`, Finder and a plain macOS `open` act outside the isolated instance: they reach your own Tern or Edge. Report them as skipped unless you drive them by hand.
- A raw path or URL in terminal output is a link only after Tern finds it under the pointer, which needs coordinates. The link lens gives a link with a selector, so it proves the route of a clicked link, not the detection of the text.
- On 0.9.7, an echoed plain path exposed no link selector or accessibility Link node before pointer detection. Record plain-path detection as unverified when coordinate input is unavailable.
- `"$V" type` cannot send a double quote. Use the `webcall` and `printf` steps in your own shell, not in the pane.
