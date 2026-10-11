-- Zellij actions with no Tern built-in. settings.json binds them as plugin.zellij-keys.<id>.

-- Zellij floating panes: the shown floating panes of a tab form a cascade, as Zellij draws them.
-- Each float is half the tab in width and in height. The first float is centered. Each later float
-- sits 16 px (2 terminal cells) to the right of the one before it and 32 px (2 rows) lower, in open
-- order. After 8 places, the cascade starts at the top again and keeps going right. The rules cover
-- the 16 floats that Tern draws at most over one tiled pane (see place_floats), and a later drawn
-- float, over a second tiled pane, takes the 16th place. Tern paints the focused float on top.
-- The rules depend on Tern's class names. Each float is a `.tn-pane.pip` child of `.tn-stage`, in
-- open order whatever its corner. The stage also keeps the panes of the other tabs that you looked
-- at, with `off`. A float that Tern does not draw has `off` and `pip-hidden`, and a stashed float
-- has `off`. The rules leave out these floats and the Go to picker, whose accessible name starts
-- with "Go to,". So `:nth-child(k of ...)` counts the drawn floating panes of the tab you look at.
-- Tern writes the position, size and transform of a float inline, so each rule needs !important.
-- `transform: none` cancels the tilt and scale of the floats without focus (`pip-glance`,
-- `pip-peek`). The `.tn-pip-chip` rule hides Tern's "Show all" chip.
local CASCADE_PLACES = 16
local CASCADE_ROWS = 8
-- The offset of each cascade place from the one before it, in px.
local CASCADE_DX = 16
local CASCADE_DY = 32
local cascade = {
	[[
:root:root .tn-stage > .tn-pane.pip:not([aria-label^="Go to,"]):not(.off) {
	left: 25% !important;
	top: 25% !important;
	right: auto !important;
	bottom: auto !important;
	width: 50% !important;
	height: 50% !important;
	transform: none !important;
}
:root:root .tn-pip-chip {
	display: none !important;
}
]],
}
for place = 2, CASCADE_PLACES do
	local nth = if place == CASCADE_PLACES then `n+{place}` else tostring(place)
	table.insert(
		cascade,
		string.format(
			':root:root .tn-stage > .tn-pane.pip:nth-child(%s of .pip:not([aria-label^="Go to,"]):not(.off)):not(.off) {\n'
				.. "\tleft: calc(25%% + %dpx) !important;\n\ttop: calc(25%% + %dpx) !important;\n}\n",
			nth,
			(place - 1) * CASCADE_DX,
			((place - 1) % CASCADE_ROWS) * CASCADE_DY
		)
	)
end
tern.css("float-size", table.concat(cascade))

-- Tern animates a floating pane as it grows into focus, shrinks back or slides away, and CSS cannot
-- stop it: only the global reduce_motion setting does. So before a command or handler here changes
-- a float, reduce_motion goes "on" for 400 ms, then back to the user's value. The user's value waits
-- in tern.kv meanwhile, so a reload or crash in between restores it at the next window start.
-- Floats focused or unfocused with the mouse still animate: no hook runs before those.
-- While reduce_motion is on and the window is idle, a tern.timer or tern.sleep fires only at the next
-- input. So the 400 ms wait is a `/bin/sleep 0.4` process, whose end Tern reports on time.
local MOTION_KEY = "reduce_motion_before_float"
-- The number of the last quiet_float_motion call. Only the wait of the last call restores the value.
local motion_wait = 0

local function restore_motion(cx)
	local saved = tern.kv.get(MOTION_KEY)
	if saved ~= nil then
		cx.settings:set("reduce_motion", saved)
		tern.kv.set(MOTION_KEY, nil)
	end
end

local function quiet_float_motion(cx)
	if tern.kv.get(MOTION_KEY) == nil then
		local current = cx.settings:get("reduce_motion")
		if current == "on" then
			return
		end
		tern.kv.set(MOTION_KEY, current)
		cx.settings:set("reduce_motion", "on")
	end
	motion_wait += 1
	local wait = motion_wait
	tern.process.run({ "/bin/sleep", "0.4" }, function(_result, later)
		if wait == motion_wait and later then
			restore_motion(later)
		end
	end)
