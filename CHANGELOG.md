# Changelog

## [Unreleased]

### Removed

- Removed the omp-tools Picker and its `ask` override. omp now answers all `ask`
  calls, `/tree` re-answers, and host dialogs. Saved results are unchanged.

### Changed

- Ask `/btw` from the composer while a native `ask` waits. Return to the form with Shift+Tab.
  Panel shortcuts leave form keys alone, even if you return before the panel opens.
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
