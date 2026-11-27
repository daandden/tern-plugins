# Live proof

Dated results from the `verify-omp-tools` and `verify-tern-plugins` skills, newest first. Add an entry after each smoke: the host versions, what was driven, what was observed, and the evidence path.

- 2026-11-27, omp 19.2.1 and headless Tern 0.9.36, local coach provider, Tern
  view: the `paragraphs` scenario (`it not work.` and `she have same
  problem.` in two paragraphs, a reply whose rewrite keeps the blank line)
  showed one correction marking both paragraphs and no `unreadable reply`
  warning, with one tiny request. `correct` showed no panel and `mistakes`
  still drew the long correction. Evidence:
  `/tmp/coach-paragraphs-fLKdWk/coach-paragraphs.webp`, `coach-correct.webp`,
  `coach-mistakes.webp` and `notes.md`.
- 2026-11-27, omp 19.2.1 and headless Tern 0.9.36: with the `btw` coach
  scenario showing the `/btw` note above the coach note, `$C dump
  "[data-role='omp.btw.note']"` gave rects ending at y 406.25 and starting at
  416.25, a 10px gap; before the change they touched at 411.25. Evidence:
  `/private/tmp/coach-look-qqPD4Z/gap-before.webp` and `gap-after.webp`.
- 2026-11-27, omp 19.2.1 and headless Tern 0.9.36 (dark, `dark-catppuccin`,
  IosevkaTerm Nerd Font Mono at 600), with the local coach provider. In the
  Tern view, `/english-coach` opened as a centered popup with the Checked,
  Clean, Weeks and Trend cards, the Articles focus card (Open, Practice `P`)
  and three ranked rule rows. Enter opened Articles with its explanation and
  the `add button` → `add the button` diff marking `the`; `p` showed the
  two choice cards, and `2` marked `an` and showed `Correct` with the next
  practice date. A `/btw` follow-up showed the tag pill, the earlier turn
  folded to one line, the answer in the bright text color and the private
  footer; `e` opened the `Side question · 2 turns · private` popup, and Esc
  closed it and left the note. With `PI_TUI_NATIVE=0`, the dashboard stayed
  full-screen text, the `/btw` box showed `e to read all`, `e` opened the
  `/btw · 1 turn` sheet, and Esc closed it and left the box. Evidence:
  `/private/tmp/coach-look-qqPD4Z/new-home.webp`, `new-rule.webp`,
  `new-practice.webp`, `new-feedback.webp`, `btw-new2.webp`,
  `btw-reader.webp`, `btw-after.webp` and `classic-*.webp`. After the
  sheet fixes, `new-feedback2.webp` showed a correct choice on a green
  card, and `new-home2.webp` labeled the Weeks rows `Nov 16` and `Nov 9`.
- 2026-11-26, omp 19.2.1 and headless Tern 0.9.36: in the Ask card on an
  option, the Tern view's General note button showed `⇧N` and Shift+N opened
  the General note editor; with `PI_TUI_NATIVE=0` the footer read
  `⇧N General note` and Shift+N opened the `General note` editor. Evidence:
  `/private/tmp/ask-look-SjGXjE/classic-n0.webp` and `classic-n1.webp`.
- 2026-11-26, omp 19.2.1 and headless Tern 0.9.36, checkout a98698e plus the
  `?` change: in the Ask card's local Side-question form, `?` on an option opened
  an empty Side question editor; `Read the local fixture` and Enter showed the
  `btw` panel with one tool call and `Local Side read answer.` above the card,
  which stayed open at 0 of 3 answered. With `PI_TUI_NATIVE=0`, the footer
  read `? Side question`, `?` opened an empty `Side question` editor
  (`Enter ask · Esc back`), and the same question showed the
  `/btw Read the local fixture` box with `Local Side read answer.` above the
  open card. Evidence: `/private/tmp/ask-look-SjGXjE/side-q.webp`,
  `classic-side.webp` and `classic-answer.webp` there.