end

tern.on("window_start", restore_motion)

local function current_tab(cx, pane)
	local tab_id = cx.session:tab_of(pane)
	for _, tab in cx.session:tabs() do
		if tab.id == tab_id then
			return tab
		end
	end
	return nil
end

-- The refocus timer of the last focus_pane call, while it waits.
local pending_focus = nil

local function cancel_pending_focus()
	if pending_focus then
		pending_focus:cancel()
		pending_focus = nil
	end
end

-- Focuses a pane now and again after the key press: a real key press hands focus back to the pane
-- that had it once the keymap action returns. Focusing a hidden floating pane shows it, so the retry
-- runs only while focus is still in the same tab, and a newer focus_pane or a hide cancels it.
local function focus_pane(cx, pane)
	cancel_pending_focus()
	local tab = cx.session:tab_of(pane)
	cx.layout:focus(pane)
	local handle
	handle = tern.timer(50, function(later)
		if pending_focus ~= handle then
			return
		end
		pending_focus = nil
		if later == nil then
			return
		end
		local now = later.session:focused()
		if now == nil or now == pane or later.session:tab_of(now) ~= tab then
			return
		end
		later.layout:focus(pane)
	end)
	pending_focus = handle
end

-- Zellij keeps the floating panes of a tab shown or hidden together. Tern does not tell a plugin
-- whether a float is hidden, so tern.kv keeps a map from tab id to true under SHOWN_KEY while the
-- floats of that tab are shown. LAST_KEY maps a tab id to its last used floating pane. A reload of any
-- plugin resets the Lua state of every plugin, and tern.kv keeps both maps.
local SHOWN_KEY = "shown_floats"
local LAST_KEY = "last_float"

-- Zellij floating panes: the value of one tab in the tern.kv map under `key`.
local function tab_value(key, tab)
	local map = tern.kv.get(key)
	return if map then map[tostring(tab)] else nil
end

-- Zellij floating panes: sets the value of one tab in the tern.kv map under `key`. nil removes it.
local function set_tab_value(key, tab, value)
	local map = tern.kv.get(key) or {}
	if map[tostring(tab)] == value then
		return
	end
	map[tostring(tab)] = value
	tern.kv.set(key, map)
end

-- Zellij floating panes: the Go to picker of the goto plugin floats too, but it is not a floating pane.
local function is_picker(info)
	return info ~= nil and info.block == "goto.picker"
end

-- Zellij floating panes: the floating panes of a tab, oldest first, without the Go to picker.
local function tab_floats(cx, tab)
	local layout = if tab then cx.session:layout(tab) else nil
	local floats = {}
	if layout then
		for _, float in layout.floats do
			if not is_picker(cx.session:pane(float.pane)) then
				table.insert(floats, float)
			end
		end
	end
	return floats
end

-- Zellij ToggleFloatingPanes, the hide half: hides every floating pane of the active tab. Tern's
-- pip_stash_all hides the floats of the active tab when one of them shows, and shows them all when
-- all are hidden.
local function hide_floats(cx, tab)
	set_tab_value(SHOWN_KEY, tab, nil)
	quiet_float_motion(cx)
	cancel_pending_focus()
	cx:command("pip_stash_all")
end

-- Zellij ToggleFloatingPanes, the show half: shows the hidden floating panes of the active tab
-- without a change of focus.
local function show_floats(cx, tab)
	if tab_value(SHOWN_KEY, tab) == true or #tab_floats(cx, tab) == 0 then
		return
	end
	set_tab_value(SHOWN_KEY, tab, true)
	quiet_float_motion(cx)
	cx:command("pip_stash_all")
end

