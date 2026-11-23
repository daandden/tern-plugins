# Tern and omp plugins

This repo holds plugins for [Tern](https://docs.stencil.so/tern/) and Oh My Pi (omp).
Tern loads each plugin from `tern/<id>/`. omp loads `omp-tools` from `omp/`.

## Plugins

| Host | Plugin | What it does |
| --- | --- | --- |
| Tern | [`goto`](#goto) | Find and jump to sessions, tabs, and panes. See which panes are waiting on you. |
| Tern | [`zellij-keys`](#zellij-keys) | Move between panes and tabs, open floating tools, and start omp in a new worktree. |
| Tern | [`reader-terminal-text`](#reader-terminal-text) | Match Reader chat text to your terminal's text settings. |
| Tern | [`vstack-flow`](#vstack-flow) | Open vstack Flow links in Tern while other web links follow your link setting. |
| Tern | [`toast-above-browser`](#toast-above-browser) | Keep Tern toasts visible while a browser block is shown. |
| omp | [`omp-tools`](#omp-tools) | Generate images, ask Side questions, and get private English corrections. |

## Requirements

- Tern and its `tern` command. The Tern plugins were smoke-tested on Tern 0.9.30.
- In `/opt/homebrew/bin`: Yazi, lazygit, and btop for floating tools. Git, `gtimeout` from GNU coreutils, and omp for worktrees.
- Oh My Pi and Bun for `omp-tools`. The omp documentation describes omp 19.1.0.
  [OpenAI mode](#openai-mode) and [Codex mode](#codex-mode) need different credentials.

## Install

Run the commands from the repo root. If you already use any of these plugins, start
with [Relink after the move](#relink-after-the-move).

### Tern

Link the five plugin folders. The command replaces old links for these IDs and checks each target before the final reload:

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

Check that all five show `ready`. `tern plugin reload` exits with code 1 if a plugin fails to load.
Tern also reloads linked plugins when files in the checkout change.

### omp

Install the locked dependencies and link the plugin:

```sh
(
	cd omp &&
		bun install --frozen-lockfile --ignore-scripts &&
		target=$(pwd -P) &&
		omp plugin link "$target" &&
		test "$(realpath "$HOME/.omp/plugins/node_modules/omp-tools")" = "$target"
)
```

Unlink the old `omp-ask` plugin and remove any loose copy of its `ask` extension before starting omp.

Keep `ask` enabled in your omp config. omp supplies the `ask` tool. Disable native
`generate_image` so the plugin supplies the image tool.

```yaml
ask:
  enabled: true
generate_image:
  enabled: false
```

Start a new omp session. The link uses the checkout directly, so edits do not
require another install. Running sessions keep the tool definitions they loaded.

### Open local files with Tern

To use [`bin/open`](bin/open), link it into a directory before `/usr/bin` on your `PATH`:

```sh
ln -s "$PWD/bin/open" ~/.local/bin/open
```

In a Tern pane, `open FILE...` with only local files opens each file beside the opener pane, in its tab.
HTML opens as a rendered page. Text and code use Tern's native code view and follow the line-height setting.
Other calls go to `/usr/bin/open`.

### Relink after the move

From the checkout you intend to use, run the [Tern install commands](#tern) to unlink the old `.path`
files and link the new `tern/<id>/` folders. Check that all five plugins show `ready`.

Run the [omp install commands](#omp) to replace and verify the link to `omp/` before starting a new omp
session. The ID stays `omp-tools`, so your settings and project overrides still apply.

## Keybinds

This repo does not ship a Tern settings file. Bind a command as `plugin.<plugin id>.<command id>` in
`~/.config/tern/settings.json`, for example `plugin.goto.open` or `plugin.zellij-keys.float_yazi`.
The [Tern keybind guide](keybinds.html) lists all keys by Zellij mode and marks which commands come from a
plugin. The Tern keys below use that setup.

For full contrast in unfocused panes, set Tern's **Dim unfocused panes** to **Off**.

For omp, see the [Side question controls](#side-questions) and [English coach controls](#english-coach).

## `goto`

Press F1 to open or close the Go to picker. It lists sessions, their tabs, and the panes of split tabs.
The Go to picker dims the window like Tern's command palette. A one-pane tab has one row.
The list shows agent panes by default. Sessions keep Tern's order.
Tabs sort by tab status, then by working time or waiting time, longest first. Split-tab panes sort by
time, longest first. Floating panes do not affect tab status.

| Key | Action |
| --- | --- |
| Letters and spaces | Search immediately. Search hides Waiting on you. |
| Jump number | Go straight to that destination. A session with one visible tab shares its number with the tab. |
| Up, Down, Enter | Move the highlight, then go to the highlighted destination. |
| Esc | Clear a pending digit, clear the search, or close, in that order. |
| Ctrl+; then A | Switch between agent panes and all panes. |
| Ctrl+; then I | Show or hide idle agents in Waiting on you. The setting persists. |

Leave Ctrl+; unbound in Tern so the Go to picker receives it. Status marks show which agents are working
or waiting. Times appear only if the Go to picker saw the turn or wait begin.

**Waiting on you** lists panes other than your current pane: needs input, error, terminal alert, done,
paused, then idle if enabled. Within a status, the longest wait comes first. Exited agents stay out.
Each waiting pane still appears in the tree and gets a separate jump number in the group. The highlight
starts on the first waiting pane, if any.

With omp's `terminal.programStatus` on, a pane with a waiting native `ask` gets a needs-input mark.
The `/btw` and English coach panels do not count as waiting for input.

Paused panes get a still, muted pause mark and no time. Resume in omp to restore the pane's other
status. Working time includes the pause. A stopped goal, loop, or plan and Ctrl+Z do not count as
`/pause`.

## `zellij-keys`

| Key | Action |
| --- | --- |
| Alt+H or Alt+Left | Focus left, or go to the previous tab if focus does not move. |
| Alt+L or Alt+Right | Focus right, or go to the next tab if focus does not move. |
| F2, F3, F4 | Open Yazi, lazygit, or btop, respectively, in a floating pane that closes when the program exits. |
| Alt+Plus, Alt+Equals, or Ctrl+G then R then Plus | Grow the focused floating pane one step wider and taller. |
| Alt+Minus or Ctrl+G then R then Minus | Shrink the focused floating pane one step narrower and shorter. |
| Ctrl+G then T then B, `[`, or `]` | Move the focused pane to a new tab, the tab on the left, or the tab on the right, respectively. At an edge, the directional key creates a tab. |
| Ctrl+Shift+T | Open an omp tab in a new worktree of the focused pane's repo. |
| Cmd+R | Reload the focused browser block. The usual SQLite actions still work. |

Resize keeps a floating pane in its corner and does nothing in a tiled pane. Tern handles dragging,
corner placement, docking, and visibility. Tool panes open larger and shrink to a glance when unfocused.
When a focused floating pane closes, the plugin focuses the last used shown floating pane, or the one
before or after it. Tern's Ctrl+Option+Cmd+P hides or shows a tab's floating panes. Their programs keep
running while hidden.

### Open an agent in a worktree

The main checkout keeps its branch but must have no staged, unstaged, or untracked changes. The shortcut
fetches the default branch and uses its remote commit, or the cached commit if the fetch fails. Unpushed
commits on the local default branch stop the shortcut. If that branch is behind, the shortcut fast-forwards
it first, including its files if the main checkout is on it. If that fails, such as when another worktree
has the branch checked out, the shortcut shows an error toast and opens nothing.

The worktree directory comes from `OMP_WORKTREE_DIR`, then `worktree.base`, then `~/.omp/wt`. The main
checkout's `.omp/config.yml` applies. `worktree.clone` controls whether to copy ignored files.

The worktree stays after the agent closes because `worktree.onExit` does not own it. To remove a finished
worktree, run `git worktree remove <path>`. If the shortcut cannot add a worktree, its toast names the cause.
The shortcut removes the new folder and deletes the new `wt/<time>` branch only if it still points at its
starting commit. A second toast reports any cleanup failure or refusal.

## `reader-terminal-text`

In Reader chat, omp prose, the composer, advisor notes, notices, and tool-result prose use the terminal's
font size, row height, and weight. Single-line text such as tool titles, chips, and status uses the
terminal size and row height but keeps Reader's weights. The UI font and Markdown theme colors stay.
The plugin hides the empty composer's placeholder and the blank rows above it from empty dock regions.

## `vstack-flow`

Cmd-click a Flow link to open it in Tern beside the opener pane. If that tab already shows a browser pane
for the same Flow, Tern focuses it and jumps to the linked question. Other web links follow Tern's
`link_target` setting. Cmd+Option-click uses Tern's own alternate target instead of the plugin.

## `toast-above-browser`

While the active tab shows a browser block, tiled or floating, toasts appear over the title bar, where the
page cannot cover them. Otherwise, toasts stay at the bottom.

## `omp-tools`

Change settings in **Settings > Plugins > omp-tools** or with `omp plugin config set omp-tools <key> <value>`.
Project values in `.omp/plugin-overrides.json` take precedence over global values.
Use the shape `{"settings":{"omp-tools":{"englishCoach":false}}}` for project overrides.

### `generate_image`

The tool sends your prompt unchanged, without a chat model in between. The agent picks `openai` or `codex`
per call and runs the [generate-image skill](omp/skills/generate-image/SKILL.md) checklist before sending.

`defaultImageGenerationMode` is `openai`. The agent puts `mode` first and uses the other mode only when
you ask or need an exclusive feature such as SVG. Calls without `mode` use the default. omp 18.22 treats
`null`, `""`, and `"null"` for `mode` as omitted. Approvals show the mode and arguments, also when omp 19.1
runs `generate_image` as a command inside `bash` (`tools.commands`, on by default). The card names the mode
used.

To use Codex mode by default, run:

```sh
omp plugin config set omp-tools defaultImageGenerationMode codex
```

The setting applies at session start, including `/new`, `/resume`, and `/fork`. A running call keeps
its mode. With neither key set or the new key `null`, the default is OpenAI mode. Setting only the old
`imageGenerationMode` key, or setting an invalid new value such as `""`, fails every call with a fix,
even with an explicit `mode`. Update the key in `.omp/plugin-overrides.json` if it comes from there.

Before sending a request, the tool rejects unknown arguments with the accepted list and names arguments
the mode does not take. Cancelling the tool cancels the request, and requests time out after five minutes.
The tool never retries or falls back to another mode, provider, or native tool. Missing credential errors
explain how to request the other mode or change the default.

#### OpenAI mode

OpenAI mode always requests GPT Image 2.6 Sunburst (`gpt-image-2.6-sunburst`). There is no `model`
argument. Use `OPENAI_API_KEY` or omp's stored `openai` API key, not a ChatGPT login. The key goes
only to `https://api.openai.com/v1`. A different base URL fails. `OpenAI-Organization` and
`OpenAI-Project` come from provider headers, or `OPENAI_ORG_ID` and `OPENAI_PROJECT_ID`.

The API organization pays. OpenAI spends Promotional API credits first, then purchased OpenAI API credits.
The tool cannot pick a grant, restrict use to free credits, or report which balance paid. A no-credit
error says not to retry. A normal rate-limit error says to wait.

Only `prompt` is required. `null` counts as omitted for optional arguments.

| Argument | Values and limits |
| --- | --- |
| `prompt` | Image or edit description, up to 32,000 characters. |
| `n` | 1 to 10 images. The tool saves and returns all in the API's order. |
| `quality` | `auto`, `low`, `medium`, `high`, `xhigh`, or `max`. |
| `complexity` | `low`, `medium`, or `high` (API default). Separate from rendering quality. |
| `size` | `auto`, `1024x1024`, `1536x1024`, `1024x1536`, or `WIDTHxHEIGHT` with edges divisible by 16 and aspect ratio 1:3 to 3:1. The API checks the remaining limits. For GIF this is each frame's size. |
| `background` | `auto`, `opaque`, or `transparent`. Transparency works with PNG, WebP, SVG, and the default format. |
| `output_format`, `output_compression` | `png`, `jpeg`, `webp`, `gif`, or `svg`. Compression is 0 to 100 for JPEG and WebP only. |
| `frame_count`, `frame_duration_ms` | GIF only. 2 to 16 frames (default 9) and 20 to 2,000 ms per frame (default 200). |
| `svg` | SVG author settings. `model` overrides `svgAuthorModel`; `reasoning.effort` is `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` if the author supports it. |
| `moderation` | `auto` or `low` (less strict, not off). |
| `safety_identifier`, `user` | A nonempty `safety_identifier` (up to 128 characters) takes precedence over the deprecated `user`. Neither appears in results. |
| `stream`, `partial_images` | Stream with 0 to 3 previews. Each preview costs 100 extra image output tokens. Fewer may arrive, and previews are not saved. |

GIF and SVG are generation-only, without Reference images, streaming, or compression. SVG takes `n: 1`
or no `n`. `svgAuthorModel` defaults to `gpt-6.1-sol` when unset or empty. It applies at session start,
including `/new`, `/resume`, and `/fork`. The API gets an author model for every SVG and bills its token
rates. The reasoning setting affects the author, not image complexity.

Up to 16 Reference images come from one source: `referenced_image_paths` (absolute paths),
`num_last_images_to_include` (1 to 16 recent conversation images, oldest first), or `images`
(`{ image_url }` with HTTPS or a data URL, or `{ file_id }`). Any reference makes the request an edit.
The tool sends PNG, JPEG, and WebP unchanged and converts other files to PNG.

An edit can take `mask` or `markup`, not both. Either takes `{ path }`, `{ image_url }`, or `{ file_id }`.
A mask is a PNG or WebP with alpha in the first Reference image's format and size. The edit applies where
the mask is transparent. Markup is a transparent PNG with visual instructions, sized to the first Reference
image after EXIF orientation. The tool checks local files and data URLs but sends their bytes unchanged.
The API checks remote inputs.

With no format, the tool requests PNG and saves a lossless WebP. Conversion keeps visible pixels and alpha
but drops hidden color under fully transparent pixels. With an explicit format, the tool saves the API
bytes unchanged. Output goes to `$TMPDIR/omp-image-<id>` with an extension that matches the bytes.
The agent gets each raster image, its path, and its reported size and quality. GIF stays `image/gif`.
Tested Claude Haiku 5.5 and Codex gpt-6-luna routes saw only its first frame. SVG returns a path to read.

Results separate sent settings (including complexity, frame settings, and `svg`) in `details.requested` from
reported settings. They keep token usage, `x-request-id`, and `details.svgUsage`. Errors name the request ID.

#### Codex mode

Use `/login` to sign in to `openai-codex`. Codex mode draws on the account's Codex image allowance.
It takes `prompt` (required), `transparent_background`, and either `referenced_image_paths` (up to five
absolute paths) or `num_last_images_to_include` (1 to 5 conversation images, including pastes and tool results).

State the aspect ratio in the prompt. The endpoint ignores size and quality, chooses the quality and model,
and outputs about 1.57 megapixels. It receives JPEG and WebP references unchanged and other formats as
lossless WebP. It saves a lossless WebP to `$TMPDIR/omp-image-<id>.webp`. The agent gets the image, path,
and reported size and quality. Details include the request ID, generation ID, and output token count.
HTTP errors include the request ID.

Requests over 64 MB fail before sending. An edit reporting zero input image tokens fails instead of returning
an image that ignored the references. Usage-limit errors name the limit, plan, and reset time and say not to
retry before reset. Successful calls warn at 80% usage with the reset time.

In Tern, click a saved path to open it. The tool card shows the prompt, reference count, settings, images, and
the latest in-progress preview or error. Long prompts fold.

### Side questions

Type `/btw <question>` or `? <question>` in the main editor and press Enter. Bare `/btw` still opens native
BTW history, and autocomplete stays native. Your question and answer stay out of the main conversation.
Attached images go with the question and stay available to follow-ups.

A Side question reads the saved transcript on the selected branch, with eval state saved after `/tree` or
compaction. Pending main calls stay open and are not repeated. Interrupted calls with no result drop out.
There is no retained eval runtime or eval prelude tool such as `ratchet`. It uses only the main agent's available
`read`, `grep`, `glob`, `find`, and `web_search`, with their size limits and no round cap. It cannot ask you,
run commands, or message or stop agents. `read agent://<id>` can read a main-session agent still running.

The panel above the composer leaves the composer focused. It shows questions like main chat messages, with
answer text and **N tool calls** groups in order. When the main composer has focus and is empty, `t` toggles
tool calls and Esc cancels the answer or closes the panel. In Tern, click a group to toggle it. Follow-ups
keep their thread even after you close the panel. When the agent takes your next main prompt, even if queued,
it ends the thread and clears the panel. A running Side answer can finish and show, but the next `/btw`
starts a new thread.

While a native `ask` waits, press Esc on the form to focus the composer. Send `/btw <question>` or
`? <question>` to ask aside without submitting the form. Press Shift+Tab to return to the form with your
answers intact. The Side question knows the `ask` is still open but cannot see your unsent answers or Notes.

`sideQuestionModel` applies to `/btw`. It defaults to `@smol` and uses the role's thinking level.
Set a role such as `@smol:low` or a selector such as `provider/model:high`. An empty value uses the main model.
Changes apply to the next thread. If the model is missing after a provider refresh, the thread names it in a
warning and uses the main model. A context window too small for the history also uses the main model.

Side questions follow omp's retry and fallback policy, including role chains. They show retry countdowns,
model switches, and the final retry error. Provider retries can leave the panel at `Answering…` before those
notices. Esc cancels either wait. Inherited chains can revisit earlier models until you cancel. Give a model
an empty chain to make it the last one tried:

```yaml
retry:
  fallbackChains:
    smol:
      - provider/backup:low
    provider/backup: []
```

Requests and background calls count toward main-session usage, cost, and the spending cap. The first Side
question does not reuse the main agent's prompt cache. Follow-ups and later threads reuse a Side question cache.
With `display.cacheMissMarker` on, both views can show `⊘ cache miss · N tokens` for providers that report cache
writes (such as Anthropic, not Codex). Switching provider or model does not count as a miss.

Side questions need a saved session in the interactive terminal. Focused subagent views, RPC, ACP, print
mode, and `side: true` file commands use native `/btw` instead.

### English coach

The English coach checks interactive prompts in the background with omp's `@tiny` role. The main agent gets
your prompt immediately and unchanged. Corrections stay in a private panel above the editor. Capitalization,
technical terms such as `git diff`, and attached images are not checked.

Code, paths, and URLs stay out of the request and token count. Inline code, paths, and URLs show unchanged.
A fenced block shows as `[code block, N lines]`. Pasted prose counts in full. Only arguments after `/btw`,
`/skill:<name>`, and prompt-file commands get checked. Other commands, or an allowed command without an
argument, clear the panel. Answers to native `ask` are not checked. RPC, ACP, print mode, and subagents
never trigger the coach.

The panel shows `Checking…`, `No mistakes`, corrections, or a reason: `Not checked: over 300 tokens`,
`Not checked: no English text`, or `Check failed: <reason>`. Removed text is struck through and replacements
follow it. Punctuation replacements show only the new mark. Hover a change in Tern to see it with the reason.
The classic terminal lists `original → corrected (reason)` lines.

With the editor empty, press Esc or click **esc** in Tern to close the panel. Press Esc again to interrupt the
agent. Closing, another submission, switching sessions, branching, a tree jump, or shutting down clears the
panel and cancels an unfinished check. Long text wraps up to 40% of the terminal rows. Scroll with the wheel in
Tern, or look for the remaining-line count in the classic terminal.

| Setting | Default | What it controls |
| --- | --- | --- |
| `englishCoach` | `true` | Set to `false` to turn off coaching. |
| `englishCoachMaxTokens` | `300` | Positive limit on checked English text. Over-limit prompts make no model request. |
| `englishCoachLanguage` | `Vietnamese` | Language for mistake patterns. Corrections stay in English. |

Settings apply at session start and on session switch. An invalid limit or empty language warns once and
disables coaching for the session. Choose the model through `@tiny`. If the role has no model or credential,
coaching warns once and turns off for the session rather than using the main model.

Replies are capped at twice `englishCoachMaxTokens` plus 200 tokens, or 800 by default. Instructions add input
tokens. Attempts count toward session usage and cost without adding messages. Prices depend on the `@tiny` model.
