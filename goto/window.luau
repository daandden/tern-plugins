-- Go to picker, window half. plugin.goto.open lists every session, tab and tiled pane of this window
-- in a picker block (host.luau), or closes the open picker. The block is a floating pane that the
-- palette sheet below draws like Tern's command palette. It reports the row you pick as a goto:
-- link, and the link route here moves focus there. The picker closes after a jump, on Esc and when
-- focus leaves it.

local KIND = "goto.picker"

-- The picker draws its box and footer with the command palette's class names (cmdk, ck-foot, kbd),
-- so Tern's own palette CSS gives them the palette's colors in every theme. The rows are a Tern
-- list, which scrolls with the wheel and keeps the cursor row in view. This sheet does the rest:
-- - The pane takes the palette's box: 640 by 511 px (20 rows of 22 px, the separator line, the
--   list padding and the footer), centered on the window, 12% of the window height from the top,
--   with a veil over the window. It is fixed to the window, not to the pane area, so an open
--   sidebar does not push it off center. Its header and resize grips go away.
--   CSS cannot select a pane by what it holds, so the rule matches the pane's accessible name,
--   which starts with the block title "Go to". Tern writes a float's position and size inline, so
--   the rule needs !important, and a third :root wins over the zellij-keys float-size rule.
-- - The palette box has the palette's size and sits centered, so it looks the same in the float
--   and in the tab that the picker opens in a session with no tabs. The empty dock goes away, and
--   the terminal grid turns invisible. The grid stays in the page because it holds the input that
--   sends typed keys (j, k, digits, /) to the block; with display none they never arrive.
-- - The list fills the box above the footer, which keeps its full height. Its top padding (12 px)
--   matches the space under the footer text. Its rows are one text line high, so the tree
--   characters join from row to row. Rows that a second digit cannot reach dim.
-- - The row with the role goto.sep (host.luau) is the thin line under the Waiting on you rows: a
--   13 px row with a 1 px line in Tern's border color, which clicks pass through. A list with no
--   line (role goto.flat) gets those 13 px as bottom padding instead, outside the scrolling area,
--   so the box shows 20 rows either way.
-- - Each row starts with its jump number and status mark, then the tree lines and the name. Every
--   mark fills one 22 px slot, so the numbers and names line up: a still glyph or an empty slot has
--   the "icon" token and a width of 22 px (Tern adds a margin after an icon span, which goes to 0),
--   and the moving marks get margins that add up to 22 px. Still glyphs use Symbols Nerd Font,
--   which gives each glyph its own width, so the glyph centers in the slot. The icon token's font
--   (Berkeley Mono) has no such glyph, and its fallback draws it past the right edge of a one-cell
--   width.
-- - Plugin spans keep only Tern's own style tokens, so each moving mark is a no-break space with
--   the "num" token as a hook (host.luau), plus a second token that picks the mark. Every busy mark
--   moves with one of Tern's own keyframes, the one that omp or Tern uses for the same thing:
--   working (accent) is Tern's active step marker, a faint ring with an arc that turns (tnHdSpin);
--   a busy terminal (em) is Tern's orbit spinner, a dot that circles a faint ring (sf-turn);
--   compacting (ins) is the sliding bar of an indeterminate progress bar (sf-indet); running
--   subagents or jobs (del, three spans) are Tern's three dots (sf-dot); retrying (mark) is two
--   rings that widen in the warning color (tnRing). Idle (muted) is a hollow ring that does not
--   move. A block region can be "still", which stops animations, so each animation needs
--   !important. The rules must not require the sf-still class: a region does not always have it,
--   and then nothing of the mark draws.
tern.css("palette", [[
:root:root:root .tn-stage > .tn-pane.pip[aria-label^="Go to,"] {
	position: fixed !important;
	top: 12vh !important;
	left: calc(50vw - 320px) !important;
	right: auto !important;
	bottom: auto !important;
	width: 640px !important;
	height: 511px !important;
	max-height: calc(88vh - 20px);
	border: none;
	border-radius: 12px;
	background: transparent;
	box-shadow: 0 0 0 4000px rgba(0, 0, 0, 0.55);
}
:root:root:root .tn-stage > .tn-pane.pip[aria-label^="Go to,"] > .tn-head,
:root:root:root .tn-stage > .tn-pane.pip[aria-label^="Go to,"] > .tn-pip-grip,
:root:root:root .tn-stage > .tn-pane.pip[aria-label^="Go to,"] > .tn-grip,
:root:root:root .tn-stage > .tn-pane.pip[aria-label^="Go to,"]::before,
:root:root:root .tn-stage > .tn-pane.pip[aria-label^="Go to,"]::after,
[data-surface="plugin.goto.picker"].sf-dock {
	display: none;
}
:root:root:root .tn-stage > .tn-pane.pip[aria-label^="Go to,"] .tv-grid {
	opacity: 0;
}
:root:root:root .tn-stage > .tn-pane.pip[aria-label^="Go to,"] .tv-cover {
	inset: 0 !important;
	padding: 0 !important;
}
[data-surface="plugin.goto.picker"].sf-main {
	height: 100%;
	padding: 0 !important;
}
[data-surface="plugin.goto.picker"] .goto-box {
	position: static;
	transform: none;
	width: 640px !important;
	max-width: 100% !important;
	height: 511px !important;
	max-height: 100% !important;
	margin: 0 auto !important;
	flex: none !important;
	display: flex !important;
	flex-direction: column !important;
}
[data-surface="plugin.goto.picker"] .goto-box > .sf-list {
	flex: 1 1 auto !important;
	min-height: 0 !important;
	padding: 12px 8px 6px;
}
[data-surface="plugin.goto.picker"] .goto-box > .sf-list[data-role='goto.flat'] {
	padding-bottom: 19px;
}
[data-surface="plugin.goto.picker"] .goto-box > .ck-foot {
	flex: none !important;
}
[data-surface="plugin.goto.picker"] .goto-box .sf-list-scroll {
	max-height: 100% !important;
	height: 100%;
}
[data-surface="plugin.goto.picker"] .goto-box .sf-item {
	min-height: 0 !important;
	padding-top: 0 !important;
	padding-bottom: 0 !important;
	padding-left: 10px;
	line-height: 22px;
	border-radius: 6px;
}
[data-surface="plugin.goto.picker"] .goto-box .sf-t-dim {
	opacity: 0.3;
}
[data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-icon {
	display: inline-block;
	width: 22px;
	text-align: center;
	font-family: "Symbols Nerd Font", monospace !important;
	margin: 0 !important;
}
[data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-num {
	position: relative;
	display: inline-block;
	box-sizing: border-box;
	width: 12px;
	height: 12px;
	margin: 0 5px;
	border-radius: 50%;
	vertical-align: middle;
}
:root:root:root [data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-num.sf-t-accent {
	box-shadow: inset 0 0 0 1.5px rgb(from var(--accent) r g b/22%) !important;
}
:root:root:root [data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-num.sf-t-accent::after {
	content: '';
	position: absolute;
	inset: 0;
	box-sizing: border-box;
	border-radius: 50%;
	border: 1.5px solid var(--accent);
	border-right-color: transparent;
	border-bottom-color: transparent;
	animation: tnHdSpin 0.8s linear infinite !important;
}
:root:root:root [data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-num.sf-t-em {
	box-shadow: inset 0 0 0 1.5px rgb(from var(--accent) r g b/22%) !important;
	animation: sf-turn 0.9s steps(12) infinite !important;
}
:root:root:root [data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-num.sf-t-em::after {
	content: '';
	position: absolute;
	left: 4.5px;
	top: 0;
	width: 3px;
	height: 3px;
	border-radius: 50%;
	background: var(--accent);
}
:root:root:root [data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-num.sf-t-ins {
	width: 14px;
	height: 4px;
	margin: 0 4px;
	border-radius: 999px;
	overflow: hidden;
	background: var(--l2);
	text-decoration: none;
}
:root:root:root [data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-num.sf-t-ins::after {
	content: '';
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
	width: 30%;
	border-radius: inherit;
	background: var(--accent);
	animation: sf-indet 1.3s steps(16) infinite !important;
}
:root:root:root [data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-num.sf-t-del {
	width: 4px;
	height: 4px;
	margin: 0 2px 0 3px;
	background: var(--accent);
	text-decoration: none;
	animation: sf-dot 1.2s steps(6) infinite !important;
}
:root:root:root [data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-num.sf-t-del + .sf-t-num.sf-t-del {
	margin-left: 0;
	animation-delay: 0.16s !important;
}
:root:root:root [data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-num.sf-t-del + .sf-t-num.sf-t-del + .sf-t-num.sf-t-del {
	margin-right: 3px;
	animation-delay: 0.32s !important;
}
:root:root:root [data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-num.sf-t-mark {
	background: transparent !important;
}
:root:root:root [data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-num.sf-t-mark::before,
:root:root:root [data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-num.sf-t-mark::after {
	content: '';
	position: absolute;
	inset: 0;
	border-radius: 50%;
	box-shadow: inset 0 0 0 1.5px var(--warn);
	animation: tnRing 2.8s linear infinite !important;
}
:root:root:root [data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-num.sf-t-mark::after {
	animation-delay: 0.35s !important;
}
[data-surface="plugin.goto.picker"] .goto-box .sf-item-label .sf-t-num.sf-t-muted {
	box-shadow: inset 0 0 0 1.5px var(--t4);
}
[data-surface="plugin.goto.picker"] .goto-box .sf-item[data-role='goto.sep'] {
	position: relative;
	height: 13px !important;
	line-height: 13px !important;
	pointer-events: none;
	background: transparent !important;
	box-shadow: none !important;
}
[data-surface="plugin.goto.picker"] .goto-box .sf-item[data-role='goto.sep']::after {
	content: '';
	position: absolute;
	left: 10px;
	right: 10px;
	top: 6px;
	height: 1px;
	background: var(--l2);
}
[data-surface="plugin.goto.picker"] .goto-where {
	flex: 1;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}
]])

-- The open picker: its pane, and whether its first focus settled, so that a later focus elsewhere
-- closes it. Nil when no picker is open in this window.
local picker = nil

-- The palette darkens the whole window, but the picker pane's shadow stops at the pane area. This
-- sheet darkens the rest while a picker is open, and is empty otherwise (CSS cannot tell that the
-- picker is open):
-- - The tab bar strip and the window edges are the window background, which no element draws, so
--   an inset shadow on the body darkens it, with the palette's 55% black.
-- - The tab bar items and the file tree draw above that background. A brightness filter of 0.45
--   darkens them and their text the same way as the palette's veil; opacity would let the
--   background show through instead.
local VEIL = [[
:root:root body {
	box-shadow: inset 0 0 0 4000px rgba(0, 0, 0, 0.55);
}
:root:root #tabbar > .tb-in,
:root:root .tn-stage > nav.ft {
	filter: brightness(0.45);
}
]]

-- Turns the veil over the file tree and tab bar on or off.
local function set_veil(on)
	tern.css("veil", if on then VEIL else "")
end
set_veil(false)

-- A tab's label in the tab bar: the name you gave it, else the title of its focused pane.
local function tab_label(tab)
	if tab.name and tab.name ~= "" then
		return tab.name
	end
	return tab.title
end

-- The panes of a split tree, left to right and top to bottom.
local function tiled_panes(node, out)
	if node.pane then
		table.insert(out, node.pane)
		return
	end
	if node[1] then
		tiled_panes(node[1], out)
	end
	if node[2] then
		tiled_panes(node[2], out)
	end
end

-- The roles that omp puts in its dock or layer region while it waits for you: a question of the
-- ask tool, or the plan approval list. Tern reports such an agent as working.
local WAIT_ROLES = { ["omp.ask.question"] = true, ["omp.plan.options"] = true }

-- What omp shows about its state in the dock and layer regions of its surface (omp's TSP UI):
-- whether it waits for you, its working row ("working", "retry" with a countdown meter, or
-- "compacting" with a progress bar), whether an error banner is pinned, and whether a HUD pill
-- counts running subagents or background jobs ("2 agents running"). Reads only these two small
-- regions: the main region holds the whole chat. Agents without an omp surface give nothing, and
-- their status comes from Tern alone.
local function omp_signals(cx, pane)
	local sig = { waiting = false, working = nil, error = false, jobs = false }
	local function walk(node)
		local p = node.p or {}
		local role = p.role
		if WAIT_ROLES[role] then
			sig.waiting = true
		elseif role == "omp.errorBanner" then
			sig.error = true
		elseif role == "omp.hud.pill" then
			sig.jobs = true
		elseif role == "omp.working" then
			sig.working = "working"
			for _, child in node.c or {} do
				if child.k == "meter" then
					sig.working = "retry"
				elseif child.k == "progress" then
					sig.working = "compacting"
				end
			end
		end
		for _, child in node.c or {} do
			walk(child)
		end
	end
	for _, root in { "dock", "layer" } do
		local ok, tree = pcall(function()
			return cx.session:surface(pane, { as = "table", root = root, depth = 24, nodes = 2000, max_chars = 80 })
		end)
		if ok and type(tree) == "table" and type(tree.main) == "table" then
			walk(tree.main)
		end
	end
	return sig
end

-- The status of a pane row (see STATUS in host.luau). An agent is exited, waits for your input, is
-- retrying, compacting or working, shows an error, has subagents or background jobs running while
-- it is idle, is done (idle with output you have not seen) or is idle. A plain terminal is running
-- a command or has an unseen alert. Nil for a quiet terminal.
local function pane_status(cx, info, agent)
	if agent == nil then
		if info.alert then
			return "alert"
		end
		return if info.busy then "running" else nil
	end
	if agent.state == "exited" then
		return "exited"
	end
	local sig = omp_signals(cx, info.pane)
	if sig.waiting or agent.state == "waiting_input" then
		return "input"
	elseif sig.working == "retry" then
		return "retrying"
	elseif sig.working == "compacting" then
		return "compacting"
	elseif sig.working or agent.state == "working" then
		return "working"
	elseif sig.error then
		return "error"
	elseif sig.jobs then
		return "background"
	end
	return if info.alert then "done" else "idle"
end

-- The statuses that put a pane in the Waiting on you group, in the group's order: the pane waits
-- for your input, shows an error, has an unseen terminal alert, is done, or is an idle agent. The
-- host half hides the idle rows until you show them (ctrl+; then i).
local ATTENTION = { input = 1, error = 2, alert = 3, done = 4, idle = 5 }

-- The key of a pane or tab id in the `seen` maps; JSON object keys are strings.
local function seen_key(id)
	return string.format("%d", id)
end

-- The last seen order (GLOSSARY.md). tern.kv keeps under `seen` a counter `n` and, by id, the
-- count at the last focus of each pane (`panes`) and tab (`tabs`). A count, not a time, so two
-- focuses within one second keep their order. A reload resets the Lua state, and every window
-- shares the store, so the maps live there.
local function load_seen()
	local seen = tern.kv.get("seen")
	if type(seen) ~= "table" then
		seen = {}
	end
	seen.n = if type(seen.n) == "number" then seen.n else 0
	seen.panes = if type(seen.panes) == "table" then seen.panes else {}
	seen.tabs = if type(seen.tabs) == "table" then seen.tabs else {}
	return seen
end

-- Notes a focus of `pane` in `tab`: every focus counts at once. A floating pane's focus counts for
-- its tab only, and the picker's own focus does not count. A parked pane has no tab.
local function note_seen(cx, pane, tab)
	local info = cx.session:pane(pane)
	if info == nil or info.block == KIND then
		return
	end
	local seen = load_seen()
	seen.n += 1
	if tab then
		seen.tabs[seen_key(tab)] = seen.n
	end
	if not info.floating then
		seen.panes[seen_key(pane)] = seen.n
	end
	tern.kv.set("seen", seen)
end

-- Drops a closed pane or tab from the `seen` map `field`.
local function forget_seen(field, id)
	local seen = load_seen()
	if seen[field][seen_key(id)] ~= nil then
		seen[field][seen_key(id)] = nil
		tern.kv.set("seen", seen)
	end
end

-- `ids` last seen first: the ones in `counts` by their last focus, newest first, then the others
-- in their given order.
local function last_seen_first(ids, counts)
	local place = {}
	for i, id in ids do
		place[id] = i
	end
	local sorted = table.clone(ids)
	table.sort(sorted, function(a, b)
		local count_a, count_b = counts[seen_key(a)], counts[seen_key(b)]
		if count_a and count_b then
			return count_a > count_b
		elseif count_a or count_b then
			return count_a ~= nil
		end
		return place[a] < place[b]
	end)
	return sorted
end

-- The name of the remote host of each session; local sessions have none.
local function remote_hosts(cx)
	local names = {}
	for _, host in cx.hosts:list() do
		if host.kind == "remote" then
			names[host.id] = host.name
		end
	end
	local by_session = {}
	for _, session in cx.sessions:list() do
		by_session[session.id] = names[session.host]
	end
	return by_session
end

-- The picker's rows: each session in Tern's order, its tabs and each split tab's tiled panes last
-- seen first. Each row keeps the index of its session and tab rows, for search and for
-- the place of a Waiting on you row. A pane row, and the row of a tab with one pane, is marked
-- `agent` when Tern lists its pane as an agent; a split tab row is marked `agent` when one of its
-- panes is, and names in `solo` the row of its only agent pane, so that host.luau shows such a tab
-- as one row with agents only. After the tree rows come the Waiting on you rows (marked `group`),
-- which host.luau shows first: a copy of each tree row whose status is in ATTENTION, except the row
-- you are in, by status and then tree order.
-- Returns the rows and the index of the row of `focused`, or of the current session when no pane
-- has focus (a session with no tabs).
local function collect(cx, focused)
	local agents = {}
	for _, agent in cx.agents:list() do
		agents[agent.pane] = agent
	end
	local tabs = {}
	for _, tab in cx.session:tabs() do
		tabs[tab.id] = tab
	end
	local hosts = remote_hosts(cx)
	local seen = load_seen()
	local focused_tab = if focused then cx.session:tab_of(focused) else nil
	local rows = {}
	local current = 1
	for _, session in cx.session:sessions() do
		table.insert(rows, {
			kind = "session",
			id = session.id,
			label = session.name,
			host = hosts[session.id],
		})
		local session_row = #rows
		if focused == nil and session.current then
			current = session_row
		end
		for _, tab_id in last_seen_first(session.tabs, seen.tabs) do
			local tab = tabs[tab_id]
			local layout = cx.session:layout(tab_id)
			if tab and layout then
				local panes = {}
				tiled_panes(layout.root, panes)
				-- A tab with one pane is one row with that pane's status; only a split tab lists its
				-- panes under it, so no name shows twice.
				local single = if #panes == 1 then cx.session:pane(panes[1]) else nil
				local status = if single then pane_status(cx, single, agents[panes[1]]) else nil
				table.insert(rows, {
					kind = "tab",
					id = tab_id,
					label = tab_label(tab),
					status = status,
					agent = single ~= nil and agents[panes[1]] ~= nil,
					session = session_row,
				})
				local tab_row = #rows
				if tab_id == focused_tab then
					current = tab_row
				end
				if single == nil then
					local agent_rows = {}
					for _, pane_id in last_seen_first(panes, seen.panes) do
						local info = cx.session:pane(pane_id)
						if info then
							table.insert(rows, {
								kind = "pane",
								id = pane_id,
								label = info.title,
								status = pane_status(cx, info, agents[pane_id]),
								agent = agents[pane_id] ~= nil,
								session = session_row,
								tab = tab_row,
							})
							if agents[pane_id] then
								table.insert(agent_rows, #rows)
							end
							if pane_id == focused then
								current = #rows
							end
						end
					end
					rows[tab_row].agent = #agent_rows > 0
					rows[tab_row].solo = if #agent_rows == 1 then agent_rows[1] else nil
				end
			end
		end
	end
	local group = {}
	for i, row in rows do
		if row.status and ATTENTION[row.status] and i ~= current then
			table.insert(group, i)
		end
	end
	table.sort(group, function(a, b)
		local rank_a, rank_b = ATTENTION[rows[a].status], ATTENTION[rows[b].status]
		if rank_a ~= rank_b then
			return rank_a < rank_b
		end
		return a < b
	end)
	for _, i in group do
		local copy = table.clone(rows[i])
		copy.group = true
		table.insert(rows, copy)
	end
	return rows, current
end

-- Closes the open picker, if any.
local function close_picker(cx)
	local open = picker
	picker = nil
	set_veil(false)
	if open and cx.session:pane(open.pane) then
		cx.layout:close(open.pane)
	end
end

-- The tiled pane that a floating pane floats over, or the pane itself when it is tiled.
local function tiled_owner(cx, pane)
	local tab = cx.session:tab_of(pane)
	local layout = if tab then cx.session:layout(tab) else nil
	if layout then
		for _, float in layout.floats do
			if float.pane == pane then
				return float.over
			end
		end
	end
	return pane
end

-- Opens the picker as a float over the focused pane. A key press hands focus back to the pane
-- that had it once the keymap action returns, so focus goes to the picker again after 60 ms, and
-- only then does a focus elsewhere close it. A session with no tabs has no pane to float over, so
-- there the picker opens as the only pane of a new tab, and that tab closes with the picker.
local function open_picker(cx)
	local focused = cx.session:focused()
	if focused then
		note_seen(cx, focused, cx.session:tab_of(focused))
	end
	local rows, current = collect(cx, focused)
	local launch = { block = KIND, args = { tern.json.encode({ rows = rows, current = current }) } }
	local pane
	if focused == nil then
		if cx.layout:new_tab(launch) ~= nil then
			pane = cx.session:focused()
		end
	else
		local owner = tiled_owner(cx, focused)
		pane = cx.layout:split(owner, "right", launch, { focus = false })
		if pane then
			local ok, why = cx.layout:float(pane, owner, "br", { focus = true })
			if not ok then
				cx.layout:close(pane)
				cx:toast("error", "Could not open the Go to picker", why)
				return
			end
		end
	end
	if pane == nil then
		cx:toast("error", "Could not open the Go to picker", "The goto plugin is not loaded on this host.")
		return
	end
	picker = { pane = pane, settled = false }
	set_veil(true)
	cx.layout:focus(pane)
	tern.timer(60, function(later)
		if later == nil or picker == nil or picker.pane ~= pane then
			return
		end
		later.layout:focus(pane)
		picker.settled = true
	end)
end

-- Opens the picker, or closes it when it is open (f1 in settings.json).
tern.command({
	id = "open",
	title = "Go to session, tab or pane",
	run = function(cx)
		if picker and cx.session:pane(picker.pane) then
			close_picker(cx)
		else
			open_picker(cx)
		end
	end,
})

-- The picker's links: goto:session/<id>, goto:tab/<id>, goto:pane/<id> and goto:close. Links from
-- any pane other than the open picker change nothing.
tern.route.link(function(link, cx)
	local kind, id = string.match(link.url, "^goto:(%a+)/?(%d*)$")
	if kind == nil then
		return nil
	end
	if picker == nil or link.pane ~= picker.pane then
		return { handled = true }
	end
	close_picker(cx)
	local target = tonumber(id)
	if target == nil then
		return { handled = true }
	end
	if kind == "session" then
		cx.sessions:switch(target)
	elseif kind == "tab" then
		local layout = cx.session:layout(target)
		if layout then
			cx.layout:focus(layout.focus)
		end
	elseif kind == "pane" and cx.session:pane(target) then
		cx.layout:focus(target)
	end
	return { handled = true }
end)

-- Notes each focus for the last seen order. Focus that leaves the open picker closes it.
tern.on("focus", function(ev, cx)
	note_seen(cx, ev.pane, ev.tab)
	if picker and picker.settled and ev.pane ~= picker.pane then
		close_picker(cx)
	end
end)

-- Forgets a picker that closed some other way, and the last focus of a closed pane.
tern.on("pane_closed", function(ev, _cx)
	forget_seen("panes", ev.pane)
	if picker and ev.pane == picker.pane then
		picker = nil
		set_veil(false)
	end
end)

-- Forgets the last focus of a closed tab.
tern.on("tab_closed", function(ev, _cx)
	forget_seen("tabs", ev.tab)
end)

-- A plugin reload starts this half with no open picker, but a picker pane from before stays open
-- and no longer closes by itself. window_start does not run after a reload, so a timer started when
-- this script loads closes such panes.
tern.timer(0, function(cx)
	if cx == nil then
		return
	end
	for _, pane in cx.session:panes() do
		if pane.block == KIND then
			cx.layout:close(pane.pane)
		end
	end
end)