- 2026-11-26, issue #48 on omp 19.2.1 and Tern 0.9.35. Both renderers
  opened the Ask card, then saved separate two-line option and General
  Notes with two WebP image blocks from pasted paths. `/tree` reopened
  native Ask in both renderers and saved Red beside Blue with the same
  parent and call IDs. Go to reported `waiting_input` and displayed the
  waiting mark until the Ask card settled. Tern showed a Side answer and
  its follow-up above the open Ask card, and a clean English prompt
  without a coach panel. Classic showed the Articles cue after the third
  correction, the ranked rule, recorded examples, and practice feedback.
  An approved real `@tiny` request classified the synthetic correction
  `add dashboard` to `add the dashboard` as Articles. The probe's narrower
  span check rejected that reply. The classic fixture replayed the same
  reply through the plugin and showed the recorded example.
  The isolated terminal driver could not reproduce the system clipboard
  event. omp 19.2.1's enhanced image router requires a native paste target,
  which `ui.custom` does not expose. The clipboard image key has a test
  with a synthetic clipboard reader; the live Notes used path paste.
  Evidence is under
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/verify/01a215f2-368d-752f-82b4-7b74b407d0b4/`
  in `omp-tools-ask-tern-XihwQH`, `omp-tools-ask-classic-605n7j`,
  `omp-tools-waiting-Y2kNlt`, `omp-tools-coach-tern-I1NrSd`, and
  `omp-tools-coach-classic-WXZdbe`.
  The first independent verifier found overlap with a long Side question
  in a 340 by 620 Tern pane. After the repair, both 340 and 320 px widths
  kept the Side note separate from the Ask card. A five-line General note
  and the Save and Submit buttons stayed usable at 320 by 620. See
  `omp-tools-narrow-repair-okVNk1/repaired-{340,320,edit-320,submit-320}.webp`
  and `narrow-result.jsonl` under the same evidence directory.
- 2026-11-26, omp-tools on omp 19.2.1 (issue #45) with Tern 0.9.35, local
  fixtures only. An isolated omp home linked to the base checkout logged
  three `Failed to load extension` lines; linked to the branch it loaded
  `btw.ts`, `english-coach.ts`, `generate-image.ts` and `own-worktree.ts`
  with none. In the Tern view and the classic terminal: the English coach
  showed corrections, `No mistakes`, its height cap and closed on Esc (and
  on the keycap in Tern); `/btw` answered with one tool call, `t` folded it
  only with an empty composer, and Esc cancelled and closed; with a native
  `ask` form open, Esc moved focus to the composer and left the form and the
  `/btw` panel open. The first classic drive found the coach drawn as an
  empty `/btw` box and per-word correction rows that did not wrap; after the
  fix both drew. In Tern a `generate_image` card showed `OpenAI mode ·
  256x256 · quality low`, a linked WebP path and the image. Not run: a real
  image endpoint and a real `@tiny` model. Notes: `notes.md` under
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/verify/01a21423-3421-738d-8399-36e8594b1b1b/`
  (`load-red-QoyU1X`, `load-green2-bUzuGR`) and its `verify/` runs
  `omp-tools-Q5j5kp`, `-QK8BP2`, `-QyrXct`, `-pVLske`, `-JBtKqy`,
  `-xr7zkC`, `-alo7Io` and `-AAz4Lg`.
