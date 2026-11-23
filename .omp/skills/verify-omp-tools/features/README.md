# omp-tools verification map

Read the feature file for the surface you changed. Commands use the run dir and `$C` control wrapper from [the parent skill](../SKILL.md).

## Baseline preconditions

- Run Doctor in [the parent skill](../SKILL.md). Record the branch SHA and the linked `omp/` directory or explicit entry paths.
- Start the headless instance through `tern-verify`. Start a fresh omp session with `--session-dir "$VERIFY_RUN_DIR/data/sessions"`.
- Before a Side question, send one main prompt (`Reply with only: ok`) and wait for the reply so the main session has a saved transcript.
- Never drive a Tern window or OMP session this run did not start.

## Driving conventions

- Start each recipe from the baseline unless its preconditions say otherwise.
- Prefer `$C tree` text and CSS classes from the layout JSON over screen coordinates.
- Clear the editor before using keyboard shortcuts for the `/btw` panel or English coach.
- Treat every command as literal. Keep the double quotes inside single quotes for `type` and `run`.
- After a code change, start a new OMP session; a running one keeps the old code.

## Proof and skip reporting

- Capture the action and the resulting state: a shot before and after, plus a second view (session JSONL, files on disk, or `$C tree`).
- Read the lossless WebP that `"$V" shot "$VERIFY_RUN_DIR" NAME` writes.
- Record the feature ID, entry point (Tern view, classic TUI, or RPC), and evidence path in `notes.md`.
- A check that could not run is reported with the command and the unmet precondition. A check proven through one entry point does not prove another (Tern view and classic TUI are separate entry points).

## Feature entry contract

Each feature file starts with an H1 title and one paragraph of user-visible behavior, then four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with tern ctl`, `Gotchas`.

## Features

- [Side question with /btw](./side-question-btw.md): answer with read-only tools, the tool-call fold, follow-ups, cancel, the thread ending at the next main prompt, and the thread's start from the saved transcript.
- [Native ask](./native-ask.md): load the three plugin extensions, answer a native form in both renderers, and answer the same form again from `/tree` using a local provider.
- [generate_image](./generate-image.md): the shared schema with per-call `mode`, generations and edits in each Image generation mode (OpenAI mode also `n`, formats, streaming, and masks), the tool card naming the mode, and the approval prompt.
- [English coach](./english-coach.md): private corrections, clean and over-limit prompts, protected fenced pastes, `/btw` delivery, skipped commands, and the panel height cap, with an isolated local provider in both renderers.