-- Zellij ToggleFloatingPanes through Tern's own key or palette entry for pip_stash_all. Tern runs
-- its command after this one and toggles the floats of the active tab, so the kept state flips too.
-- A call from cx:command does not come here.
tern.override("pip_stash_all", function(cx)
	local focused = cx.session:focused()
	local tab = if focused then cx.session:tab_of(focused) else nil
	if tab then
		set_tab_value(SHOWN_KEY, tab, if tab_value(SHOWN_KEY, tab) == true then nil else true)
	end
	return false
end)

-- Zellij ToggleFloatingPanes: the last used floating pane of the tab, else the newest one.
local function last_float(tab, floats)
	local last = tab_value(LAST_KEY, tab)
	for _, float in floats do
		if float.pane == last then
			return last
		end
	end
	return floats[#floats].pane
end

-- The tiled pane a floating pane belongs to, or the pane itself when it is tiled.
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

-- The floating pane or Go to picker that has focus, else nil: { pane, tab, over, order }. `over` is
-- the tiled pane under it, and `order` lists the floating panes of its tab by open order.
local focused_float = nil
-- The tab of the last focus that focus_moved saw. A focus in another tab is a tab or session switch.
local focus_tab = nil

-- Tern draws at most 4 floating panes in each corner stack (the floats of one tiled pane in one
-- corner) and hides the oldest ones of a fuller stack, also when one of them has focus. Tern draws
-- the whole stack only while the pointer is over it (Tern calls this a fanned deck), one stack at a
-- time, and a plugin has no action that fans a stack. So the floats of each tiled pane fill the
-- corners in this order, oldest first. The bottom right stack comes first, so a few floats still
-- slide off to the right when they hide, and it keeps one place free for the Go to picker, which
-- goto opens there. So Tern draws 15 floats per tiled pane, and 16 when it has more and the picker
-- is closed.
-- The corner does not change where a shown float sits, because the cascade rules place it.
local CORNERS = { "br", "bl", "tr", "tl" }
local CORNER_ROOM = { 3, 4, 4, 4 }
local DRAWN_FLOATS = 15

-- Zellij floating panes: puts each floating pane of `tab` in its corner stack. With more than 15
-- floats over one tiled pane, the bottom right stack takes the extra ones, and Tern hides the oldest
-- of them: one less than the extra floats, or all of them while the Go to picker is open. The
-- focused float `keep` never goes to a hidden place, so focus never lands on a float that Tern does
-- not draw.
local function place_floats(cx, tab, keep)
	local owners = {}
	local by_owner = {}
	for _, float in tab_floats(cx, tab) do
		if by_owner[float.over] == nil then
			by_owner[float.over] = {}
			table.insert(owners, float.over)
		end
		table.insert(by_owner[float.over], float)
	end
	local quiet = false
	for _, owner in owners do
		local floats = by_owner[owner]
		local extra = math.max(0, #floats - DRAWN_FLOATS)
		local corner_of = {}
		local taken = 0
		for i, float in floats do
			if taken < extra + CORNER_ROOM[1] and not (float.pane == keep and i <= extra) then
				corner_of[float.pane] = 1
				taken += 1
			end
		end
		local corner = 2
		local room = CORNER_ROOM[corner]
		for _, float in floats do
			if corner_of[float.pane] == nil then
				if room == 0 then
					corner += 1
					room = CORNER_ROOM[corner]
				end
				corner_of[float.pane] = corner
				room -= 1
			end
		end
		for _, float in floats do
			local target = CORNERS[corner_of[float.pane]]
			if float.corner ~= target then
				if not quiet then
					quiet_float_motion(cx)
					quiet = true
				end
				cx.layout:float(float.pane, owner, target, { focus = false })
			end
		end
	end
end

-- Zellij floating panes: the own spot of each float that you moved or resized. tern.kv keeps a map
-- from pane id to { x, y, w, h, l, r, t, b } under SPOTS_KEY until the float closes or docks. x, y,
-- w and h are parts of the tab (0 to 1), so a spot scales with the tab. l, r, t and b mark an edge
-- that sits 10 px from that tab edge, the gap of Tern's own corner cards.
local SPOTS_KEY = "float_spots"
-- One move or resize step, as a part of the tab.
local STEP = 0.1
-- An edge that ends this close to a tab edge after a move or resize snaps to it.
local SNAP = 0.05
-- The smallest width or height of a float, as a part of the tab.
local MIN_SIZE = 0.2
-- A plugin cannot read the size of the tab. A float that leaves its cascade place turns the px
-- offsets of that place into parts of a tab of this size, the tab of a 1280 by 800 window.
local TAB_GUESS = { w = 1260, h = 710 }

-- Zellij floating panes: the own spot of `pane`, else nil while it sits at its cascade place.
local function spot_of(pane)
	local spots = tern.kv.get(SPOTS_KEY)
	return if spots then spots[tostring(pane)] else nil
end

-- Zellij floating panes: keeps `spot` as the own spot of `pane`. nil puts it back at its cascade place.
local function set_spot(pane, spot)
	local spots = tern.kv.get(SPOTS_KEY) or {}
	if spots[tostring(pane)] == nil and spot == nil then
		return
	end
	spots[tostring(pane)] = spot
	tern.kv.set(SPOTS_KEY, spots)
end

-- Zellij floating panes: forgets the spots of panes that are gone or no longer float. A tab close
-- sends no pane_closed for its panes, and a new Tern daemon starts its pane ids again.
local function prune_spots(cx)
	local spots = tern.kv.get(SPOTS_KEY)
	if spots == nil then
		return
	end
	for key in spots do
		local info = cx.session:pane(tonumber(key))
		if not (info and info.floating) then
			set_spot(key, nil)
		end
	end
end

-- Zellij floating panes: one CSS rule that draws the float at `place` in open order at `spot`. It
-- counts the floats the same way as the cascade rules and wins over them with one more `:root`.
local function spot_rule(place, spot)
	local function edge(snap_low, snap_high, at, size)
		if snap_low then
			return "10px"
		elseif snap_high then
			return string.format("calc(%.2f%% - 10px)", (1 - size) * 100)
		end
		return string.format("%.2f%%", at * 100)
	end
	local function length(snap_low, snap_high, size)
		return if snap_low and snap_high then "calc(100% - 20px)" else string.format("%.2f%%", size * 100)
	end
	return string.format(
		':root:root:root .tn-stage > .tn-pane.pip:nth-child(%d of .pip:not([aria-label^="Go to,"]):not(.off)):not(.off) {\n'
			.. "\tleft: %s !important;\n\ttop: %s !important;\n\twidth: %s !important;\n\theight: %s !important;\n}\n",
		place,
		edge(spot.l, spot.r, spot.x, spot.w),
		edge(spot.t, spot.b, spot.y, spot.h),
		length(spot.l, spot.r, spot.w),
		length(spot.t, spot.b, spot.h)
	)
end

-- Zellij floating panes: draws each float of `tab` that has its own spot there. The rules count only
-- the drawn floats, and those are the floats of the tab you look at, so this runs again on each
-- focus, close and spot change. While the floats of `tab` hide, the rules match nothing.
local function render_spots(cx, tab)
	local rules = {}
	for place, float in tab_floats(cx, tab) do
		local spot = spot_of(float.pane)
		if spot then
			table.insert(rules, spot_rule(place, spot))
		end
	end
	tern.css("float-spots", table.concat(rules))
end

-- Zellij floating panes: the spot of the cascade place of `pane`, the start of its first move or resize.
local function cascade_spot(cx, tab, pane)
	local k = 0
	for place, float in tab_floats(cx, tab) do
		if float.pane == pane then
			k = place - 1
		end
	end
	return {
		x = 0.25 + k * CASCADE_DX / TAB_GUESS.w,
		y = 0.25 + (k % CASCADE_ROWS) * CASCADE_DY / TAB_GUESS.h,
		w = 0.5,
		h = 0.5,
	}
end

-- Zellij floating panes: keeps `spot` inside the tab, at least MIN_SIZE big, and snaps each edge
-- that ends within SNAP of a tab edge to that edge.
local function settle(spot)
	local function axis(at, size)
		size = math.clamp(size, MIN_SIZE, 1)
		at = math.clamp(at, 0, 1 - size)
		local low = at <= SNAP + 1e-6
		local high = at + size >= 1 - SNAP - 1e-6
		if low and high then
			at, size = 0, 1
		elseif low then
			at = 0
		elseif high then
			at = 1 - size
		end
		return math.round(at * 10000) / 10000, math.round(size * 10000) / 10000, low, high
	end
	spot.x, spot.w, spot.l, spot.r = axis(spot.x, spot.w)
	spot.y, spot.h, spot.t, spot.b = axis(spot.y, spot.h)
end

-- Zellij floating panes: changes the spot of the focused float with `change`, settles it and draws
-- it. Returns false when no floating pane has focus, so the caller acts on the tiled pane instead.
local function change_spot(cx, change)
	local pane = cx.session:focused()
	local info = if pane then cx.session:pane(pane) else nil
	if not (info and info.floating) or is_picker(info) then
		return false
	end
	local tab = cx.session:tab_of(pane)
	local spot = spot_of(pane) or cascade_spot(cx, tab, pane)
	change(spot)
	settle(spot)
	quiet_float_motion(cx)
	set_spot(pane, spot)
	render_spots(cx, tab)
	return true
end

-- Zellij floating panes: a floating pane gets focus. It becomes the last used floating pane of its
-- tab, the floats of that tab count as shown, and each float goes to its corner stack. The Go to
-- picker changes none of these.
local function note_float_focus(cx, info, tab)
	local order = {}
	for _, float in tab_floats(cx, tab) do
		table.insert(order, float.pane)
	end
	focused_float = { pane = info.pane, tab = tab, over = tiled_owner(cx, info.pane), order = order }
	if not is_picker(info) then
		set_tab_value(LAST_KEY, tab, info.pane)
		set_tab_value(SHOWN_KEY, tab, true)
		place_floats(cx, tab, info.pane)
	end
end

-- Zellij floating panes: focus moved to `pane` in `tab`. The own spots of the floats of `tab` draw
-- again, because a tab switch changes the drawn floats. A tiled pane forgets its own spot, so
-- a docked float that floats again starts at its cascade place. When it is a tiled pane and the last focus
-- was in the same tab, the shown floats of the tab hide. A tab or session switch hides nothing, also
-- when it lands on a tiled pane of a tab whose floats are shown. While focus_pane waits to focus a
-- float again, a key press handed focus back to a tiled pane for a moment, and that hides nothing.
local function focus_moved(cx, pane, tab)
	local info = cx.session:pane(pane)
	if info == nil or tab == nil then
		return
	end
	render_spots(cx, tab)
	local from_tab = focus_tab
	focus_tab = tab
	if info.floating then
		note_float_focus(cx, info, tab)
		return
	end
	focused_float = nil
	set_spot(pane, nil)
	if from_tab ~= tab then
		return
	end
	if pending_focus == nil and tab_value(SHOWN_KEY, tab) == true then
		if #tab_floats(cx, tab) > 0 then
			hide_floats(cx, tab)
		else
			set_tab_value(SHOWN_KEY, tab, nil)
		end
	end
end

-- Zellij floating panes: a focus on a tiled pane (a click, a key or an open) hides the floats of its
-- tab. A focus in another tab hides nothing, so a tab or session switch keeps them shown. The event
-- comes after the move, and a later move can follow before it, so only the focused pane counts.
tern.on("focus", function(ev, cx)
	if cx.session:focused() == ev.pane then
		focus_moved(cx, ev.pane, ev.tab)
	end
end)

-- Zellij CloseFocus on a floating pane: Tern moves focus to the tiled pane under the closed float.
-- While other floats of the tab are shown, focus goes to the last used one instead, else to the one
-- before the closed pane in open order, else the one after it. The Go to picker counts as a float
-- here, so Esc in a picker opened from a float goes back to that float. A jump from the picker that
-- moved focus to another pane keeps it there. Tern gives no event that tells Esc from a jump to the
-- tiled pane under the picker, so that jump also goes back to the float.
tern.on("pane_closed", function(ev, cx)
	local last = tern.kv.get(LAST_KEY)
	if last then
		for tab, pane in last do
			if pane == ev.pane then
				set_tab_value(LAST_KEY, tab, nil)
			end
		end
	end
	set_spot(ev.pane, nil)
	local focused = cx.session:focused()
	render_spots(cx, if focused then cx.session:tab_of(focused) else nil)
	local closed = focused_float
	if closed == nil or closed.pane ~= ev.pane then
		return
	end
	focused_float = nil
	local floats = tab_floats(cx, closed.tab)
	if #floats == 0 then
		set_tab_value(SHOWN_KEY, closed.tab, nil)
		return
	end
	if tab_value(SHOWN_KEY, closed.tab) ~= true or cx.session:focused() ~= closed.over then
		return
	end
	local open = {}
	for _, float in floats do
		open[float.pane] = true
	end
	local target = tab_value(LAST_KEY, closed.tab)
	if not open[target] then
		target = nil
		local at = table.find(closed.order, closed.pane) or (#closed.order + 1)
		for i = at - 1, 1, -1 do
			if target == nil and open[closed.order[i]] then
				target = closed.order[i]
			end
		end
		for i = at + 1, #closed.order do
			if target == nil and open[closed.order[i]] then
				target = closed.order[i]
			end
		end
	end
	quiet_float_motion(cx)
	cx.layout:focus(target or floats[#floats].pane)
end)

-- Zellij CloseTab: forgets the floats of the closed tab and their spots.
tern.on("tab_closed", function(ev, cx)
	set_tab_value(LAST_KEY, ev.tab, nil)
	set_tab_value(SHOWN_KEY, ev.tab, nil)
	prune_spots(cx)
end)

-- Zellij floating panes: a reload resets focused_float and focus_tab, so a timer started when this
-- script loads notes the focused pane again, forgets stale spots and draws the kept ones. window_start
-- does not run after a reload.
tern.timer(0, function(cx)
	local pane = if cx then cx.session:focused() else nil
	local info = if pane then cx.session:pane(pane) else nil
	if info then
		focus_tab = cx.session:tab_of(pane)
		prune_spots(cx)
		render_spots(cx, focus_tab)
		if info.floating then
			note_float_focus(cx, info, focus_tab)
		end
	end
end)

-- Zellij MoveFocus among floating panes: left and up step to the previous floating pane in open
-- order, and right and down to the next, wrapping. Returns false from a tiled pane.
local function step_float_focus(cx, focused, step)
	local info = cx.session:pane(focused)
	if not (info and info.floating) then
		return false
	end
	local floats = tab_floats(cx, cx.session:tab_of(focused))
	for i, float in floats do
		if float.pane == focused and #floats > 1 then
			quiet_float_motion(cx)
			focus_pane(cx, floats[(i - 1 + step) % #floats + 1].pane)
		end
	end
	return true
end

-- Zellij floating pane: a new floating pane over the focused tiled pane (or over the pane the focused
-- floating pane belongs to), running `command` or, without one, a shell. The hidden floats of the tab
-- show first, so the new float opens on top of them with focus.
local function open_float(cx, command)
	local focused = cx.session:focused()
	if focused == nil then
		return
	end
	local owner = tiled_owner(cx, focused)
	quiet_float_motion(cx)
	show_floats(cx, cx.session:tab_of(focused))
	local launch = if command then { command = command } else nil
	local pane = cx.layout:split(owner, "right", launch)
	if pane == nil then
		return
	end
	local ok, why = cx.layout:float(pane, owner, "br", { focus = true })
	if not ok then
		cx:toast("error", "Could not open a floating pane", why)
		return
	end
	focus_pane(cx, pane)
end

-- Zellij NewPane: a floating shell when a floating pane has focus, else a pane split to the right.
tern.command({
	id = "new_pane",
	title = "New pane (floating from a floating pane)",
	run = function(cx)
		local focused = cx.session:focused()
		if focused == nil then
			return
		end
		local info = cx.session:pane(focused)
		if info and info.floating then
			open_float(cx, nil)
		else
			cx:command("split_right")
		end
	end,
})

-- Zellij `Run ... { floating true; close_on_exit true }`.
local function float_command(id, title, command)
	tern.command({
		id = id,
		title = title,
		icon = "terminal",
		run = function(cx)
			open_float(cx, command)
		end,
	})
end

-- Tern runs `command` through the login shell, and bash's login PATH here lacks /opt/homebrew/bin.
float_command("float_yazi", "Float yazi", "/opt/homebrew/bin/yazi")
float_command("float_lazygit", "Float lazygit", "/opt/homebrew/bin/lazygit")
float_command("float_btop", "Float btop", "/opt/homebrew/bin/btop")

-- Zellij ToggleFloatingPanes: from a floating pane, hide the floating panes of the tab. From a tiled
-- pane, show them over that pane and focus the last used one. With none, open a floating shell.
tern.command({
	id = "toggle_floating_panes",
	title = "Toggle floating panes",
	run = function(cx)
		local focused = cx.session:focused()
		if focused == nil then
			return
		end
		local tab = cx.session:tab_of(focused)
		local floats = tab_floats(cx, tab)
		if #floats == 0 then
			open_float(cx, nil)
			return
		end
		local info = cx.session:pane(focused)
		if info and info.floating then
			hide_floats(cx, tab)
			return
		end
		quiet_float_motion(cx)
		show_floats(cx, tab)
		for _, float in floats do
			if float.over ~= focused then
				cx.layout:float(float.pane, focused, float.corner, { focus = false })
			end
		end
		focus_pane(cx, last_float(tab, floats))
	end,
})

-- Zellij TogglePaneEmbedOrFloating: float the focused pane, or dock it again when it floats. A pane
-- that floats shows the hidden floats of the tab first and joins them. A docked pane is a tiled pane
-- with focus, so the other floats hide.
tern.command({
	id = "toggle_float",
	title = "Float or dock the focused pane",
	run = function(cx)
		local focused = cx.session:focused()
		if focused == nil then
			return
		end
		local tab = cx.session:tab_of(focused)
		local info = cx.session:pane(focused)
		quiet_float_motion(cx)
		local ok, why
		if info and info.floating then
			ok, why = cx.layout:dock(focused)
		else
			show_floats(cx, tab)
			ok, why = cx.layout:float(focused, nil, nil, { focus = true })
		end
		if ok then
			cx.layout:focus(focused)
			focus_moved(cx, focused, tab)
		else
			cx:toast("error", "Could not float or dock the pane", why)
		end
	end,
})

-- Zellij BreakPane: the focused pane into a new tab.
tern.command({
	id = "break_pane",
	title = "Break pane to new tab",
	run = function(cx)
		local focused = cx.session:focused()
		if focused == nil then
			return
		end
		local _, why = cx.layout:move_to_new_tab(focused)
		if why then
			cx:toast("error", "Could not break pane", why)
		end
	end,
})

-- Zellij BreakPaneLeft and BreakPaneRight: the focused pane into the tab beside, or a new tab past the last.
local function break_beside(id, title, step)
	tern.command({
		id = id,
		title = title,
		run = function(cx)
			local focused = cx.session:focused()
			if focused == nil then
				return
			end
			local tab = current_tab(cx, focused)
			if tab == nil then
				return
			end
			local target = nil
			for _, other in cx.session:tabs() do
				if other.session == tab.session and other.position == tab.position + step then
					target = other.id
				end
			end
			local why
			if target then
				_, why = cx.layout:move_to_tab(focused, target)
			else
				local new_tab
				new_tab, why = cx.layout:move_to_new_tab(focused)
				if new_tab and step < 0 then
					cx.layout:order_tab(new_tab, 1)
				end
			end
			if why then
				cx:toast("error", "Could not break pane", why)
			end
		end,
	})
end

break_beside("break_pane_left", "Break pane to the tab on the left", -1)
break_beside("break_pane_right", "Break pane to the tab on the right", 1)

-- Zellij MoveFocus: among the floating panes from a floating pane, else the tiled pane on that side.
local function focus_dir(id, title, dir, step)
	tern.command({
		id = id,
		title = title,
		run = function(cx)
			local before = cx.session:focused()
			if before and step_float_focus(cx, before, step) then
				return
			end
			cancel_pending_focus()
			cx:action("focus_pane:" .. dir)
		end,
	})
end

focus_dir("focus_left", "Focus the pane on the left", "left", -1)
focus_dir("focus_right", "Focus the pane on the right", "right", 1)
focus_dir("focus_up", "Focus the pane above", "up", -1)
focus_dir("focus_down", "Focus the pane below", "down", 1)

-- Zellij MoveFocusOrTab: among the floating panes from a floating pane, else the tiled pane on that
-- side, else the tab on that side.
local function focus_or_tab(id, title, dir, step, tab_action)
	tern.command({
		id = id,
		title = title,
		run = function(cx)
			local before = cx.session:focused()
			if before and step_float_focus(cx, before, step) then
				return
			end
			cancel_pending_focus()
			cx:action("focus_pane:" .. dir)
			if cx.session:focused() == before then
				cx:action(tab_action)
			end
		end,
	})
end

focus_or_tab("focus_or_tab_left", "Focus the pane or tab on the left", "left", -1, "previous_tab")
focus_or_tab("focus_or_tab_right", "Focus the pane or tab on the right", "right", 1, "next_tab")

-- Zellij MovePane on a floating pane: moves the focused float a STEP of the tab that way, up to the
-- tab edge. A tiled pane runs Tern's own move_pane.
local function move_float(dir, dx, dy)
	tern.override("move_pane:" .. dir, function(cx)
		return change_spot(cx, function(spot)
			spot.x += dx * STEP
			spot.y += dy * STEP
		end)
	end)
end

move_float("left", -1, 0)
move_float("right", 1, 0)
move_float("up", 0, -1)
move_float("down", 0, 1)

-- Zellij Resize Increase or Decrease with a direction: makes the focused float narrower (left),
-- wider (right), shorter (up) or taller (down) by a STEP of the tab, and its top-left corner stays.
-- A tiled pane moves its divider with Tern's resize_split, which a plugin cannot override.
local function resize_dir(id, title, dir, dw, dh)
	tern.command({
		id = id,
		title = title,
		run = function(cx)
			local floated = change_spot(cx, function(spot)
				spot.w += dw * STEP
				spot.h += dh * STEP
			end)
			if not floated then
				cx:action("resize_split:" .. dir)
			end
		end,
	})
end

resize_dir("resize_left", "Resize: narrower float or divider left", "left", -1, 0)
resize_dir("resize_right", "Resize: wider float or divider right", "right", 1, 0)
resize_dir("resize_up", "Resize: shorter float or divider up", "up", 0, -1)
resize_dir("resize_down", "Resize: taller float or divider down", "down", 0, 1)

-- Zellij Resize Increase and Resize Decrease: grows or shrinks the focused float by a STEP of the
-- tab on each side, and its center stays. A tiled pane does not change.
local function resize_all(id, title, step)
	tern.command({
		id = id,
		title = title,
		run = function(cx)
			change_spot(cx, function(spot)
				spot.x -= step / 2
				spot.y -= step / 2
				spot.w += step
				spot.h += step
			end)
		end,
	})
end

resize_all("resize_increase", "Grow the floating pane", STEP)
resize_all("resize_decrease", "Shrink the floating pane", -STEP)

-- Zellij has no reset for a floating pane. Tern's equalize on a floating pane puts it back at its
-- cascade place and size. A tiled pane runs Tern's own equalize.
tern.override("equalize", function(cx)
	local pane = cx.session:focused()
	local info = if pane then cx.session:pane(pane) else nil
	if not (info and info.floating) or is_picker(info) then
		return false
	end
	quiet_float_motion(cx)
	set_spot(pane, nil)
	render_spots(cx, cx.session:tab_of(pane))
	return true
end)
