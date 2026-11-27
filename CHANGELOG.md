# Changelog

## [Unreleased]

### Added

- omp's `worktree.onExit` now applies to the worktree of a Ctrl+Shift+T agent tab, as it
  does to a `/wt` worktree. With `ask`, quitting that omp shows omp's "Remove worktree?"
  prompt. omp-tools adds the `--own-worktree <commit>` flag that the tab's omp gets, so
  the tab needs omp-tools linked.
- Added the Ask card with multiline Notes, pasted pictures, and a General note (`Shift+N`).
  Press `?` in the card (`Alt+/` while typing) to ask a Side question in the same thread. Tern's
  enhanced image paste does not reach the Ask card on omp 19.2.1; use the
  clipboard image key or paste an image path instead.
- Added Coach memory and the `/english-coach` dashboard for recurring mistakes,
  progress, and practice. The correction panel stays hidden when there is no correction.

### Removed

- Removed the `toast-above-browser` Tern plugin. Since Tern 0.9.33, browser pages no
  longer cover toasts, so toasts stay at the bottom. Run `tern plugin unlink toast-above-browser`.

### Fixed

- omp-tools loads again on omp 19.2, which replaced pi-tui's component API. `generate_image`,
  `/btw`, and the English coach failed to load there. Their cards and panels now draw with
  omp 19.2's reactive pi-tui nodes. Esc in a `/btw` or English coach panel now leaves a
  native `ask` form and tool approval prompts alone, and never counts Ctrl+C. The
  generate_image facts line sits under omp's own card head.
- The English coach no longer fails with "Check failed: unreadable reply" on a prompt of
  several paragraphs. The coach model often keeps the paragraph breaks in its rewrite,
  and the reply is now read with them.

### Changed

- `/btw` matches native `/btw` in a plain terminal. In Tern, the Side question and
  English coach panels use the native note look.
- The `/btw` note in Tern is easier to read. The answer uses the main text color at
  14px, the question wraps to two lines, and earlier turns fold to one line each.
  The note's controls stay visible, and a footer names the keys. Press `e` (F6 while
  an Ask card waits), or the expand control, to read the whole thread in a larger view.
  When both the `/btw` and English coach notes show, a 10px gap now separates them.
- In Tern, `/english-coach` opens as a centered popup with stat cards, a focus card,
  ranked rule rows, a word diff of your example and large practice choices. Clicks on
  cards, rows and buttons do what their keys do. `p` on the home page practices the
  focus rule. A plain terminal keeps the full-screen text dashboard.

- Checked the plugins against Tern 0.9.34 and omp 19.1.1. In Reader, the composer bar's
  branch, changes, and pull request now use the terminal's text size and row height.
- Native `ask` follows the terminal's text settings in Reader and aligns open
  and folded question labels. The card has shorter choice rows and less
  vertical padding. The native colors and button sizes stay the same.
- `/btw` uses the main session's Keenable MCP search and fetch tools instead
  of `web_search`. If either Keenable tool is missing when the thread starts,
  `/btw` offers only the enabled file tools.
  Tools announced during a Side question's Keenable call stay out of the main agent's roster.
- Go to uses Tern's `waiting_input` status for a waiting native `ask`. The
  `/btw` and English coach panels do not count as waiting for input.
- Checked the plugins against Tern 0.9.30 and omp 19.1.0. With omp 19.1,
  `generate_image` can run as a command inside `bash`, and its approval still
  shows the mode. The README now says so.
- Moved the five Tern plugins to `tern/<id>/` and brought `omp-tools` into
  `omp/`. Plugin IDs, settings, and keybinds did not change.

From the checkout you intend to use, replace the old Tern links and check their
targets before the final reload. The command stops at the first failure:

```sh
(
	links=$(tern plugin dir) || exit
	for id in goto zellij-keys vstack-flow reader-terminal-text toast-above-browser; do
		link="$links/$id.path"
		if [ -f "$link" ]; then tern plugin unlink "$id" || exit; fi
		target=$(realpath "$PWD/tern/$id") || exit
		tern plugin link "$target" || exit
		test "$(realpath "$(cat "$link")")" = "$target" || exit
	done
	tern plugin reload && tern plugin list
)
```

Check that all five show `ready`. Install the `omp-tools` dependencies, then
replace and verify its link before starting a new omp session:

```sh
(
	cd omp &&
		bun install --frozen-lockfile --ignore-scripts &&
		target=$(pwd -P) &&
		omp plugin link "$target" &&
		test "$(realpath "$HOME/.omp/plugins/node_modules/omp-tools")" = "$target"
)
```

See the [omp-tools changelog at the imported commit](https://github.com/daandden/omp-tools/blob/68758b246ca70d30f36574330774bba1bd8ca455/CHANGELOG.md) for earlier changes.
