# Retire the Picker; native ask answers every ask

ADR 0004 kept the Picker because native `ask` lacked Notes, Other answers, pictures and drafts. omp 19.0 and 19.1 added option Notes with pasted images, an Other answer on every choice group, preselected recommendations, pictures, validation and timeouts, and moved the ask into an inline card with the composer still under it. omp-tools now removes its `ask` override, the Picker, the Picker draft, Picker btw and its `askDialog` route, so native `ask` and omp's own dialogs answer every question. Keeping the Picker meant about 3,500 lines that had to follow each omp release, and it took the composer, so a message or `/btw` could not be sent while it waited.

## Consequences

- Lost with the Picker: Notes on unpicked options, the Submit note, images outside option Notes, the Picker draft and its F5 restore, and a Side question that sees unsent picks. Old Picker result cards may show less, because the native card reads only answers, notes and `timedOut`.
- `/btw` from the composer answers while a native `ask` waits. Its Side question sees the pending call's questions, not the user's unsent picks.
- Go to relies on the waiting status native `ask` reports, not on a Picker role.
- `/tree` re-answer, host dialogs such as Ratchet approvals, and new asks all show the same native UI.

## Considered options

- Keep the Picker. Rejected: its remaining answer channels did not justify its upkeep or the blocked composer.

ADR 20261126-omp-tools-owns-ask-again supersedes this decision for the `ask` tool: omp-tools answers `ask` with its own card again. Other host dialogs stay native.
