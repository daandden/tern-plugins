# Tern plugins

Custom plugins for [Tern](https://github.com/stencil-hq/tern-sdk). Each top-level folder other than `bin/` and `docs/` is one plugin. A plugin folder has a `plugin.toml` manifest and a `window.luau` script, and the folder name is the plugin `id`.

## Plugins

| Plugin | What it does |
| --- | --- |
| `zellij-keys` | Adds Zellij actions that Tern has no built-in command for: floating panes, floating Yazi, lazygit and btop, breaking a pane out to a tab, and focus moves between panes and tabs. |
| `goto` | Opens a picker of sessions, tabs and agent panes. Type to search, or type a jump number to go to a row. The panes that wait for you show at the top. The picker follows Tern's glass palette dimming. |
| `html-links` | Renders local HTML files opened through Files, the palette or `tern open` beside their opener. Clicked `file://` HTML links use Tern's renderer. Web links to this machine stay in Tern; other web links open in Microsoft Edge. Cmd+R reloads the page, or runs the active SQLite view's refresh or Execute action. |
| `nvim-files` | Opens local text and code files in Neovim in a terminal pane, not in Tern's code view. Markdown, notebooks, images, PDFs, databases and binary files stay in Tern. |
| `reader-terminal-text` | In the Reader chat style, gives omp's text the terminal's font size, row height and weight. Preserves the UI font and Markdown theme colours, and hides the empty composer's placeholder. The plugin is CSS only. |

`bin/open` replaces the macOS `open` command in a Tern pane. `open FILE...` with only local files opens each file in Tern beside the pane that ran the command. Every other call goes to `/usr/bin/open`.

Verified with Tern 0.9.7 and omp 18.13.3. nvim-files remains needed because the native code view still ignores the line-height setting.

Known limitation: clicking a native edge handle can preview a moved float at its cascade position. Focusing it or pressing Alt+F restores its saved position. [Issue #8](https://github.com/daandden/tern-plugins/issues/8) tracks checking this after a later Tern update.

## Requirements

- Tern and its `tern` command.
- Neovim, Yazi, lazygit and btop in `/opt/homebrew/bin`, for `nvim-files` and the float commands of `zellij-keys`.
- Git and GNU coreutils' `gtimeout` in `/opt/homebrew/bin`, for the worktree-agent shortcut's fetch deadline.
- The font `Symbols Nerd Font`, for the status marks of `goto`.
- Microsoft Edge, for web links from `html-links`.

## Install

Tern loads each plugin from its folder in this repo. Run these commands from the root of the repo:

1. Link each plugin folder into the plugins directory of Tern (`~/.config/tern/plugins`):

   ```sh
   for d in goto html-links nvim-files reader-terminal-text zellij-keys; do
     tern plugin link "$PWD/$d"
   done
   ```

2. Load the plugins with `tern plugin reload`. The command exits with code 1 if a plugin fails to load.
3. Run `tern plugin list` and make sure that each plugin shows `ready`.
4. If you want `bin/open`, link it into a directory that comes before `/usr/bin` in your `PATH`:

   ```sh
   ln -s "$PWD/bin/open" ~/.local/bin/open
   ```

Tern reloads linked plugins when a file in their checkout changes. Use `tern plugin reload` and `tern plugin list` to check that every plugin loaded.

## Keybinds

This repo does not hold the Tern configuration file. `~/.config/tern/settings.json` binds a plugin command as `plugin.<plugin id>.<command id>`, for example `plugin.zellij-keys.toggle_float` or `plugin.goto.open`. Open `keybinds.html` for the full guide to the keys, grouped by Zellij mode.

Ctrl+Shift+T opens an omp tab in a new worktree based on the repository's default branch. Your original checkout can stay on a feature branch, but it must have no uncommitted changes. The shortcut fetches the default branch and uses its remote commit, or the cached remote commit if the fetch fails.

These worktrees remain after you close the agent. They are created before omp starts, so omp's `worktree.onExit` cleanup does not own them. Remove a finished worktree explicitly with `git worktree remove <path>`.

## Development

Run `tern plugin types <folder>` to write `<folder>/tern.d.luau`, the type definitions of the Tern Luau API for luau-lsp. The file comes from the installed Tern version, so git ignores it.

`AGENTS.md` gives the conventions and the details of each plugin. `GLOSSARY.md` defines the terms, and `docs/adr/` holds the architecture decisions.