- 2026-11-25, Tern 0.9.34 and omp 19.1.1 compatibility, isolated native
  windows with local fixtures only. Smoked goto, zellij-keys, native files,
  vstack-flow and reader-terminal-text. Skipped: the goto veil cost at
  100,000 nodes (the transcript reached 10,988), the hand-made pause
  precedence matrix, the empty dock-gap region, and Flow links from omp's
  popup, plain terminal text and OSC 8. After ctrl+; and `a` with a Waiting
  on you row, Go to left a stale `Default` row with `aria-selected=true`;
  only the cursor's row was painted and Enter followed it. The native ask
  card kept 328.5px and 26px choices, and `/tree` re-answered it. The
  composer bar's `omp.composer.fact` segments were 11.5px and 11px; with the
  new rule they are 13px on 16.5px rows inside the 32px bar. With the
  toast-above-browser sheet dropped, a bottom toast showed over a live page,
  so the plugin was removed. Notes: `notes.md` under
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/verify/` runs
  `tern-plugins-HxmmlW`, `-okZs8U`, `-ZaCXDT`, `-0jdHTQ`, `-KPhLIH`,
  `-szlGc5` and `-PtF8pI`.
- 2026-11-23, compact native `ask` on omp 19.1.1 and isolated native Tern
  0.9.30. The three-question card went from 426 to 328.5px at 13px text,
  and single-line choices went from 36 to 26px. In a 319px pane, keyboard
  submission saved both choices, a typed answer, and a Note. See
  `ask-final.webp`, `ask-narrow-final.webp`, and `ask-result-final.json`
  under `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/verify/ask-compact-3HW2nO/`.
- 2026-11-23, native `ask` styling on omp 19.1.1 and isolated native Tern
  0.9.30. Open and folded question labels shared a left edge at 13px and
  16px. Choices and typed answers used terminal weight 600. At a pane
  width of 320px the actions wrapped and the form submitted by keyboard.
  See `ask-input-large.webp`, `ask-narrow.webp`, and `ask-result.json` under
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/verify/ask-css-hj4S1u/`.
- 2026-11-23, worktree exit for Ctrl+Shift+T on omp 19.1.1 in an isolated
  native Tern 0.9.30 window, with `worktree.onExit: ask`. In a fixture repo
  with no origin, the press opened a tab running
  `/opt/homebrew/bin/omp --own-worktree <commit>`. `/exit` showed omp's
  "Remove worktree?" prompt, and Yes removed the folder and the `wt/*` branch.
  After a commit in a second worktree, the prompt added "has new commits
  (branch is kept)", and Yes removed the folder and kept the branch at that
  commit. See `wt-prompt.webp`, `wt-after-yes.txt`, `wt-moved-prompt.webp`,
  and `wt-moved-after.txt` under
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/verify/tern-plugins-X9W76k/`.
- 2026-11-23, review-fix smoke on omp 19.1.0 in isolated headless Tern
  0.9.30. A native `ask` opened with a Blue pick and a Label draft. The
  local read answer appeared in `omp-tools.panel-body` while the ask
  stayed open. From the composer, `t` expanded and collapsed the tool
  section: the body's height changed from 78 to 98.5 and back to 78 px.
  The drive stopped before returning to the form because its text check
  included the collapsed tool row. See `form-draft.webp`, `side-answer.json`,
  `scroll-body.json`, and `fold-{open,closed}.json` under
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/implement-spec/20261123-retire-picker/review-fix/tern-5mkBGL/`.
- 2026-11-23, `/btw` Keenable roster (ticket #38): omp 19.1.0 in RPC,
  launched from isolated headless Tern 0.9.30, loaded the Side question
  probe. Its roster held `read`, `grep`, `glob`, `find`, and both Keenable
  MCP tools, with no `web_search`. The Side question read a local file.
  The installed host and the probe shared the MCP manager through the
  SDK `/mcp` export. See `tools.json`, `requests.jsonl`, and `notes.md` under
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/implement-spec/20261123-retire-picker/38/verify-omp-tools-jZaqdY/`.
- 2026-11-23, Go to with a waiting native ask (ticket #39): omp 19.1.0 and
  Tern 0.9.30 showed the unfocused `Pick a color` pane under Waiting on you
  with the warning mark and a waiting time. The raw agent list reported
  `waiting_input` for that pane with the picker open. See `ask-goto.webp`
  and `ask-agents-during-f1.json` under
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/implement-spec/20261123-retire-picker/39/goto-nSLovz/`.
- 2026-11-23, Go to with `/btw` during a held turn (ticket #39): omp 19.1.0
  and Tern 0.9.30 kept the pane `working` with the Side answer visible
  and no ask open. The pane showed only under Sessions with a working
  time. See `held-panel.webp`, `held-goto.webp`, and
  `held-agents-during-f1.json` under
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/implement-spec/20261123-retire-picker/39/goto-nSLovz/`.
- 2026-11-23, Go to with the English coach (ticket #39): omp 19.1.0 and
  Tern 0.9.30 showed the correction while the pane was idle. Go to gave
  the pane an Idle row and no needs-input mark or Waiting on you row.
  See `coach-panel.webp`, `coach-goto.webp`, and
  `coach-agents-during-f1.json` under
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/implement-spec/20261123-retire-picker/39/goto-nSLovz/`.
- 2026-11-23, Go to with the retired Picker list role (ticket #39): a
  local terminal fixture on Tern 0.9.30 reported `working` and sent the
  old list role. Go to classified it as waiting before the change and
  Working afterward. See `red-legacy.webp` and `green-legacy.webp` under
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/implement-spec/20261123-retire-picker/39/goto-nSLovz/`.
- 2026-11-23, `/btw` during native ask in Tern (ticket #37): omp 19.1.0
  and Tern 0.9.30 kept the inline form open through `/btw` and `?` with a
  local provider. The panel showed a `read` call. Shift+Tab returned to the
  text field, which received `t`. Esc moved focus to the composer and left
  the panel open. Submit returned the Blue pick, its Note, the Other answer,
  and the text field. The Side requests carried the pending call but none
  of the answers. Evidence:
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/implement-spec/20261123-retire-picker/37/tern-OjD9H7/`.
- 2026-11-23, `/btw` during native ask in the classic TUI (ticket #37):
  omp 19.1.0 with `PI_TUI_NATIVE=0` in Tern 0.9.30 answered both Side
  questions while the form waited. `t` folded the `read` call from the
  empty composer and entered text after Shift+Tab. Esc from the form
  kept the panel open. The same draft, with the extra `t`, reached the
  native `ask` result. No draft values reached the Side model. Evidence:
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/implement-spec/20261123-retire-picker/37/classic-VZwMTM/`.
- 2026-11-23, ordinary message during native ask (ticket #37): a separate
  omp 19.1.0 session in Tern 0.9.30 closed the form when the user sent an
  ordinary message from the composer. The transcript records `Ask
  interrupted by message`, the user's message, and the local provider's
  acknowledgment. Evidence:
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/implement-spec/20261123-retire-picker/37/ordinary-aurcWx/`.
- 2026-11-23, native ask in Tern (ticket #36): omp 19.1.0 and Tern 0.9.30
  loaded `generate-image`, `english-coach`, and `btw` as the three modules
  in `/extensions`. With the fixed local provider, `Pick a color` appeared
  in `sf-main` at the end of the transcript above the composer. The result
  was Blue. `/tree` reopened the same form without a main-model request.
  Red produced a sibling result with the same parent and call IDs. Evidence:
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/implement-spec/20261123-retire-picker/36/tern-4Q49fv/`.
- 2026-11-23, native ask in the classic TUI (ticket #36): omp 19.1.0 with
  `PI_TUI_NATIVE=0` in Tern 0.9.30 displayed the text form from the fixed
  local provider. Down, Enter, and Enter submitted Blue. `/tree` reopened
  the text form and Red produced a sibling result on the same call. Evidence:
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/implement-spec/20261123-retire-picker/36/classic-Qz1t3v/`.
- 2026-11-23, `/btw` panel after Picker removal (ticket #36): omp 19.1.0
  and Tern 0.9.30 showed `/btw why it not work?` and the local Side answer
  above the composer, alongside the English coach correction. The tree
  showed a scroll box for each panel. See `btw-and-coach.webp` and
  `shared-scroll-boxes.json` under
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/implement-spec/20261123-retire-picker/36/coach-hItaox/`.
- 2026-11-23, English coach after Picker removal (ticket #36): in omp
  19.1.0 and Tern 0.9.30, the local coach provider's `mistakes` scenario
  drew a correction with 18 marked changes above the composer. See
  `coach-correction.webp` and `requests.jsonl` under
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/implement-spec/20261123-retire-picker/36/coach-hItaox/`.
- 2026-11-22, Tern 0.9.30 and OMP 19.1.0 compatibility: isolated headless
  Tern with OMP's native renderer, `81bdc7a` plus uncommitted docs and Verify
  helper edits, SDK types 19.0.1. The four extensions loaded with no errors,
  `/skill:generate-image` completed, and the fixed Picker returned `blue`.
  Direct approvals showed `Allow tool: generate_image` with
  `Mode: Codex mode, the Default image generation mode` and
  `Mode: OpenAI mode`. With `tools.commands` on, a `bash` call running
  `generate_image --json '…'` raised one approval with the same two lines and
  no `Allow tool: bash`. OMP moved the call to background job `bg_1`, and the
  denial arrived as `Tool call denied by user: generate_image`. Under yolo the
  nested card showed `Generate image`, `OpenAI mode`, `svg`, and the missing
  key error. The CLI accepts `--output-format`, not `--output_format`. RPC-UI
  sent one `extension_ui_request` with `method: "form"`. Its submit returned
  `User answers:` with the form data, and `"cancelled":true` returned
  `Ask tool was cancelled by the user`. Plain RPC still returned
  `Native ask tool unavailable for delegation`. Evidence under
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/verify/`:
  `omp-tools-picker-heb8Sy/`, `omp-tools-direct-jIxIsT/`,
  `omp-tools-mounted-exact-arU0Hx/`, `omp-tools-mounted-svg-QQGyOv/`, and
  `omp-tools-rpc-7S2gXC/`.
- 2026-11-20, Tern 0.9.29 and OMP 19.0.1 compatibility: isolated headless
  Tern with OMP's native renderer, `81bdc7a` plus the SDK 19.0.1 bump. While
  the main turn showed `Working…`, the English coach panel sat above
  `omp.hud.activity` and the composer, as OMP 19.0.1 now orders the dock;
  once the status read `Waiting for background job bg_1`, the tray showed
  below the status. A `/btw` answer rendered after one real `read` above the
  working row, and typed text reached the focused editor. Both panels stayed
  inside the pane, and no `.tv-dock .sf-spacer` matched. At 470 × 430 the
  coach's scroll box kept its rect through `wheel 0 600` and revealed the
  last mistake; at 900 × 650 the fixture did not overflow. Evidence:
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/verify/omp-tools-2Jg3Rh/`
  and `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/verify/omp-tools-Ea9z6N/`.
- 2026-11-19, shared launcher (#26): Tern 0.9.28 and OMP 19.0.0,
  `ca7deed718a7442b794504d6f95be684534aff8c` plus the uncommitted #26 patch.
  The headless `ask-single` run returned Blue. The native launch guard
  showed no dialogs and stopped the window and daemon. In `ask-image`,
  Cmd+V pasted a generated PNG into the note. The tool result placed
  `[Image #1]` before the image block. The clipboard's two items and all
  their representations matched after restore. Both ask runs linked the
  checkout's `omp/` in a disposable home and discovered `generate-image`.
  Both retained the completed transcript byte for byte on stop, while
  separate bystander instances and the owner's window stayed up.
  The Go to picker's **Picker status** smoke showed `Waits for your input`
  and a `Waiting on you` entry while the Picker options, the Picker btw
  editor, and its streaming answer were open. Submitting Blue changed the
  row to `Done`. A standalone `/btw` did not mark the pane as waiting for
  input. The English coach contrast was not driven. Evidence:
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/implement-spec/is24-wt-20261119/26/`
  (Go to picker in `goto/`). The development smoke repeated the Go to
  picker result at `9e941e597dd645a2c3431d6cfa2e0852d1ae1798`, with the
  in-flight Verify helper comment deletions. Evidence:
  `/Users/vanguyen/.vstack/tmp/tern-plugins-412bb3/verify/tern-plugins-is24-wt-20261119/`.
- 2026-11-19, OMP 19.0.0 compatibility: OMP 19.0.0 in isolated headless
  Tern 0.9.28 with `anthropic/claude-haiku-5-5`. Startup showed no
  extension load errors. In Tern, the Picker's native buttons and keys picked,
  noted, and submitted, and Tern showed native's folded pending Ask card.
  The classic TUI showed no pending card, and the note editor showed its
  hints and discarded the note on Esc. `ask.timeout` with an empty required
  field returned native's no-answer sentence with `timedOut` and no data.
  `? <question>` opened the plugin's Side question panel, which made a
  `glob` call. The English coach corrected a mistake and closed on Esc. The
  legacy `questions` array path was not exercised live, because Haiku sent the
  list as a JSON string, which native also rejects. Evidence:
  `/Users/vanguyen/.vstack/tmp/omp-tools-4663ab/omp19-compat/20261119-121019-66378/`.
- 2026-11-19, image mode review fixes: OMP 18.22.0 in headless Tern
  0.9.28, with an isolated home and a local provider. The same direct call
  omitted `mode` before and after a project override change and `/new`.
  Approval named Codex mode first and OpenAI mode after `/new`, both as the
  Default image generation mode. Mounted `write xd://generate_image` approval
  showed `"mode": "openai"` before a truncated 2,520-character prompt.
  All three approvals were denied before any image request. A separate
  SDK 18.22.0 replay rendered pre-mode and mode-tagged results with linked
  paths under legacy-only and invalid defaults, while execution failed with
  the setting fix.
  Evidence:
  `/Users/vanguyen/.vstack/tmp/omp-tools-4663ab/implement-spec/20261118-agent-mode/review-fix/`.
- 2026-11-18, per-call `mode`: OMP 18.22.2, headless Tern 0.9.27, isolated
  `HOME` and agent dir without OpenAI or Codex credentials, the project
  default `codex`, only this checkout's `generate-image.ts` loaded with `-e`,
  and `helpers/image-mode-provider.ts` making the `generate_image` calls. The
  model request listed `mode` among the tool's parameters. A call with
  `mode: "openai"` and `output_format: "svg"` showed a card head with
  `OpenAI mode` and `svg` and the OpenAI API key error offering Codex mode or
  a new `defaultImageGenerationMode`. The first run showed `Codex mode` on
  that error card because OMP stores a thrown error with empty details; the
  fix landed red-first. Under `always-ask`, the approval prompt showed
  `Mode: Codex mode, the Default image generation mode` and the arguments for
  a call without `mode`, and `Mode: OpenAI mode` for `mode: "openai"`. Both
  denials returned `Tool call denied by user`, so no image request ran.
  Evidence:
  `/Users/vanguyen/.vstack/tmp/omp-tools-4663ab/implement-spec/20261118-agent-mode/70/smoke/`.
- 2026-11-18, `defaultImageGenerationMode` rename: OMP 18.22.2, headless Tern
  0.9.27, isolated `HOME` and agent dir, local SSE provider, and only this
  checkout's `generate-image.ts` loaded with `-e`. With only
  `imageGenerationMode: "codex"` in the isolated lockfile, the card showed
  the command to set `defaultImageGenerationMode codex`. With the project
  override `defaultImageGenerationMode: "openai"` and no OpenAI credential,
  the card showed the OpenAI API key error naming the new key. Neither call
  sent a paid image request. Evidence:
  `/Users/vanguyen/.vstack/tmp/omp-tools-4663ab/implement-spec/20261118-agent-mode/69/smoke/`.
- 2026-11-17, English coach padding: installed OMP 18.22.0, headless Tern
  0.9.26, local SSE provider. Measured in CSS pixels from the shots, the space
  between the panel edge and the text was 20.5px above and 24px below a long
  correction before the fix; after it, 20.5px and 19px, and 17.5px and 17px
  around `No mistakes`. Evidence:
  `/Users/vanguyen/.vstack/tmp/omp-tools-4663ab/verify/coach-padding-20261117-153548/`.
- 2026-11-17, English coach without a title line: installed OMP 18.22.0,
  headless Tern 0.9.26, local SSE provider. In Tern the panel showed
  `Checking…` after a spinner, then the marked prompt across the full width
  or `No mistakes`, with the `esc` keycap floating over the bottom-right
  corner (rect at the frame's right and bottom edges). Clicking the keycap
  and pressing Escape each removed the panel. Classic wrote `esc` at the right
  end of the `No mistakes` line, and Escape removed the panel. Evidence:
  `/Users/vanguyen/.vstack/tmp/omp-tools-4663ab/verify/coach-overlay-esc-20261117-153153/`.
- 2026-11-17, English coach diff view, hover reasons, and omp theme colors:
  installed OMP 18.22.0, headless Tern 0.9.26, local SSE provider,
  `dark-catppuccin`. In Tern the coach showed `checking…`, `N fixes` with
  struck and added words on tinted chips, and `no mistakes`; hovering a change
  showed only that change and its Vietnamese reason, two reasons for a change
  that fixes two reported mistakes. Shot pixels of the coach and `/btw`
  panels matched the theme exactly (`#313244` surface, `#fab387` accent,
  `#7f849c` muted, `#f38ba8` removed, `#a6e3a1` added), while the composer
  kept Tern's colors. Classic showed the same diff in ANSI with the mistakes
  listed below. The reasons came from a local provider; the real `@tiny`
  (`gpt-6.1-terra`) was checked only through `omp -p` with the coach prompt,
  where it kept capitalization and technical terms. Evidence:
  `/Users/vanguyen/.vstack/tmp/omp-tools-4663ab/verify/coach-theme-104127/serve/`
  and `coach-fine-131906/serve/` beside it.
- 2026-11-17, `ask` pictures after the `/media` move: compiled OMP 18.22.0,
  headless Tern 0.9.26, fresh HOME and agent directory, and a local SSE
  provider. In the Tern view and with `PI_TUI_NATIVE=0`, the Picker drew a
  form's PNG `<img>` and inline `<svg>` above the options, and Enter
  submitted the pick (`{"pick":"svg"}` and `{"pick":"raster"}` in the session
  JSONL) to the provider. Evidence:
  `/Users/vanguyen/.vstack/tmp/omp-tools-4663ab/verify/omp-tools-ask-media-20261117-103728/`.
- 2026-11-16, English coach acceptance: compiled OMP 18.20.3, headless Tern
  0.9.23 (`35c63ab`), fresh isolated agent directories, and a local SSE
  provider for the main, `@tiny`, and Side question roles. Both Tern and
  `PI_TUI_NATIVE=0` showed a correction, `No mistakes`, the over-300-token
  skip, a checked sentence above 500 fenced code lines shown as one
  `[code block, 500 lines]` marker, a coached `/btw` beside its Side question
  answer, and no coach panel or tiny request for `/model`. At 900 × 650 the
  long Tern correction stayed above the composer in a capped scroll box;
  wheel scrolling reached its last mistake. Classic ended with
  `… 4 more lines`. No paid model was called. The first drive's multiline
  input was invalid; its captures are excluded from acceptance proof.
  The repaired drive used bracketed paste. Two proof gaps remain: the smoke
  covers one real startup order, and real tiny-model correction quality is
  not assessed. Recipe: `features/english-coach.md` in the Verify skill.
  Evidence: the `63/native-retry/` and `63/classic/` runs under
  `/Users/vanguyen/.vstack/tmp/omp-tools-4663ab/implement-spec/coach-20261116-1343/`.
- 2026-11-16, OMP 18.20.3 and Tern 0.9.23, local SSE provider: a Submit
  review with two answers and a Note on a long option label keeps every value
  inside the Picker at 1200px and 900px pane widths. A fresh native window
  with the user's dark theme and Iosevka fonts also passes at 1741px.
  Before the fix, the label column grew beyond the pane and answers had zero
  width. The headless drive submits both picks and the Note unchanged.
- 2026-11-12, final acceptance of the HTML `ask` migration: OMP source at
  `8ed79a8`, headless Tern 0.9.16, local SSE provider, fresh agent dir. In
  both renderers: a mixed form with context blocks; Submit refused on a
  number above `max`; `ask.timeout` sending an empty required field and an
  out-of-range number marked not the user's choice; an image Note on an
  unpicked option, `Other`, and the Submit note; Esc then F5 restoring the
  answers and the Picker btw thread; Ctrl+R in a textarea; a ratchet
  `askDialog` with a Note. Side question requests after compaction, after
  `/tree` with and without a new prompt, and during a pending `ask` hold the
  selected saved history. RPC-UI hands the form to native `ask`; RPC and
  print return `Native ask tool unavailable for delegation`.
- OMP 18.18.8, headless Tern 0.9.16, local SSE provider: Ctrl+R in a Picker
  note, `Other` answer, and Picker btw question puts the picked history entry
  in that editor; a second Ctrl+R opens over the same editor, Esc keeps its
  text, and the answer stays out of prompt history.
- OMP 18.14.2, headless Tern 0.9.9: Esc then F5 on an `ask` replays the same
  call id with no model request between, and the Picker restores picks, option
  notes, and the Picker btw turn.
- OMP 18.13.3, Tern 0.9.7: in both renderers, Side question model selection,
  role thinking, retry countdowns, fallback switches, terminal failure, and Esc
  in `/btw` and the Picker btw; host `askDialog` picks, notes, Other, draft,
  and timeout; eager and deferred `generate_image` precedence; each mode's
  schema, a live Codex card, and OpenAI error cards (no live OpenAI request);
  over compiled RPC, Side question images, the five-tool limit, privacy, and
  the shared cost gate.
- OMP 18.12.x, Tern 0.9.4–0.9.5: every surface in both renderers (Picker
  keys, `Other`, notes, Submit, pointer, `ask.timeout`; Picker btw, also in an
  `ask` started by a subagent's IRC message; `/btw`; `generate_image`
  generate and edit), the Picker label's computed font, and Picker Cmd+C and
  Cmd+V in native Tern.
- 2026-11-05: the three live OpenAI checks passed in 45 seconds.
