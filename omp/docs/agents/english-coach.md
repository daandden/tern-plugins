# English coach

- `englishCoach` defaults to `true`, `englishCoachMaxTokens` to `300`, and
  `englishCoachLanguage` to `Vietnamese`. Read them through
  `getPluginSettings("omp-tools", ctx.cwd)` at session start and on session
  switch. A non-positive or non-number limit, or an empty or non-string
  language, warns once and disables coaching for that session. The language
  fills `{{language}}` in `english-coach.md`: pattern names come in it, the
  rewrite stays English.
- Only interactive input to the main agent in a TUI with a UI qualifies.
  The observer returns no handled result and never changes the prompt.
  Slash commands qualify only for sentence arguments after `/btw`,
  `/skill:<name>`, and prompt-file names discovered once per session.
- `english-coach-input.ts` shares the observation channel under
  `Symbol.for("omp-tools.english-coach-input")`. `/btw` forwards a consumed
  line through it, and the observer deduplicates the two delivery paths.
  Manifest order alone is insufficient because OMP 18.20.3 can defer
  unchanged entry points.
- The pure preparation module replaces fenced code, inline code, paths, and
  URLs with numbered placeholders. Only the remaining text counts toward
  the token budget. `checkCoachPlaceholders` refuses a rewrite that drops,
  repeats, reorders, or invents a placeholder.
- `english-coach-diff.ts` splits the prepared prompt and the rewrite at
  their placeholders, which must match in order, and diffs only the prose
  between them by token (words, punctuation, whitespace of any kind
  matching), so each protected text shows once. It returns `CoachSegment`
  lines: kept, `del`, `ins`, `punct`, and protected (each placeholder's
  protected text, a fenced block as one `[code block, N lines]`), plus the
  reported mistakes with placeholders shown. Line breaks come from the
  prompt. Word changes join across the whitespace between them; a
  punctuation change stands alone. Tokens that differ only in case match, so
  the prompt's casing stays, and `replyView` drops case-only mistakes (none
  left is `no mistakes`): the coach never corrects capitalization, and
  `english-coach.md` also tells it to leave technical terms as written.
  Each change's parts share a `change` id. The panel associates the reported
  mistakes with edits by their positions in the original prompt. Coach memory
  uses a stricter match: the reported original and corrected spans must both
  touch the same diff run.
- The widget opens above the editor only when there's a correction. Tern
  uses the shared note frame with the `coach` tag, a diff, and an optional
  recurring-rule cue. Explanations appear only on the changed text's hover
  card. A plain terminal strikes deletions, colors insertions, and lists
  every reported mistake on a separate line below the diff. Both renderers
  use the `omp-tools.panel-body` scroll box, capped at 40% of terminal rows.
- Resolve `@tiny` through `ctx.models.resolve`, refresh its named providers
  once if unresolved, and obtain the credential from the model registry.
  Missing model or credential warns once and disables coaching. There is
  no main-model fallback.
- One background `completeSimple` invocation per checked prompt requests
  reasoning disabled and caps output at twice the limit plus 200 tokens.
  The helper can retry stalled attempts. Each attempt records `model_usage`
  with purpose `english-coach` on the initiating live session, guarded
  against a changed session. No correction becomes a conversation message.
- The model returns a stable rule ID per reported fix. Localized explanations
  are display text only. Missing or unknown IDs count as unclassified.
- `coach-memory.ts` owns the SQLite store at `coach/memory.sqlite` in the
  global omp configuration root. Checked English prompts, including clean
  prompts, form the denominator. Rewrites, full prompts, and session or
  project identities are not stored. An example, when safe to keep, contains
  only the words near a validated edit. When storage fails, corrections
  still show and the dashboard reports memory as unavailable.
- A recurring-rule cue appears once per local day per rule, when the rule
  occurred in at least three distinct checked prompts over seven days.
  `/english-coach` shows the observed frequency, weekly comparisons,
  recommended or pinned focus, rule examples, and local practice. It makes no
  model calls. Confirming reset clears all panes' memory; generation checking
  stops in-flight pre-reset checks from refilling it.
- `app.interrupt` (Esc) closes the panel only while the main editor is
  empty and no omp `ask` form or tool approval prompt waits. omp 19.2 tells
  extensions nothing about focus, and its composer takes `app.interrupt`
  first, so the coach reads raw input through `ctx.ui.onTerminalInput` and
  watches the `ask` tool's execution events and the tool approval events
  (`trackHostDialogs` in `panel-layout.ts`). Ctrl+C never counts. omp 19.2.1
  drops every extension's terminal input listener before a new session,
  branch, or fork, so the coach listens again on `session_branch` as well as
  on start and switch. An `ask` that `/tree` re-opens runs without tool
  events, so there the first Esc can close the panel instead of reaching the
  form. Clicking Close in Tern or dismissing the panel with the interrupt key
  doesn't reject a stored fix. Mark false positives from the dashboard.
- Every interactive submission clears the previous correction and aborts an
  unfinished check. Session switch, branch, tree, and shutdown do the same.
  Failure notices are separate from the correction panel and never reject
  input dispatch.
