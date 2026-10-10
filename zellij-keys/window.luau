-- Zellij actions with no Tern built-in. settings.json binds them as plugin.zellij-keys.<id>.

-- Zellij floating panes: the shown floating panes of a tab form a cascade, as Zellij draws them.
-- Each float is half the tab in width and in height. The first float is centered. Each later float
-- sits 16 px (2 terminal cells) to the right of the one before it and 32 px (2 rows) lower, in open
-- order. The rules cover 8 places, and a 9th or later float takes the 8th place. Tern paints the
-- focused float on top.
-- The rules depend on Tern's class names. Each float is a `.tn-pane.pip` child of `.tn-stage`, in
-- open order, and a hidden float has the class `off`. The rules leave out hidden floats and the Go to
-- picker, whose accessible name starts with "Go to,". So `:nth-child(k of ...)` counts the floating
-- panes only. Tern writes the position, size and transform of a float inline, so each rule needs
-- !important. `transform: none` cancels the tilt and scale of the floats without focus (`pip-glance`,
-- `pip-peek`). The `.tn-pip-chip` rule hides Tern's "Show all" chip.
local CASCADE_PLACES = 8
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
			':root:root .tn-stage > .tn-pane.pip:nth-child(%s of .pip:not([aria-label^="Go to,"])):not(.off) {\n'
				.. "\tleft: calc(25%% + %dpx) !important;\n\ttop: calc(25%% + %dpx) !important;\n}\n",
			nth,
			(place - 1) * 16,
			(place - 1) * 32
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

-- Zellij floating panes: a floating pane gets focus. It becomes the last used floating pane of its
-- tab, and the floats of that tab count as shown. The Go to picker changes neither.
local function note_float_focus(cx, info, tab)
	local order = {}
	for _, float in tab_floats(cx, tab) do
		table.insert(order, float.pane)
	end
	focused_float = { pane = info.pane, tab = tab, over = tiled_owner(cx, info.pane), order = order }
	if not is_picker(info) then
		set_tab_value(LAST_KEY, tab, info.pane)
		set_tab_value(SHOWN_KEY, tab, true)
	end
end

-- Zellij floating panes: focus moved to `pane` in `tab`. When it is a tiled pane, the shown floats of
-- the tab hide. While focus_pane waits to focus a float again, a key press handed focus back to a
-- tiled pane for a moment, and that hides nothing.
local function focus_moved(cx, pane, tab)
	local info = cx.session:pane(pane)
	if info == nil or tab == nil then
		return
	end
	if info.floating then
		note_float_focus(cx, info, tab)
		return
	end
	focused_float = nil
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

-- Zellij CloseTab: forgets the floats of the closed tab.
tern.on("tab_closed", function(ev, _cx)
	set_tab_value(LAST_KEY, ev.tab, nil)
	set_tab_value(SHOWN_KEY, ev.tab, nil)
end)

-- Zellij floating panes: a reload resets focused_float while a float has focus, so a timer started
-- when this script loads notes the focused float again. window_start does not run after a reload.
tern.timer(0, function(cx)
	local pane = if cx then cx.session:focused() else nil
	local info = if pane then cx.session:pane(pane) else nil
	if info and info.floating then
		note_float_focus(cx, info, cx.session:tab_of(pane))
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
