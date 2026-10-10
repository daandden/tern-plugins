# Tern plugins

Custom plugins for [Tern](https://github.com/stencil-hq/tern-sdk). Each top-level folder other than `bin/` and `docs/` is one plugin. A plugin folder has a `plugin.toml` manifest and a `window.luau` script, and the folder name is the plugin `id`.

## Plugins

| Plugin | What it does |
| --- | --- |
| `zellij-keys` | Adds Zellij actions that Tern has no built-in command for: floating panes, floating Yazi, lazygit and btop, breaking a pane out to a tab, and focus moves between panes and tabs. |
| `goto` | Opens a picker of sessions, tabs and agent panes. Type to search, or type a jump number to go to a row. The panes that wait for you show at the top. |
| `html-links` | Opens every local HTML file as the rendered page in a browser pane beside the pane that opened it. Web links to this machine stay in Tern, and other web links open in Microsoft Edge. Cmd+R reloads the page. |
| `nvim-files` | Opens local text and code files in Neovim in a terminal pane, not in Tern's code view. Markdown, notebooks, images, PDFs, databases and binary files stay in Tern. |
| `reader-terminal-text` | In the Reader chat style, gives omp's text the font size and row height of the terminal. The plugin is CSS only. |

`bin/open` replaces the macOS `open` command in a Tern pane. `open FILE...` with only local files opens each file in Tern beside the pane that ran the command. Every other call goes to `/usr/bin/open`.

## Requirements

- Tern and its `tern` command.
- Neovim, Yazi, lazygit and btop in `/opt/homebrew/bin`, for `nvim-files` and the float commands of `zellij-keys`.
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

An edit to a plugin folder is the live plugin after `tern plugin reload`.

## Keybinds

This repo does not hold the Tern configuration file. `~/.config/tern/settings.json` binds a plugin command as `plugin.<plugin id>.<command id>`, for example `plugin.zellij-keys.toggle_float` or `plugin.goto.open`. Open `keybinds.html` for the full guide to the keys, grouped by Zellij mode.

## Development

Run `tern plugin types <folder>` to write `<folder>/tern.d.luau`, the type definitions of the Tern Luau API for luau-lsp. The file comes from the installed Tern version, so git ignores it.

`AGENTS.md` gives the conventions and the details of each plugin. `GLOSSARY.md` defines the terms, and `docs/adr/` holds the architecture decisions.
