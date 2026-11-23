# Tern and omp plugins

The shared vocabulary for the Tern plugins and omp-tools.

## Language

### Tern

**Session**:
A named group of tabs in a Tern window. It is the top layer: a session holds tabs, and a tab holds panes.
_Avoid_: Workspace (herdr), worktree (Orca), project

**Tab**:
One page of a session, with one or more panes in a split layout.
_Avoid_: Window

**Pane**:
One terminal, agent or block inside a tab.
_Avoid_: Block (except for plugin blocks), terminal, split

**Agent pane**:
A pane that runs an agent Tern knows, such as omp. Any other pane (a shell, an editor, a tool) is a plain pane.
_Avoid_: Agent block, AI pane

**Worktree**:
A git checkout of one branch in its own folder, beside the repo's main checkout. An agent can start in a new worktree, so its work stays apart from the main checkout.
_Avoid_: Session (Tern's group of tabs), workspace, clone

**Go to picker**:
The list of sessions, tabs and panes, with tabs under their session and the panes of a split tab under that tab. Sessions keep Tern's order. The tabs of a session come by their tab status, then by working time or waiting time, longest first; the panes of a tab come by that time, longest first. Rows with no time keep Tern's order. A tab with one pane is one row. It shows agent panes only, until you ask for all panes. The panes that are waiting on you come first, above the tree. Picking a row moves focus to that session, tab or pane.
_Avoid_: Navigator, jump palette, switcher, a bare "Picker"

**Tab status**:
The status that a tab sorts by in the Go to picker: the status of its pane, or for a split tab the most urgent status among its panes that the picker's view shows. Floating panes have no part in it.
_Avoid_: Focused pane status

**Waiting on you**:
The group at the top of the Go to picker: each pane, other than the one you are in, that waits for you: its agent needs your input, shows an error or failed its last turn, or is done (it finished a turn while you were not looking at its pane), or is paused, or its terminal rang an alert. An agent whose program exited stays out of the group. Idle agents join the group only when you ask for them, and the picker keeps that choice. The panes come by what they wait for (input, error, alert, done, paused, idle), and inside each by waiting time, longest first; panes with no waiting time follow in tree order. The panes also stay in their place in the tree below.
_Avoid_: Needs attention (its old name), needs you (Orca), inbox (Tern's own F6 list)

**Paused**:
An agent pane held by omp's pause until you resume it. Calls already under way can finish. The hold covers agents in that omp process, not independently running agents. A paused agent waits on you, even when it also had a question, an error or an unseen result. An omp goal, loop or plan that only stopped repeating is not paused, and neither is a program stopped with Ctrl+Z.
_Avoid_: Suspended, frozen, on hold

**Jump number**:
The number on the session, tab and pane rows of the Go to picker. Typing it goes to that row. A session that shows one tab shares one number with that tab, because both go to the same pane. A Waiting on you row keeps its own number.
_Avoid_: Label, hint, row number

**Working time**:
How long an agent's current turn has run, shown on its rows of the Go to picker. It counts only turns whose start the picker saw; an agent that was already working shows none.
_Avoid_: Age, turn time, busy for, time in state

**Waiting time**:
How long a pane has been waiting on you: since its agent asked for input, showed an error or finished a turn you did not see, or its terminal rang an alert. It counts only waits whose start the picker saw. Idle and paused agents have none.
_Avoid_: Age, idle time, time in state

**Opener pane**:
The pane where an open starts: the pane that holds a clicked link, or the pane whose program ran the open command. The file opens beside it, in its tab.
_Avoid_: Owner, caller, source pane, focused pane

**Floating pane**:
A pane that sits over the tiled panes of its tab, in a corner. The floating panes of a tab are shown or hidden together, and their programs keep running while hidden. A shown floating pane without focus shrinks to a small glance in its corner. The Go to picker also floats, but it is not a floating pane: it closes when focus leaves it.
_Avoid_: Popup, PiP, picture in picture

**Flow link**:
A link to a vstack Flow page on this machine, the page where an agent shows its questions and results. omp shows one before each question it asks there. The click that opens links (Cmd-click) opens it in Tern beside the opener pane, while other web links go to the default browser.
_Avoid_: Flow URL, Grilling page link, local link

### omp-tools

**Native tool**:
A tool built into the running OMP host, such as native `ask` or native `generate_image`.
_Avoid_: stock tool, built-in tool, origin tool

**Note**:
Free text the user attaches to one option of a question in native `ask`. Only a Note on a picked option is sent with the answer.
_Avoid_: comment, annotation

**Other answer**:
The user's own typed answer to a question of native `ask`, instead of a listed option or, in multi-select, alongside them.
_Avoid_: custom input, custom answer

**Side question**:
A question about the session that is answered aside from the main conversation, with read-only tools, and that the main agent never sees. The user asks one through **/btw**, also while a native `ask` waits.
_Avoid_: btw (unqualified), side turn, btw agent

**Side question thread**:
One **Side question** and the follow-ups asked after it, each answered with the earlier questions and answers of the thread in view. A new thread starts with none of them.
_Avoid_: btw session, new session (for one follow-up)

**Side question model**:
The model chosen to answer every **Side question**, independently of the main conversation's model.
_Avoid_: btw model, side model

**/btw**:
The editor command that asks a **Side question**. Typing it runs this plugin's version, not **Native /btw**. Later `/btw` questions follow up in the same **Side question thread** until the user's next main prompt ends it.
_Avoid_: btw (unqualified)

**Native /btw**:
OMP's own side-question command, which answers without tools. It still answers where this plugin cannot take over `/btw`.
_Avoid_: stock /btw, OMP btw

**English coach**:
The background check of English in prompts submitted to the main agent in the interactive terminal. It uses OMP's `@tiny` model role and shows private corrections above the editor without changing the prompt or adding corrections to the main conversation.
_Avoid_: grammar checker, English tutor, coach agent

**generate_image**:
This plugin's image tool. It replaces native `generate_image`, which the user disables.
_Avoid_: custom image tool, image wrapper

**Image generation mode**:
The choice of image service and billing source for **generate_image**. The two modes are **Codex mode** and **OpenAI mode**.
_Avoid_: image provider (unqualified), image backend (for the mode)

**Default image generation mode**:
The **Image generation mode** that **generate_image** uses when a call does not name one, chosen by the user in the plugin's settings.
_Avoid_: default provider, image provider

**Codex mode**:
The **Image generation mode** that uses a signed-in ChatGPT account's Codex image allowance through **Codex OAuth**.
_Avoid_: free mode, API-credit mode

**OpenAI mode**:
The **Image generation mode** that uses GPT Image Sunburst through the public OpenAI Images API, billed to an API organization.
_Avoid_: Codex API mode, free mode

**SVG author**:
The text model that writes an **OpenAI mode** SVG result from the raster image the image model drew first. It is chosen separately from the image model.
_Avoid_: SVG model, vectorizer

**OpenAI API credits**:
The value in an API organization used to pay for API requests, including promotional grants and purchased credits. This balance is separate from signed-in Codex usage allowances.
_Avoid_: Codex credits, ChatGPT usage credits

**Promotional API credits**:
The free subscription-linked grant within **OpenAI API credits**, which expires at the end of its subscription billing cycle.
_Avoid_: free Codex credits, purchased API credits

**Codex Images endpoint**:
The ChatGPT-login image backend the official Codex CLI calls: `/backend-api/codex/images/generations` and `/backend-api/codex/images/edits`.
_Avoid_: codex-us image generation, Codex image API

**Responses image tool**:
The hosted `image_generation` tool reached through `/backend-api/codex/responses`, used by native `generate_image`.
_Avoid_: hosted image path

**Codex OAuth**:
Authentication with a ChatGPT account through OMP's `openai-codex` login, as opposed to an OpenAI API key.
_Avoid_: subscription auth, ChatGPT key

**Reference image**:
An existing image sent with an edit request for the backend to modify or draw from.
_Avoid_: input image, attachment, source image
