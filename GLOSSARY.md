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
The list of sessions, tabs and panes, with tabs under their session and the panes of a split tab under that tab. The tabs of a session and the panes of a tab come last seen first; sessions keep Tern's order. A tab with one pane is one row. It shows agent panes only, until you ask for all panes. The panes that are waiting on you come first, above the tree. Picking a row moves focus to that session, tab or pane.
_Avoid_: Navigator, jump palette, switcher

**Last seen**:
When a pane last had focus, however briefly. A tab was last seen when one of its panes was, and focus on a floating pane counts for its tab only. The Go to picker's own focus does not count. Panes and tabs not seen yet follow the seen ones, in Tern's order.
_Avoid_: Recent, last used, MRU, last active

**Waiting on you**:
The group at the top of the Go to picker: each pane, other than the one you are in, that waits for you: its agent needs your input, shows an error or is done, or its terminal rang an alert. Idle agents join the group only when you ask for them, and the picker keeps that choice. The panes come by what they wait for (input, error, alert, done, idle), and inside each, last seen first by the pane's own last seen, also for a tab with one pane. The panes also stay in their place in the tree below.
_Avoid_: Needs attention (its old name), needs you (Orca), inbox (Tern's own F6 list)

**Jump number**:
The number on the session, tab and pane rows of the Go to picker. Typing it goes to that row. A session that shows one tab shares one number with that tab, because both go to the same pane. A Waiting on you row keeps its own number.
_Avoid_: Label, hint, row number

**Rendered page**:
An HTML file shown rendered in a browser pane inside Tern, not as its source text.
_Avoid_: Page (the Tab entry already uses that word), preview, HTML view

**Opener pane**:
The pane where an open starts: the pane that holds a clicked link, or the pane whose program ran the open command. The file opens beside it, in its tab.
_Avoid_: Owner, caller, source pane, focused pane

**Floating pane**:
A pane that sits over the tiled panes of its tab, at its cascade place until you move or resize it. The floating panes of a tab are shown or hidden, together. When focus goes to a tiled pane of the tab, they hide, and their programs keep running. The Go to picker also floats, but it is not a floating pane: it closes when focus leaves it.
_Avoid_: Popup, PiP, picture in picture, glance

**Cascade place**:
The spot where a floating pane opens: half the tab in size, a little lower and to the right of the floating pane opened before it. A floating pane that you move or resize leaves its cascade place and keeps its own spot until it closes.
_Avoid_: Home spot, slot, corner
