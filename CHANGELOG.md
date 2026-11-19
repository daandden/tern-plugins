# Changelog

## [Unreleased]

### Changed

- Moved the five Tern plugins to `tern/<id>/` and brought `omp-tools` into
  `omp/`. Plugin IDs, settings, and keybinds did not change.

From the checkout you intend to use, unlink the old Tern plugins first. If you
linked only some of them, run `tern plugin unlink` only for those IDs. Then link
all five to their new folders:

```sh
for id in goto zellij-keys vstack-flow reader-terminal-text toast-above-browser; do
	tern plugin unlink "$id" || break
done
```

```sh
for id in goto zellij-keys vstack-flow reader-terminal-text toast-above-browser; do
	tern plugin link "$PWD/tern/$id" || break
done
tern plugin reload
tern plugin list
```

Check that all five show `ready`. For `omp-tools`, install the dependencies and
replace the existing link, then start a new omp session:

```sh
(cd omp && bun install --frozen-lockfile --ignore-scripts) &&
	omp plugin link "$PWD/omp"
```

See the [omp-tools changelog at the imported commit](https://github.com/daandden/omp-tools/blob/68758b246ca70d30f36574330774bba1bd8ca455/CHANGELOG.md) for earlier changes.
