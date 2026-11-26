# The English coach keeps a global Coach memory, not a conversation

The user wants the English coach to remember every mistake across all sessions and projects, count how often each one recurs, suggest what to practice, and show this in a dashboard. Each check stays one `@tiny` call per prompt, which also names a rule from a fixed list for each fix. Coach memory keeps every validated fix with its rule, date and short before-and-after words in one private store under the user's omp home, never whole prompts. A fixed rule list keeps "the same mistake" comparable across models, projects and display languages.

## Considered options

- A long-lived coach agent session with recent history. Rejected by the user: it remembers recent prompts, not every mistake.
- Adaptive groups built from the edits themselves, merged or split by the user. Rejected: counts move when groups change, and the grouping becomes the user's work.
- Counts only, without the user's words. Rejected by the user: the dashboard should show real examples. omp already keeps full prompts in its session files on the same machine.

## Consequences

- Changing the rule list later can split history counted before the change.
- Reset deletes the counts and the stored words; it does not touch omp's session files or what the model provider received.
