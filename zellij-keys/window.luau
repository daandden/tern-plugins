-- Zellij actions with no Tern built-in. settings.json binds them as plugin.zellij-keys.<id>.

-- Zellij floating panes: a focused floating pane fills the middle 75% of the tab, as zellij centers
-- its floats. Tern sets a float's position and size inline, so the rule needs !important; the
-- terminal inside resizes to the new box. Unfocused (glance) and hidden floats keep Tern's corner.
tern.css("float-size", [[
:root:root .tn-stage > .tn-pane.pip.pip-focus {
	inset: 12.5% !important;
	width: auto !important;
	height: auto !important;
}
]])

-- Tern animates a floating pane as it grows into focus, shrinks back or slides away, and CSS cannot
-- stop it: only the global reduce_motion setting does. So before a command here changes a float,
-- reduce_motion goes "on" for 400 ms, then back to the user's value. The user's value waits in
-- tern.kv meanwhile, so a reload or crash in between restores it at the next window start.
-- Floats focused or unfocused with the mouse still animate: no hook runs before those.
local MOTION_KEY = "reduce_motion_before_float"
local motion_timer = nil

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
	if motion_timer then
		motion_timer:cancel()
	end
	motion_timer = tern.timer(400, function(later)
		motion_timer = nil
		if later then
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

-- The tab's floating panes, oldest first.
local function tab_floats(cx, pane)
	local tab = cx.session:tab_of(pane)
	local layout = if tab then cx.session:layout(tab) else nil
	return if layout then layout.floats else {}
end

-- Zellij MoveFocus among floating panes. Tern stacks a tab's floating panes in one corner, so left and
-- up step to the previous one and right and down to the next, wrapping. Returns false from a tiled pane.
local function step_float_focus(cx, focused, step)
	local info = cx.session:pane(focused)
	if not (info and info.floating) then
		return false
	end
	local floats = tab_floats(cx, focused)
	for i, float in floats do
		if float.pane == focused and #floats > 1 then
			quiet_float_motion(cx)
			focus_pane(cx, floats[(i - 1 + step) % #floats + 1].pane)
		end
	end
	return true
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

-- Zellij floating pane: a picture in picture over the focused tiled pane (or over the pane the focused
-- floating pane belongs to), running `command` or, without one, a shell.
local function open_float(cx, command)
	local focused = cx.session:focused()
	if focused == nil then
		return
	end
	local owner = tiled_owner(cx, focused)
	quiet_float_motion(cx)
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

-- Zellij ToggleFloatingPanes: from a floating pane, hide the tab's floating panes; from a tiled pane,
-- move them over that pane and focus the newest; with none, open a floating shell.
tern.command({
	id = "toggle_floating_panes",
	title = "Toggle floating panes",
	run = function(cx)
		local focused = cx.session:focused()
		if focused == nil then
			return
		end
		local floats = tab_floats(cx, focused)
		if #floats == 0 then
			open_float(cx, nil)
			return
		end
		local info = cx.session:pane(focused)
		quiet_float_motion(cx)
		if info and info.floating then
			cancel_pending_focus()
			cx:command("pip_stash_all")
			return
		end
		for _, float in floats do
			if float.over ~= focused then
				cx.layout:float(float.pane, focused, float.corner, { focus = false })
			end
		end
		focus_pane(cx, floats[#floats].pane)
	end,
})

-- Zellij TogglePaneEmbedOrFloating: float the focused pane, or dock it again when it floats.
tern.command({
	id = "toggle_float",
	title = "Float or dock the focused pane",
	run = function(cx)
		local focused = cx.session:focused()
		if focused == nil then
			return
		end
		local info = cx.session:pane(focused)
		quiet_float_motion(cx)
		local ok, why
		if info and info.floating then
			ok, why = cx.layout:dock(focused)
		else
			ok, why = cx.layout:float(focused, nil, nil, { focus = true })
		end
		if ok then
			cx.layout:focus(focused)
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
