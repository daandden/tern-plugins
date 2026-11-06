# Tern plugins

Custom plugins for the Tern terminal. The words below name the things the plugins move between and act on.

## Language

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
The list of sessions, tabs and panes, with tabs under their session and the panes of a split tab under that tab. Sessions keep Tern's order. The tabs of a session come by their tab status, then last seen first; the panes of a tab come last seen first. A tab with one pane is one row. It shows agent panes only, until you ask for all panes. The panes that are waiting on you come first, above the tree. Picking a row moves focus to that session, tab or pane.
_Avoid_: Navigator, jump palette, switcher

**Tab status**:
The status that a tab sorts by in the Go to picker: the status of its pane, or for a split tab the most urgent status among its panes that the picker's view shows. Floating panes have no part in it.
_Avoid_: Focused pane status

**Last seen**:
When a pane last had focus, however briefly. A tab was last seen when one of its panes was, and focus on a floating pane counts for its tab only. The Go to picker's own focus does not count. Panes and tabs not seen yet follow the seen ones, in Tern's order.
_Avoid_: Recent, last used, MRU, last active

**Waiting on you**:
The group at the top of the Go to picker: each pane, other than the one you are in, that waits for you: its agent needs your input, shows an error or failed its last turn, or is done (it finished a turn while you were not looking at its pane), or its terminal rang an alert. An agent whose program exited stays out of the group. Idle agents join the group only when you ask for them, and the picker keeps that choice. The panes come by what they wait for (input, error, alert, done, idle), and inside each, last seen first by the pane's own last seen, also for a tab with one pane. The panes also stay in their place in the tree below.
_Avoid_: Needs attention (its old name), needs you (Orca), inbox (Tern's own F6 list)

**Jump number**:
The number on the session, tab and pane rows of the Go to picker. Typing it goes to that row. A session that shows one tab shares one number with that tab, because both go to the same pane. A Waiting on you row keeps its own number.
_Avoid_: Label, hint, row number

**Working time**:
How long an agent's current turn has run, shown on its rows of the Go to picker. It counts only turns whose start the picker saw; an agent that was already working shows none.
_Avoid_: Age, turn time, busy for, time in state

**Waiting time**:
How long a pane has been waiting on you: since its agent asked for input, showed an error or finished a turn you did not see, or its terminal rang an alert. It counts only waits whose start the picker saw. Idle agents have none.
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
