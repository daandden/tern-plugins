# Repository guidelines

## Project overview

This repo holds plugins for two hosts:

- `tern/<id>/` holds Luau plugins for [Tern](https://github.com/stencil-hq/tern-sdk). `bin/open` sends `open FILE` into Tern.
- `omp/` is the plugin root for `omp-tools`, a TypeScript plugin for Oh My Pi (omp). Its four parts are the `ask` Picker, `generate_image`, Side questions through `/btw` and Picker btw, and the English coach.

Use the terms and Avoid lists in [GLOSSARY.md](GLOSSARY.md) in code, tests, and issues. The Picker answers `ask`; the Go to picker jumps between Tern destinations. Read the relevant [ADRs](docs/adr/) before changing either host's behavior.

## Tern

### Architecture and state

Each Tern plugin lives in `tern/<id>/` with a `plugin.toml`. The folder name is the plugin `id`. `tern plugin link` writes an `<id>.path` file to `~/.config/tern/plugins` (`tern plugin dir`). After reload, Tern runs the code from the linked folder.

Tern runs `window.luau` once per window. The script registers handlers at load time, and Tern calls them with `cx`, the window context:

- `tern.command(id, fn)` adds a command that keys bind as `plugin.<plugin id>.<command id>`. `tern.override(name, fn)` replaces a native command; no plugin here uses it.
- `tern.on(event, fn)` handles `window_start`, `focus`, `pane_created`, `pane_closed`, `tab_closed`, `agent_state` and `agent_finished`.
- `tern.route.link(fn)` sees clicked links. A nil return leaves the link to Tern.
- `tern.css(name, sheet)` adds a sheet. The sheets select Tern's internal classes (`.sf-*`, `.tn-*`, `.pk-*`) and omp TSP roles. These are not an API, so a Tern or omp update can break them silently.
- `cx.session`, `cx.layout`, `cx.agents`, `cx.browser` and `cx.settings` read and change Tern state. `cx:command`, `cx:action("focus_pane:left")`, `cx:toast(level, title, detail)` and `cx:open(url)` act on the window.

goto has two halves. `tern/goto/window.luau` collects sessions, tabs, panes and their statuses, encodes them as JSON launch arguments, and opens the `picker` block as a floating pane. `tern/goto/plugin.toml` declares the block (`host = "host.luau"`, `[[blocks]]`). `tern/goto/host.luau` defines it with `tern.block.define("picker", { init, title, view, key, event })`, draws Tern's `picker` node, takes the keys, and answers with `cx:open("goto:pane/<id>")` (or `goto:tab/`, `goto:session/`, `goto:close`). The window's link route accepts only links from its current picker and focuses the target. `docs/adr/0001-goto-picker-as-floating-block.md` records why the picker is a floating block.

State lives in two places:

- Module-level locals (`picker`, `worktree_busy`, `pending_focus`) last until the plugin reloads. `window_start` does not run after a reload, so cleanup that must survive one runs from a load-time `tern.timer(0, fn)`, such as goto closing orphaned pickers.
- `tern.kv.get`/`tern.kv.set` persist per plugin in `~/.config/tern/plugin-data/<id>/kv.json`. goto keeps `finished`, `since`, `waiting_idle` and `reduce_motion_before_open`; zellij-keys keeps `last_float`. Plugin settings have no API, so preferences live here too.

### Key directories

- `tern/`: `goto`, `zellij-keys`, `reader-terminal-text`, `vstack-flow`, and `toast-above-browser`. Only goto has a `host.luau`; reader-terminal-text and toast-above-browser are CSS only.
- `bin/`: shell commands for Tern panes (`bin/open`).

### Development commands

Tern reads the Luau sources directly. The Tern plugins have no build step.

```sh
tern plugin reload            # all plugins; exits 1 when one fails to load
tern plugin reload zellij-keys  # one plugin; reloading any plugin but goto leaves its picker open
tern plugin list              # every plugin must show `ready`
tern plugin types tern/goto    # writes tern/goto/tern.d.luau for luau-lsp (gitignored)
tern plugin link "$PWD/tern/<id>"  # once, for a new plugin folder
```

Reload and list plugins after each change. Use the isolated Verify run below to check a branch without touching the live Tern instance. To add a Tern plugin, create `tern/<id>/plugin.toml` (`schema = 1`, `id`, `name`, `version`, `description`, `window = "window.luau"`) and `tern/<id>/window.luau`, then link the folder.

### Code conventions

- Indent Luau with tabs. Each `window.luau` starts with a comment that says what the plugin does, and each function or command has a comment above it that says what it does. In zellij-keys, that comment names the Zellij action that the command copies.
- Names: snake_case for locals, functions and command ids (`float_yazi`, `worktree_agent_tab`), UPPER_CASE for constants (`GIT_ENV`, `TAB_ORDER`, `ATTENTION`).
- Async work uses callbacks: `tern.process.run(argv, { env, cwd }, function(result, later) ... end)`, `tern.timer(ms, fn)`, `cx.browser:call(...):next(fn)`. The callback gets a fresh context, `later`, which is nil when the window is gone. Run the callback body under `pcall`, toast a failure on `later`, and reset busy flags on every exit path; `worktree_step` in `tern/zellij-keys/window.luau` is the model. Chain steps by nesting callbacks.
- User-visible failures are `cx:toast("error", title, detail)`, with the first non-blank line of a command's stderr as the detail.
- Run external programs by absolute path (`/opt/homebrew/bin/git`, `omp`, `gtimeout`, `yazi`, `lazygit`, `btop`). Plugin processes get Tern's launcher `PATH`, which lacks Homebrew.
- The Lua time of each hook has a budget. Keep handlers short and let native calls (`tern.kv`, `cx.session`) do the work.
- `keybinds.html` is the guide to every bound key, grouped by Zellij mode. When you add, remove or change a keybind or a zellij-keys command, change its row (columns Keys, What it does, Zellij action, From, with `data-label` attributes) and the sequence count at the top. Several sequences can share a row, so count sequences, not rows.

### Important files

- `tern/goto/window.luau`: row collection, status and time tracking, the `goto:` route. `tern/goto/host.luau`: picker rendering, search, jump numbers, tab order.
- `tern/zellij-keys/window.luau`: commands, float focus on close, the worktree agent tab.
- `tern/vstack-flow/window.luau`: the Flow link route. `tern/reader-terminal-text/window.luau`: Reader CSS.
- `~/.config/tern/settings.json` (outside the repo): keybinds `plugin.<id>.<command id>`, `link_target`, `agent_placement`.
- `tern/<id>/tern.d.luau`: generated API types from the installed Tern version. Read it for signatures; regenerate it after a Tern update. SDK and example plugins: https://github.com/stencil-hq/tern-sdk.

### Runtime and tooling

- Tern 0.9.28 (`tern --version`) runs the Luau plugins. The Tern plugins have no package manager, formatter, or linter config.
- Homebrew tools the plugins call: git, omp, GNU coreutils `gtimeout`, yazi, lazygit, btop, all in `/opt/homebrew/bin`.
- The user's login shell is zsh (`/bin/zsh`); `~/.zprofile` puts `~/.local/bin` and Homebrew before `/usr/bin` in `PATH`.

### Testing

`tern plugin list` proves only that a plugin loaded. To prove behavior, use the per-feature recipes in [verify-tern-plugins](.omp/skills/verify-tern-plugins/SKILL.md) on an isolated Tern instance.

- In a verify run, send every `tern` command through the helper. A bare `tern` command in an agent pane acts on the user's own window.
- `ctl plugins run plugin.<id>.<command>` prints `{"ok":true}` even for a missing id and skips the keybind. Prove each step by a change of state, and press the real key to prove a binding.
- After an edit, reload the changed plugin in the run (`"$V" tern "$RUN" plugin reload <id>`) before you drive it.

### Plugin notes

zellij-keys: `~/.config/tern/settings.json` binds its commands as `plugin.zellij-keys.<command id>`. If you rename a command id, change its keybind in `settings.json` too. Tern reads the file only at start and on Reload settings, and writes the whole file again at each change of a preference, so a hand edit of the file while Tern runs can be lost. Bind keys with Tern's Keyboard settings, or with `cx.settings:bind` from a plugin, which applies the key at once and saves it. Keep the absolute `/opt/homebrew/bin` tool paths: plugin processes inherit Tern's launcher PATH, which may lack Homebrew, even when the interactive zsh pane finds those programs.

zellij-keys floats: `settings.json` binds no key to hide or show the floats of a tab. Tern's own `pip_stash_all` does it (its default Ctrl+Option+Cmd+P, or "Hide pictures in picture" in the palette when the tab has floats), and it picks its direction from its last call anywhere in the window rather than the active tab's state ([Tern SDK #255](https://github.com/stencil-hq/tern-sdk/issues/255)). Alt+F and Ctrl+G P W used to run a plugin override of it, which read a float's `cx.session:view` to tell shown from hidden. On Tern 0.9.16 a hidden float of a tab you have visited can keep a view, so the override was removed with both keys.

zellij-keys close: `pane_closed` saves the closing float's focus snapshot and queues a zero-delay timer. The timer does the `last_float` KV cleanup and focus restoration outside the hook's 500 ms wall-time budget. It restores focus only if the tiled pane under the closed float still has focus and the tab has shown floats. It picks the last used float, else the one before the closed float in open order, else the one after it. Esc in Go to returns to the opener float. A jump to another pane keeps that target, but a jump to the tiled pane under the picker also returns to the float. Tern gives that jump and Esc the same events. "Shown" means a non-nil `cx.session:view`. Tern 0.9.16 can retain a view for a hidden float in a visited tab, so a close can reveal that float.

zellij-keys app floats: F2, F3 and F4 open Yazi, lazygit and btop after the key action returns so Tern does not hand focus back to the tiled pane. Tern 0.9.27 stores the focused size separately from the glance size. The plugin keeps the default glance size and grows the focused float by six horizontal and three vertical native resize steps. Tern clamps the result to the frame, matching the old 892 by 511 px focused size in a 1280 by 800 window. The focus-to-glance animation runs in Tern's renderer, not the plugin's CSS.

zellij-keys size: `resize_increase` and `resize_decrease` grow or shrink a focused float by one native `resize_split` step in width and in height. Tern keeps the float in its corner and moves the edges away from it, so `resize_split` directions are relative to the corner: right and down grow a float in the top left corner, left and up one in the bottom right. The commands pick the directions from the float's corner in `cx.session:layout(tab).floats`. Both commands do nothing in a tiled pane.

zellij-keys browser reload: Tern 0.9.18 has no reload action for a browser block, and its preset gives Cmd+R only to `sqlite.structure.refresh`, `sqlite.browse.refresh`, `sqlite.execute.execute` and `sqlite.pragmas.refresh`. `settings.json` binds Cmd+R to those four first and `plugin.zellij-keys.reload_page` last; with the plugin command first, Cmd+R did nothing in SQLite. A chord in a command's `keys` that the preset already takes is left out, so the binding must live in `settings.json`. `reload_page` is available only when the focused pane's `kind` is `browser`, and it sends the browser op `nav` with `go = "reload"`, which leaves the page undriven; `eval` marks it driven.

Browser block keys: while the page of a browser block has the keyboard, Tern 0.9.18 gets only Cmd chords, which macOS sends as key equivalents. Alt chords and Ctrl+G sequences reach the page as `keydown` events, and F1 runs nothing either, so Alt+X does not close the block, while Cmd+W, Cmd+L and Cmd+R work. No plugin API sees those keys. `tern ctl key` sends keys to Tern's own UI even then, so only native input (a real key, or `computer` window input) reproduces this.

Native floats: Tern draws corner decks, at most four floats per corner, and fans a deck on hover. An unfocused float shrinks to a glance. Mouse dragging, motion, directional focus, moving between corners, floating and docking, splitting, directional resizing, and tiled equalize use Tern's own behavior. Alt+H and Alt+L keep `focus_or_tab_left` and `focus_or_tab_right`: try native `focus_pane`, then the previous or next tab if focus did not move.

Agent tab: Alt+Shift+T runs Tern's own `new_agent_block`, and Tern's setting `agent_placement` is `new_tab`, so the agent opens in a new tab, in the folder of the focused pane. Every New agent block opens a tab, also from the palette.

zellij-keys worktree tab: Ctrl+Shift+T (`worktree_agent_tab`) adds a worktree of the focused pane's repo at its default branch and opens a new tab that runs omp there. The main checkout (the first `worktree` line of `git worktree list --porcelain`) may be on any branch and keeps it. The command stops with an error toast when that checkout has staged, unstaged or untracked changes (`git status --porcelain`). The default branch is the one `origin/HEAD` names, else the one of `main` and `master` that exists. With an `origin` remote, the command fetches that branch (30 s, `GIT_TERMINAL_PROMPT=0`) and compares the local branch with `origin/<branch>` through `rev-list --left-right --count`: ahead or diverged stops with a toast, so no unpushed default-branch commit is left behind, and the new worktree starts at `origin/<branch>`. A local branch that is only behind moves forward to `origin/<branch>` first (`worktree_fast_forward`), because the user wants the local default branch current too: when the main checkout is on it, `git merge --ff-only` moves the branch and its files; otherwise `git fetch . origin/<branch>:<branch>` moves only the ref, and git refuses that when another worktree has the branch checked out. A refused or failed fast-forward stops the command with an error toast, leaves the branch as it was, and makes no worktree. A fetch that fails or times out shows an info toast and then uses the `origin/<branch>` that git already has, so a known unpushed commit still stops the command. When the local branch or `origin/<branch>` is missing, nothing is compared, and the worktree starts at `origin/<branch>` if it exists, else at the local branch. `omp worktree add` makes the worktree on a new `wt/<time>` branch in `<dir>/wt-<time>-<commit>`, where the dir is `OMP_WORKTREE_DIR`, else omp's `worktree.base`, else `~/.omp/wt`, and it clones the main checkout's ignored files when `worktree.clone` is on. omp's `/wt` is not used: it branches from the HEAD of its folder and copies that folder's changes. `cx.agents:start` rejects a blank prompt, and a `new_tab` in Agent mode opens in the folder of the focused pane, so `cx.layout:new_tab` runs omp as the tab's command, and Tern lists that pane as an agent. While a press runs its steps, `worktree_busy` makes a second press do nothing. Git and omp run from `/opt/homebrew/bin`, because Tern's `PATH` does not include it, and every process of the command gets `/opt/homebrew/bin` first in `PATH` (`GIT_ENV`), because git and omp start hooks and filters, such as Git LFS's, that look up Homebrew programs by name.

zellij-keys worktree names: the `<time>` stamp changes once a second, so two presses, or a press and another tool, can pick the same path and branch, and a press must not touch what it did not make. Before `omp worktree add`, a press claims both names atomically. `git update-ref refs/heads/wt/<time> <commit> 0000…` creates the branch only if no branch has that name; a check with `rev-parse` was not enough, because omp's `-b` reuses a branch that appears after the check. The press makes the folder with a plain `mkdir`, which fails when the folder exists. omp then adds the worktree into that empty folder on the claimed branch, without `-b`, also with `worktree.clone` on. The press passes the folder's real path (`pwd -P`) to omp and looks for that path in `git worktree list`, because git lists worktrees by a normalized path, so a `worktree.base` with a trailing slash or a symlink still matches. When the add fails, the toast shows the first non-empty line of its output, and the press removes the worktree at its path (or only the folder when git lists none), then deletes its branch with `git update-ref -d <branch> <commit>`, which refuses when the branch has moved, for example after a commit by a hook. A refused or failed removal shows a second toast and leaves the rest on disk.

zellij-keys worktree settings: both `omp config get worktree.base` and `omp worktree add` run with the main checkout as their process cwd, so its `.omp/config.yml` applies. These worktrees are created before their omp session starts, so they are not owned by that session's `worktree.onExit` cleanup. Keep them until the user removes them explicitly.

zellij-keys fetch deadline: `/opt/homebrew/bin/gtimeout` (GNU coreutils) wraps the fetch and terminates its process group after 30 seconds, with `--kill-after=1s` for a process that ignores TERM. Tern's own `tern.process.run` timeout kills only the parent; a surviving SSH transport can keep its output pipes open and delay the callback past the deadline. The group deadline lets the command continue with the cached origin branch without waiting for the transport.

reader-terminal-text: the plugin is CSS only, through `tern.css`. Its selectors use Tern's Reader classes and omp roles: `.sf-chat-reader`, `omp.assistant`, `omp.editor`, `omp.advisor.note`, `omp.notice.*`, and `.sf-tool-body > .sf-md`. Prose, advisor notes, notice rows and section bodies, and tool-result prose use the terminal size, weight, and row height. Single-line chrome uses the terminal size and row height with Reader's own weights: advisor heads and labels, tool title, target, meta, time and more, card heads, chips, the working row, and status. If Tern changes these selectors, the rules stop working. The `:root` and `:root:root` prefixes outrank Reader's rules.

reader-terminal-text weight: Tern's Font weight setting (`font_weight`) sets `--tv-weight`, which only the terminal grid uses. Reader's `font` shorthands set message text back to 400, so the plugin gives that text `var(--tv-weight, 400)`, and its strong text and headings `bolder` (700 from 400, 900 from 600 or 700). Tern's CSS engine does not apply `min(900, calc(var(--tv-weight) + 300))` in `font-weight`, so bold cannot follow the grid's +300 exactly. Single-line chrome (tool titles, chips, status) keeps Reader's own weights.

reader-terminal-text on Tern 0.9.7: Reader supplies the composer UI font, so no font-family override is needed. Keep the terminal size, row height, weight, normal letter spacing and hidden placeholder rules. Markdown horizontal rules use the theme's `--omp-mdHr` colour.

reader-terminal-text dock gap: Reader gives every dock region (`.sf-region.sf-dock.sf-chat-reader`) a 24px top padding. An omp pane can hold several Reader dock regions whose children are all `.sf-void` (one pane on Tern 0.9.16 held 10), and each one adds a blank 24px row between the transcript and the composer. The `dock-gap` sheet hides a region that has no child other than `.sf-void` or `.sf-hidden` nodes, so only regions with content keep their padding. Tern 0.9.16 supports `:has()`.

Pane dimming: set Tern's **Dim unfocused panes** to Off (`unfocused_dim: 0`) to keep panes at full contrast. Tern then omits `.dim` on unfocused panes. Select verification targets without relying on `.dim`.

toast-above-browser: Tern 0.9.18 draws a browser block's page in a native view above its own UI, so it covers the part of a toast (`body > .toast`, centred at `bottom: var(--toast-bottom, 28px)`) that overlaps the page. For the palette and other modals Tern swaps the page for a snapshot (`.kit-web.veiled`), but not for a toast, and no plugin API can veil a page. While the visible tab shows a browser pane (`.tn-pane.web` without `.off`; a pane of another tab and a hidden float have `.off`), the sheet moves the toast to `top: 0`, over the 40 px title bar, which no page covers, and slides it in from above. A toast that wraps to more lines grows down over the pane heads, which are Tern's own UI. With no browser shown, the toast stays at the bottom. The classes are Tern internals, so an update can put the toast back under the page.

Native files: text and code files use Tern's native code view, which follows `adjust_cell_height` since 0.9.8. Since 0.9.16, Tern opens a local `.html` file as a rendered page in a browser block, from `tern open`, `bin/open`, the Files pane and the palette; the user keeps that. No plugin intercepts file opens or `file://` links. Web links other than Flow links follow Tern's `link_target` setting. Native code text still does not inherit the terminal's font weight.

vstack-flow: the user keeps `link_target` at `Browser`, so web links open in Edge, but wants Flow links (GLOSSARY.md) in Tern. The plugin's `tern.route.link` claims a link whose URL is `http://127.0.0.1` or `http://localhost`, any port, with the path `/f/<project>/<flow>/<64 hex>/` and nothing after it but an optional fragment, so user information, a query or more path leave the link to Tern; the Local Flow host's port is `42000 + uid % 10000` unless `VSTACK_FLOW_PORT` or an isolated `--home` moves it. Tern applies `link_click` before the route, so only the opening click (Cmd-click) arrives. Cmd+⌥-click also arrives, with `mods.alt`, and the route returns nil so Tern handles it: ⌥ opens the other target, which is Tern. If the opener pane's tab has a browser pane whose URL names the same Flow (the URL up to the capability segment), the route sends it to the clicked URL with the browser op `goto`, which keeps the document because only the fragment changes, and focuses it. Otherwise the browser op `open` with `how = "beside"` docks a new page right of the opener pane, or of the tiled pane under a floating opener, and the route then `release`s it, because an opened page stays driven by automation. Tern gives automation pages the `agent` website data store, while its own link opens use the shared store; `tern browser --help` names no store option for `open`. `cx.layout:open` of the URL is no substitute: it follows `link_target` and opens Edge. Tern 0.9.12 calls the route for Cmd-clicks on native links, including the Markdown link of omp's Flow page popup.

bin/open: `~/.local/bin/open` is a symlink to `bin/open`, and zsh's `~/.zprofile` puts `~/.local/bin` before `/usr/bin` in `PATH`. In a Tern pane (`TERN_PANE` is set), `open FILE...` with only local files runs `tern open` for each file. The file opens beside that pane in its tab, also when you were looking at another tab. Every other call goes to `/usr/bin/open`, also when `tern` is missing or any argument is an option or not a regular file. The script returns a failing `tern open` status if any file fails.

Yazi: `~/.config/yazi/yazi.toml` (outside this repo) sends `*.{html,htm}` to the openers `open` and `edit`. Enter runs `open %s`. Yazi started from a zsh login shell finds `bin/open` first in `PATH`, so `tern open` shows the rendered page in Tern. The "open with" menu (`O`) offers `$EDITOR` for the source. A shell whose `PATH` puts `/usr/bin` before `~/.local/bin`, such as a bash login shell, misses `bin/open`.

goto rows: the window half sends sessions, tabs and tiled panes as JSON launch arguments to the `goto.picker` host block. A one-pane tab is one row with that pane's status. Only split tabs have pane rows. `agent` marks agent panes and their tabs; a split tab with one agent names that pane row in `solo`. `in_view` opens with agents only, including every session and each agent tab or pane. A `solo` tab shows and goes to its agent through `target`.

goto input: letters and spaces search immediately; digits are jump numbers and never enter search. Up/Down move. Esc clears a pending digit, then search, then closes. `ctrl+;` starts the actions prefix: `a` switches agents only/all panes, `i` toggles idle Waiting on you rows, and any other key ends the prefix. Keep `ctrl+;` unbound in Tern's keymap or the block cannot receive it. Plugin settings have no API, so `waiting_idle` lives in `tern.kv`, default hidden. Tern 0.9.6 and later preserve unknown settings.json keys, but they are not plugin preferences.

goto numbers: after each filter or search, `number_rows` numbers visible destinations. A session with one shown tab shares that tab's number through `merged` and `destination`, even if other tabs were filtered out. The tab's number slot is empty, `step` skips it, and `place_cursor` moves a cursor on it to the session. `action_key` does the same when filtering leaves one tab. Split-tab panes and Waiting on you copies keep their own numbers. One or two digits depends on destinations, not rows.

goto Waiting on you: `collect` copies attention rows other than the current row into `group`, ordered by `ATTENTION`, then by the row's time, longest first, then tree order (`longer_first`). The host shows these first, under the picker node's group header "Waiting on you" with their count, as session / tab / pane, omitting duplicate names, then the tree under the header "Sessions". Group headers are not rows, so cursor, numbers and clicks skip them. Search hides the group. `place_cursor` starts on the first group row, otherwise the current pane, solo tab or session. Clearing search restores that cursor. The picker's head shows the search with a drawn caret; while the `ctrl+;` prefix waits, its title names the actions and `esc cancel`. `goto:session/<id>`, `goto:tab/<id>`, `goto:pane/<id>` and `goto:close` links tell the window route what to focus.

goto status: `cx.agents:list()` supplies working, waiting_input, idle or exited, including omp terminal panes. Plain terminals use `busy` and `alert` from `cx.session:panes()`. To recover richer omp states, `omp_signals` reads only `dock` and `layer` roots with `cx.session:surface`, never the whole-chat `main` region. It recognizes `omp.ask.question` and `omp.plan.options` as input, `omp.working` with a `meter` as retrying or `progress` as compacting, `omp.errorBanner` as error, and `omp.hud.seg` with a `text` child as running jobs or subagents. An old `omp.hud.pill` can remain with only a muted icon and no count text; it does not count as running. These are omp TSP roles, not an API; renames fall back to Tern's plain states. They still match omp 18.13.3.

goto Picker status: omp-tools' Picker opens through `ctx.ui.custom`, which omp 19.0.0 does not count as a dialog, so omp reports the pane `working` over OSC 7501 for as long as the Picker waits. Every Picker view (a question, Picker review, an answer editor's context, the Picker btw thread after `?`) draws its body as a list with the role `omp-tools.ask-body`, and `omp_signals` treats that list as input. The Picker btw thread has no `omp.ask.question`, so without this rule the pane showed working while you asked aside. omp-tools' `/btw` panel and English coach draw the same list inside `omp.overlay.btw` while the agent works, so a list under that role is not input. Both roles belong to omp-tools, not an API.

goto pause: omp 18.18.1's `/pause` draws `omp.overlay.pause` in `layer`. It wins over every status except exited, including while calls settle. Goal, loop and plan badges and Ctrl+Z are not pause signals. Paused rows use a still U+F04C `icon muted` mark with tooltip `Paused`, join Waiting on you after done and before idle even with idle hidden, and show no time. Pausing changes neither `finished` nor `since`: resume restores the underlying result or working time, including the hold.

goto rendering: Tern's `picker` node draws the picker, keyed `goto` with the role `goto.picker`, in the block's `layer` region at `size = "screen"`, so it fills the floating pane. It uses `layout = "tree"` for its 24 px rows, but sends no `depth`, `open` or `dot`, so it draws no tree guides, chevrons or native dots. The tree layout still keeps a chevron slot and a dot slot on every row, so the `palette` sheet hides `.pk-chev` and `.pk-lead`, and each row starts with its jump number. Each label is spans: the muted jump number (a pending first digit is `accent strong`), the status mark (goto marks), the tree cells (`tree_cells`), then the name with search matches in `accent strong`. A row with no number keeps its width in figure spaces. Each tree cell is a no-break-space span whose tokens Tern keeps (`TREE_CELL`): `code` marks the cell, `info` a line from top to bottom and `success` a branch, so `code info success` is `├─`, `code success` `└─`, `code info` `│` and `code` a blank. The `palette` sheet draws the lines with `::before` and `::after` in a 16 by 24 px cell and sets the label's line to 24 px, the tree row height, so the lines of rows join at every interface size; line characters of the font did not, because their height follows the font size. Item ids are row indexes, and `selected` is the cursor's row. The picker keeps its rows in view and draws in the UI font by itself, so the block sets no `font`; with the user's `ui_font` set to a mono face, the rows stay in that face. Keys stay in the block's key handler: the picker draws no text field. The action bar holds `All panes` and `Show idle` (pressed while on, keys `ctrl+;` then `a` or `i` in their tooltips), `Close` (esc) and the primary `Go` (enter), and its clicks arrive as `action` events. An empty search shows Tern's own "No panes match" state, whose Clear button sends `clear`.

goto marks: each row has the mark of the pane it stands for, after its jump number, with the status's words as the row's tooltip. A busy status is a moving mark that the `palette` sheet draws on a no-break-space span, because Tern keeps only its own style tokens: `num` is the hook and the second token picks the mark (working `accent` a turning arc, running `em` an orbiting dot, compacting `ins` a sliding bar, background three `del` dots, retrying `mark` widening rings), and idle `muted` is a hollow ring. A status that waits for you is a still Nerd Font glyph with the `icon` token in a Tern tone: input warning, error, exited and alert error, done success. A row with no status keeps an empty `icon` slot, so names line up. The animations use Tern's own keyframes (`tnHdSpin`, `sf-turn`, `sf-indet`, `sf-dot`, `tnRing`); the user found Tern's native pulsing dot too weak. The rules select `.sf-t-*` spans inside `.pk-label`, an inner part, so a Tern update can drop the marks.

goto palette: the `palette` sheet fixes the float at 12vh and 50vw, so the file tree does not shift it, at 640 by 511 px. The pane is selected by `aria-label^="Go to,"`. On Tern 0.9.21 a `size = "screen"` picker sheet paints no surface (`.sf-picker.sz-screen .pk-sheet` has `background: none` and no backdrop filter), so the sheet gives the pane the palette's own surface: `--modal-bg`, `--modal-filter` and `--modal-shadow`. Without it the tiled pane's text shows through the picker. Its shadow and the `veil` sheet use Tern's `--modal-dim`: an inset body shadow covers window edges, and non-interactive pseudo-elements dim tab-bar items and the file tree. Keep the invisible terminal grid, which receives typed keys for the block. The sheet's rules inside the picker color the time column, one per row tone (`.pk-row[data-tone='accent']` and `[data-tone='warning']` with `.pk-fact.f-elapsed`), and align the rows (goto rendering). Tern calls the `pk-*` parts inner, so a Tern update can drop them, leaving plain times or a ragged left edge. `window_start` still does not run after a plugin reload, so a load-time timer closes orphaned picker panes. A targeted reload of another plugin leaves the picker open. `GLOSSARY.md` names the terms; `docs/adr/0001-goto-picker-as-floating-block.md` explains the float.

goto veil: the `veil` sheet is registered once at load. Its `:has()` matches a picker pane in `.tn-stage` without `.off`, so closing the picker or hiding its tab removes the dimming through CSS. Each pane switch toggles `.off`, and Tern then restyles everything that a `:has()` rule can reach. Write every step after a `:has()` with the child combinator (`body:has(> main > .tn-stage > …) > #tabbar > .tb-in`, `.tn-stage:has(> …) > nav.ft`). With a descendant combinator there (`body:has(…) #tabbar`), Tern 0.9.22 restyled every node under `body` at each switch. In the user's window of 350,000 to 400,000 nodes, that cost 270 to 390 ms of `style` time per switch, against 20 to 25 ms with child combinators, the same as with no veil sheet. Tern keeps the full Reader transcript of every visited agent pane in the document, so long agent sessions make the document that large. Check a new `:has()` rule in a large window with `tern ctl trace` before you keep it.

goto switch cost: with the veil fixed, Enter into a heavy agent pane still has one frame of 200 to 250 ms on Tern 0.9.22, almost all of it `pane_surface_tick` of the destination pane ([Tern SDK #342](https://github.com/stencil-hq/tern-sdk/issues/342)). A direct `tern focus` of the same pane costs 70 to 110 ms there. The extra 100 ms comes with any second pane that is open in the tab being left: a plain `tern split` pane beside the source pane gives the same 180 ms, and the picker is such a pane. Focusing the target before the picker closes, removing `quiet_motion`, and removing the `omp_signals` reads each left the frame as it was, so do not reorder the route for speed.

goto sticky header: while the rows scroll, Tern pins the current group header (`.pk-sticky`, "Sessions" or "Waiting on you") over the first row, on an opaque `--panel` band that stands out from the picker's surface. The user does not want it, so the `palette` sheet hides `.pk-sticky`. The headers in the list itself stay.

goto hook budget: Tern 0.9.6 and later count only the plugin's Lua time, excluding native calls such as `tern.kv`. A hook over its budget pauses for 5 seconds, doubling up to 5 minutes, rather than staying disabled until reload. The log names the hook and its pause. The `focus` and `pane_closed` hooks clear finished results and time starts synchronously, and write `tern.kv` only when the pane has an entry to clear. Native calls still share the 500 ms total wall-time cap. On Tern 0.9.27 the `focus` hook hit that cap twice in one day, cause not found, while it still wrote a last seen count at every focus. If it comes back, record the native call in progress before each call and log it from a `tern.on("budget")` handler: a hook stopped at its budget never reaches its own last line.

goto tab order: the host half (`tree_order` in `host.luau`) puts the tabs of each session by their tab status, in the order of `TAB_ORDER` (input, error, alert, done, paused, idle, retrying, compacting, working, background, running, exited, then a quiet tab), then by time, longest first, then in Tern's order. A tab with one pane has that pane's status and time. A split tab takes the first status in `TAB_ORDER` among its panes that the view shows (agent panes with agents only, every tiled pane with all panes) and the longest time among those panes with that status. So `ctrl+;` then `a` can change the tab order. Floating panes give no status. A search keeps the same order. Sessions keep Tern's order. The panes of a split tab come by time, longest first, then in Tern's order.

goto zoom: Tern's interface size zooms the block region by `--tn-zoom`, and Tern's own palette (`.tn-cmdk`) zooms again by `--tn-zoom`. So the `palette` sheet scales the pane's left edge, width, height (511 px) and corner by `var(--tn-zoom, 1)`, and the picker sits where the palette sits at each interface size. The picker node zooms with the block region, so its text and action bar scale with the interface size.

goto motion: Tern animates the picker's float as it grows into view, outside CSS, so `open_picker` first calls `quiet_motion`, which sets `reduce_motion` to `on` for 400 ms. The user's value waits in goto's `tern.kv` under `reduce_motion_before_open`, and `window_start` restores it if Tern stopped in between. While `reduce_motion` is `on`, a `tern.timer` can fire only when the value goes back, so both waits are `/bin/sleep` processes: the 400 ms one and the 60 ms refocus of `open_picker`. A refocus that waits longer leaves the picker unsettled, so a click elsewhere does not close it.

goto finished: Tern sends `agent_finished` when an agent's turn ends, for every agent kind. `tern.kv` keeps under `finished` the result of each agent pane's last turn that you have not seen: `done`, or `error` for a `failed` turn. A turn that ends while its pane has focus stores nothing, because you saw it. `exited` and `closed` clear the entry, and so do a focus of the pane and its close. `pane_status` shows a stored `error` as `error` and a stored `done` as `done`, after the live states (paused, input, retrying, compacting, working). An exited agent keeps its `exited` mark and stays out of Waiting on you. Tern also raises its own finished or failed inbox alert after each turn, which shows as `done` through `info.alert`. An Esc cancel in omp sends no event and leaves Tern's state `working`.

goto times: rows show working time and waiting time (GLOSSARY.md) in the picker's `elapsed` column. Tern gives no start time, so the window half keeps under `since` in `tern.kv`, by pane id, `kind` (`working` or `waiting`), `input`, `turn` and `at` (`os.time()` seconds). `agent_state` starts working time on a change to `working` and a wait on a change to `waiting_input`. A wait for input keeps the start of the turn it interrupts in `turn`, and the change back to `working` restores it, so answering a question does not restart working time. An event with `old` nil (an agent new to goto, which may have started long before) starts nothing and drops any entry under its pane id, and so does `pane_created`, so an id that a later pane reuses shows no stale time. Any other change ends working time and a wait for input. `agent_finished` in an unfocused pane starts waiting time for its done or error result; a focus of the pane ends that wait, and an exit or close ends any. If the next turn is already working when Tern looks again, that finish replaces the working entry and the row shows no time. `row_time` gives a row the stored start only when it matches the row's status (working, retrying, compacting for working time; the Waiting on you statuses except idle and paused for waiting time), so a status whose start goto did not see, such as an omp ask that Tern still reports as working or a terminal alert, shows no time. Idle and paused agents show none. The host half sends the time so far at each render, and the row's tone (`accent` for working, `warning` for waiting) colors it through the `palette` sheet. Every row of the pane shows it: its Waiting on you row, its tree row, and the row of a tab with one pane.

## omp-tools

### Architecture and subsystem notes

`omp/package.json` registers four default-exported initializers through `omp.extensions`. Each registers tools and event handlers on `ExtensionAPI` and keeps its registration state local. Before changing a part, read its notes:

- [`ask` and the Picker](omp/docs/agents/ask-picker.md). `flexible-ask.ts` reads the native HTML form and opens the Picker in the TUI. Other callers reach native `ask` through `ctx.invokeTool`. Read the notes for editors, paste, drafts, host `askDialog` routing, and the tool card.
- [Side questions](omp/docs/agents/side-questions.md). `/btw` and Picker btw each own a `LazySideQuestionThread` backed by a read-only mirror session. Read the notes before changing dispatch, streaming, or thread ownership.
- [`generate_image`](omp/docs/agents/generate-image.md). One tool dispatches to OpenAI mode or Codex mode per call, using `defaultImageGenerationMode` when the call omits `mode`. Read the notes before changing mode selection, results, clients, or the prompting skill.
- [English coach](omp/docs/agents/english-coach.md). The coach checks interactive prompts with `@tiny` and shows private corrections above the editor without changing the prompt. Read the notes for settings, protected text, the diff, or the widget.
- [Tern views](omp/docs/agents/tern-views.md). Read before changing an omp-tools view in Tern. Covers scroll boxes, stylesheets, and theme colors.

Source and model-facing prompts live in `omp/extensions/`. `omp/package.json` declares `omp.settings`; read those values with `getPluginSettings("omp-tools", cwd)`. A project's `.omp/plugin-overrides.json` overrides the global value. Keep the shipped [generate-image skill](omp/skills/generate-image/) under the plugin root. omp discovers `skills/*/SKILL.md` there through `omp-plugins` at priority 90.

### SDK imports

Runtime value imports of `@oh-my-pi/*` resolve through omp's extension specifier shim. An unserved subpath can load a second SDK copy and fail. Check new value imports against the deployed binary before adding them. The compiled omp 19.0.0 registry serves:

- `@oh-my-pi/pi-tui` and its subpaths, including `/chrome`, `/render`, `/theme`, `/thinking`, `/media`, `/html-form/*`, `/chat/svg-figure`, `/native/blobs`, `/native/overlay`, `/chrome/form-theme`, `/keybinding-matchers`, `/overlays/*`, and `/tools/*`. In omp 18.22.0, `/html-form/media` moved to `/media`, and `loadFormImage` became `loadMedia`.
- `@oh-my-pi/pi-coding-agent`, `/judgment`, `/modes/*`, `/tools/*`, `/utils/*`, `/session/*`, `/config/model-resolver`, `/extensibility/plugins/loader`, and `/session/settings`.
- `@oh-my-pi/pi-utils` and flat subpaths such as `/dom`.
- `@oh-my-pi/pi-ai` for `completeSimple` and `@oh-my-pi/pi-agent-core` for `Tokenizer`.

Import describe builders (`node`, `col`, `md`, `span`, `text`, `kbd`) from `@oh-my-pi/pi-tui`. Reuse native helpers such as `actionButton`, `hintsRow`, `formTheme`, and the keybinding matchers. Type-only imports such as `@oh-my-pi/pi-tui/tools/renderer` do not need a registry entry. The registry does not serve `@oh-my-pi/pi-catalog`; `omp/extensions/codex-images.ts` implements the pieces it needs.

### Development commands

Run these commands from `omp/`:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check   # SDK version check, then tsgo --noEmit
bun test
```

Use Bun for dependencies, scripts, tests, and the image codec (`Bun.Image`). There is no build, lint, or formatter. omp loads source directly. Start a fresh session after an edit because running sessions keep the definitions they loaded. To link the plugin from the intended live checkout, run `omp plugin link "$PWD"` from its `omp/` directory. For branch checks, use the isolated Verify skill instead.

From `omp/`, run `bun run update` when you intend to update both the installed omp and the SDK types. It requires an installed omp and restores the two `"latest"` specifiers after `bun update` rewrites them. `bun run check` warns and still typechecks if the installed version differs from `omp/bun.lock` or omp is missing. Both scripts use `omp/scripts/host-env.ts` to find the installed binary. A bare `omp` inside `bun run` can instead run the SDK's `node_modules/.bin/omp`, and Bun Shell ignores `.env()` PATH when resolving commands.

For host behavior, read `~/work/tries/oh-my-pi` at the `v<version>` tag matching `omp --version`. Its upstream is `can1357/oh-my-pi`. If code relies on undocumented host behavior, name the version on which you verified it.

### Code conventions

- Indent TypeScript with tabs. Use double quotes, semicolons, and trailing commas. Use camelCase for functions and locals and PascalCase for types. Use `import type` for SDK types and `with { type: "text" }` for prompts, as declared in `omp/extensions/assets.d.ts`.
- Keep state local to the initializer. Tool `execute` keeps `(toolCallId, params, signal, onUpdate, ctx)` and returns results shaped like native results. Pass `approval`, `concurrency`, and `mergeCallAndResult` on the tool definition.
- Propagate errors with an actionable message. An invalid image mode registers a tool whose calls fail; missing native delegation throws. Side question views turn failures into turn state for display.
- Pass the abort signal through the UI, mirror session, and HTTP. Clients combine it with a five-minute timeout. Throw `ToolAbortError` for a user abort and a plain `Error` for a timeout. Only a user's cancel in the Picker also calls `ctx.abort()` to end the main turn.
- Dispose per-load owners such as `PickerDraftSlot`, `BtwCycle`, and `LazySideQuestionThread` on session switch, branch, tree, and shutdown. Use `Symbol.for("omp-tools.*")` keys for state shared across module loads. Use types for wiring rules, as in `SideQuestionCacheKey` and `createMirrorSession`'s input.

### Testing

Run `bun run check` and `bun test` from `omp/` after code changes. The suite uses `bun:test` and `*.test.ts` files.

- `omp/test/support.ts` captures `registerTool` and `on` through `loadSession`, `loadTool`, and `fakeContext`. For `generate_image`, call `execute` with `spyOn(globalThis, "fetch")` and project settings in `.omp/plugin-overrides.json`. The Bun preload isolates the global omp home. Write global settings with `writeGlobalPluginSettings`. `loadTool` defaults to Codex mode, unlike the plugin. Avoid `mock.module` because it leaks into other test files.
- Before building fake TUI contexts, call `Settings.init({ inMemory: true })` and `initTheme()` in `beforeAll`.
- Use `omp/test/helpers/side-question-session.ts` for a real SDK mirror session against local SSE. It records requests, warnings, and recovery events for retries, fallbacks, and `/btw` follow-ups. The `toolCalls` and `tools` options run a real main turn whose tools return text or wait for `release()`.
- Use `omp/test/helpers/english-coach-session.ts` for the `input` handlers with a fake TUI context, local SSE, and the real model registry. Assert widget lines, provider requests, and ledger entries. Tests cover both `/btw` entry-point orders, but not terminal layout, deferred startup ordering, or correction quality with a real `@tiny` model.
- The [OpenAI live test](omp/test/generate-image-openai.live.test.ts) sends three paid requests: a still image with complexity, an SVG, and a GIF. It checks API results, not tool cards. With approval for paid requests and `OPENAI_API_KEY`, opt in with `OMP_TOOLS_LIVE_IMAGES=1 bun test live`.

For changes to registration, `ask`, the Picker, Side questions, the English coach, tool cards, or event handling, run a fresh-session smoke through [verify-omp-tools](.omp/skills/verify-omp-tools/SKILL.md). Use `PI_TUI_NATIVE=0` for the classic text renderer or RPC for checks without a screen. The five-tool limit, real panel and keys, and a kept Picker btw thread require live proof. Record each smoke in [the live proof log](omp/docs/agents/live-proof.md).

## Shared verification and change notes

Both Verify skills live in `.omp/skills/` and start isolated Tern instances through [tern-verify](.omp/skills/verify-tern-plugins/scripts/tern-verify). When a Tern update changes omp state, startup alerts, or isolation, update that launcher once for both profiles.

For user-visible changes to either host, update [README.md](README.md) and add an entry to [CHANGELOG.md](CHANGELOG.md#unreleased) under `[Unreleased]` with `Added`, `Changed`, `Fixed`, or `Removed` as appropriate. Update `omp/docs/agents/` when an omp-tools subsystem's design or host workaround changes.

For either host, use imperative sentence-case commit titles. Include the PR number on merge: `Claim the worktree branch atomically before a press adds it (#20)`.

## vstack

### Issue tracker

Issues live in the GitHub Issues of `daandden/tern-plugins`, and the skills use the `gh` CLI. See `docs/vstack/issue-tracker.md`.

### Code host

PRs live on GitHub in `daandden/tern-plugins`, and the skills use the `gh` CLI. See `docs/vstack/code-host.md`.

### CI service

Builds and checks run on GitHub Actions, and the skills use the `gh` CLI. See `docs/vstack/ci.md`.

### Triage labels

The repo uses the five default triage labels, and each label is the same as its role name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` and `wontfix`. See `docs/vstack/triage-labels.md`.

### Domain docs

The repo is single-context: one `GLOSSARY.md` at the repo root and the ADRs in `docs/adr/`. See `docs/vstack/domain.md`.
