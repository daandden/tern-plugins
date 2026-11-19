# One repo for Tern and omp plugins, grouped by host

The omp plugin omp-tools lived in its own repo, `daandden/omp-tools`, while `goto` here already read omp-tools' list roles and both repos' Verify skills had to seed the same omp state. omp-tools moves into this repo, and `daandden/omp-tools` is archived. Plugins are grouped by the host that loads them: each Tern plugin sits in `tern/<id>/`, and omp-tools sits directly in `omp/`, with its own `package.json`, so `omp plugin link` takes `omp/`. The plugin keeps the id `omp-tools`, so its settings and roles do not change. The repo has one glossary, one ADR folder, one AGENTS.md, one README, and one CHANGELOG for both hosts.

The omp-tools history is not imported. It comes over as one commit, and its commits, PRs, and old changelog stay readable in the archived repo. Its three numbered ADRs become 0002 to 0004 because their numbers clash with ADR 0001 here.

## Considered options

- omp-tools beside the Tern plugins at the top level, or in `omp/omp-tools/`. Both lost to a layout that gives each host one folder. A second omp plugin would need `omp/` to gain a subfolder per plugin.
- Splitting omp-tools into one omp plugin per tool. It would move every setting to new plugin ids and needs a shared module for the Side question and Picker code.
- Rewriting the omp-tools history into the new folder, or a subtree merge. The history is not needed here, and the archive keeps it.
- Separate glossaries and ADR folders per host. One glossary keeps one vocabulary; Picker and Go to picker stay apart through the glossary's Avoid lists.
