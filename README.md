# Tern plugins

Custom plugins for [Tern](https://github.com/stencil-hq/tern-sdk). Each top-level folder other than `bin/` and `docs/` is one plugin. A plugin folder has a `plugin.toml` manifest and a `window.luau` script, and the folder name is the plugin `id`.

## Plugins

| Plugin | What it does |
| --- | --- |
| `zellij-keys` | Wraps native show-all and stash-all across tabs, keeps focus among shown floats when one closes, opens floating Yazi, lazygit and btop, grows or shrinks a float, breaks a pane out to a tab, and moves focus between panes and tabs. Tern draws and moves the floats natively. |
| `goto` | Opens a picker of sessions, tabs and agent panes, drawn by Tern's own picker node. Type to search, or type a jump number to go to a row. The panes that wait for you show at the top, and agent rows show how long they have been working or waiting. The picker follows Tern's glass palette dimming. |
| `reader-terminal-text` | In the Reader chat style, gives omp's prose, composer, advisor notes, notices, and tool-result prose the terminal's font size, row height, and weight. Single-line chrome uses the terminal size and row height with Reader's own weights. Preserves the UI font and Markdown theme colours, hides the empty composer's placeholder, and hides empty dock regions, which would leave blank rows above the composer. The plugin is CSS only. |
| `vstack-flow` | A Cmd-click on a vstack Flow link opens the Flow page in Tern beside the pane that holds the link, or goes to the clicked question in the tab's open page of that Flow. Every other web link, and Cmd+⌥-click, follows Tern's link setting. |

The Go to picker marks omp's `/pause` with a still, muted pause glyph. Paused panes join Waiting on you after done and before idle, even when idle rows are hidden. They show no time. Resume in omp to restore the pane's other status; working time still counts from the turn's start, pause included. Paused goal, loop and plan modes and Ctrl+Z do not count as `/pause`.

`bin/open` replaces the macOS `open` command in a Tern pane. For `open FILE...` with only local files, it runs `tern open` for each file beside the pane that ran the command. HTML opens as source. Every other call goes to `/usr/bin/open`. Web links other than Flow links follow Tern's `link_target` setting, and Cmd+R uses Tern's own action.

Verified with Tern 0.9.8. Text and code files use Tern's native code view, which now follows the line-height setting.

## Requirements

- Tern and its `tern` command.
- Yazi, lazygit and btop in `/opt/homebrew/bin`, for the float commands of `zellij-keys`.
- Git and GNU coreutils' `gtimeout` in `/opt/homebrew/bin`, for the worktree-agent shortcut's fetch deadline.

## Install

Tern loads each plugin from its folder in this repo. Run these commands from the root of the repo:

1. Link each plugin folder into the plugins directory of Tern (`~/.config/tern/plugins`):

   ```sh
   	for d in goto reader-terminal-text zellij-keys vstack-flow; do
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

When upgrading from a version with `nvim-files` linked, run `tern plugin unlink nvim-files` before reloading. Tern 0.9.8 fixes the native code-view line-height limitation, so the Neovim routing plugin has been removed.

## Keybinds

This repo does not hold the Tern configuration file. `~/.config/tern/settings.json` binds a plugin command as `plugin.<plugin id>.<command id>`, for example `plugin.zellij-keys.float_yazi` or `plugin.goto.open`. Open `keybinds.html` for the full guide to the keys, grouped by Zellij mode.

Ctrl+Shift+T opens an omp tab in a new worktree based on the repository's default branch. Your original checkout can stay on a feature branch, but it must have no uncommitted changes. The shortcut fetches the default branch and uses its remote commit, or the cached remote commit if the fetch fails.

These worktrees remain after you close the agent. They are created before omp starts, so omp's `worktree.onExit` cleanup does not own them. Remove a finished worktree explicitly with `git worktree remove <path>`. When the worktree cannot be added, for example because a hook of the repo fails, the error toast names the cause, and the shortcut removes the new worktree folder. It then deletes the new `wt/<time>` branch only if the branch still points at the commit it was made at. A cleanup step that fails or refuses shows a second toast.

## Development

Run `tern plugin types <folder>` to write `<folder>/tern.d.luau`, the type definitions of the Tern Luau API for luau-lsp. The file comes from the installed Tern version, so git ignores it.

`AGENTS.md` gives the conventions and the details of each plugin. `GLOSSARY.md` defines the terms, and `docs/adr/` holds the architecture decisions.
