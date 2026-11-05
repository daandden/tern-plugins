-- Zellij actions with no Tern built-in. settings.json binds them as plugin.zellij-keys.<id>.

-- The tab of `pane`, with its session and position.
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

-- Zellij floating panes: whether a floating pane of `tab` shows. Tern gives a stashed float no view.
local function floats_shown(cx, tab)
	for _, float in tab_floats(cx, tab) do
		if cx.session:view(float.pane, { depth = 0, nodes = 1 }) ~= nil then
			return true
		end
	end
	return false
end

-- Zellij ToggleFloatingPanes on Tern's pip_stash_all, which stashes every float of the active tab or
-- brings them all back. Tern picks the way from its own last pip_stash_all, also one in another tab,
-- and not from the floats of the tab (stencil-hq/tern-sdk#255). So when the floats of `tab` do not
-- end shown as `shown` says, the first run went the other way, and a second run goes the right way.
local function stash_all(cx, tab, shown)
	cx:command("pip_stash_all")
	if floats_shown(cx, tab) ~= shown then
		cx:command("pip_stash_all")
	end
end

-- Zellij ToggleFloatingPanes, the hide half: hides every floating pane of `tab`, the active tab.
local function hide_floats(cx, tab)
	cancel_pending_focus()
	stash_all(cx, tab, false)
end

-- Zellij ToggleFloatingPanes, the show half: unstashes every floating pane of the active tab,
-- without a change of focus. Does nothing when every float is already unstashed.
local function show_floats(cx, tab)
	for _, float in tab_floats(cx, tab) do
		if cx.session:view(float.pane, { depth = 0, nodes = 1 }) == nil then
			stash_all(cx, tab, true)
			return
		end
	end
end

-- Zellij ToggleFloatingPanes through Tern's own key or palette entry for pip_stash_all: hides the
-- floats of the active tab when one of them shows, else shows them all. In a tab with no floating
-- pane, Tern's own command runs. A call from cx:command does not come here.
tern.override("pip_stash_all", function(cx)
	local focused = cx.session:focused()
	local tab = if focused then cx.session:tab_of(focused) else nil
	if tab == nil or #tab_floats(cx, tab) == 0 then
		return false
	end
	if floats_shown(cx, tab) then
		hide_floats(cx, tab)
	else
		show_floats(cx, tab)
	end
	return true
end)

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
-- tab, unless it is the Go to picker.
local function note_float_focus(cx, info, tab)
	local order = {}
	for _, float in tab_floats(cx, tab) do
		table.insert(order, float.pane)
	end
	focused_float = { pane = info.pane, tab = tab, over = tiled_owner(cx, info.pane), order = order }
	if not is_picker(info) then
		set_tab_value(LAST_KEY, tab, info.pane)
	end
end

-- Zellij floating panes: notes each focus of a floating pane for pane_closed. The event comes after
-- the move, and a later move can follow before it, so only the focused pane counts.
tern.on("focus", function(ev, cx)
	if cx.session:focused() ~= ev.pane then
		return
	end
	local info = cx.session:pane(ev.pane)
	if info and info.floating and ev.tab then
		note_float_focus(cx, info, ev.tab)
	else
		focused_float = nil
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
	if #floats == 0 or not floats_shown(cx, closed.tab) or cx.session:focused() ~= closed.over then
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
	cx.layout:focus(target or floats[#floats].pane)
end)

-- Zellij CloseTab: forgets the last used float of the closed tab.
tern.on("tab_closed", function(ev, cx)
	set_tab_value(LAST_KEY, ev.tab, nil)
end)

-- Zellij floating panes: a reload resets focused_float, so a timer started when this script loads
-- notes the focused float again. window_start does not run after a reload.
tern.timer(0, function(cx)
	local pane = if cx then cx.session:focused() else nil
	local info = if pane then cx.session:pane(pane) else nil
	if info and info.floating then
		note_float_focus(cx, info, cx.session:tab_of(pane))
	end
end)

-- Zellij floating pane: a new floating pane over the focused tiled pane (or over the pane the focused
-- floating pane belongs to), running `command` at glance size `size`. The hidden floats of the tab
-- show first, so the new float opens on top of them with focus.
local function open_float(cx, command, size)
	local focused = cx.session:focused()
	if focused == nil then
		return
	end
	local owner = tiled_owner(cx, focused)
	show_floats(cx, cx.session:tab_of(focused))
	local pane = cx.layout:split(owner, "right", { command = command })
	if pane == nil then
		return
	end
	local ok, why = cx.layout:float(pane, owner, nil, { focus = true, size = size })
	if not ok then
		cx:toast("error", "Could not open a floating pane", why)
		return
	end
	focus_pane(cx, pane)
end

-- Plugin processes inherit the launcher's PATH, which may lack Homebrew. GIT_TERMINAL_PROMPT=0
-- makes a fetch that needs a password fail at once instead of waiting for input that never comes.
local GIT = "/opt/homebrew/bin/git"
local OMP = "/opt/homebrew/bin/omp"
local GIT_ENV = { GIT_TERMINAL_PROMPT = "0" }
local FETCH_TIMEOUT_MS = 30000
local worktree_busy = false

-- Runs `argv` and calls `cb(result, cx)` with the callback's window context.
local function worktree_step(argv, cb, cwd)
	tern.process.run(argv, { env = GIT_ENV, cwd = cwd }, function(result, later)
		if not later then
			worktree_busy = false
			return
		end
		local ok, why = pcall(cb, result, later)
		if not ok then
			worktree_busy = false
			later:toast("error", "Could not open a worktree agent tab", tostring(why))
		end
	end)
end

-- Runs git in `dir` as one step of a worktree_agent_tab press. Tern kills only the parent on
-- timeout, so a timeout goes through gtimeout, which also kills transports holding its output open.
local function git(dir, args, opts, cb)
	local argv = if opts.timeout_ms
		then { "/opt/homebrew/bin/gtimeout", "--kill-after=1s", `{opts.timeout_ms / 1000}s`, GIT, "-C", dir }
		else { GIT, "-C", dir }
	for _, arg in args do
		table.insert(argv, arg)
	end
	worktree_step(argv, cb)
end

-- The first line of git's output, without its line end.
local function first_line(text)
	return string.match(text, "^([^\n]*)") or ""
end

-- Ends a press of worktree_agent_tab with a toast.
local function worktree_stop(cx, level, text, sub)
	worktree_busy = false
	cx:toast(level, text, sub)
end

-- Opens a tab that runs omp in `path`.
local function worktree_open_tab(cx, path)
	worktree_busy = false
	local ok, tab = pcall(function()
		return cx.layout:new_tab({ cwd = path, command = OMP })
	end)
	if not ok or tab == nil then
		cx:toast("error", "Could not open an agent tab", if ok then path else tostring(tab))
	end
end

-- The folder of omp's worktrees: OMP_WORKTREE_DIR, else omp's setting worktree.base, else ~/.omp/wt.
local function worktree_dir(cx, main, cb)
	local home = tern.getenv("HOME") or ""
	local from_env = tern.getenv("OMP_WORKTREE_DIR")
	if from_env and from_env ~= "" then
		cb(cx, (string.gsub(from_env, "^~", home)))
		return
	end
	worktree_step({ OMP, "config", "get", "worktree.base" }, function(config, cx)
		local base = first_line(config.stdout)
		if config.status ~= 0 or base == "" or base == "(not set)" then
			base = `{home}/.omp/wt`
		end
		cb(cx, (string.gsub(base, "^~", home)))
	end, main)
end

-- Adds a worktree on a new wt/<time> branch at `base` and opens its agent tab. omp's worktree add
-- clones the main checkout's ignored files (worktree.clone), checks out `base` and leaves the main
-- checkout, its branch and its changes as they were.
local function worktree_open(cx, main, base)
	git(main, { "rev-parse", "--verify", "--quiet", "--short=7", base .. "^{commit}" }, {}, function(commit, cx)
		local short = first_line(commit.stdout)
		if commit.status ~= 0 or short == "" then
			worktree_stop(cx, "error", `Could not find {base}`, main)
			return
		end
		worktree_step({ "/bin/date", "+%Y%m%d-%H%M%S" }, function(date, cx)
			local stamp = first_line(date.stdout)
			worktree_dir(cx, main, function(cx, dir)
				local path = `{dir}/wt-{stamp}-{short}`
				local argv = { OMP, "worktree", "add", "--quiet", "-C", main, "-b", `wt/{stamp}`, path, base }
				worktree_step(argv, function(added, cx)
					if added.status ~= 0 then
						local why = if added.stderr ~= "" then added.stderr else added.stdout
						worktree_stop(cx, "error", "Could not add a worktree", first_line(why))
					else
						worktree_open_tab(cx, path)
					end
				end, main)
			end)
		end)
	end)
end

-- Refuses an ahead or diverged default branch, then opens at origin/<branch> or the local fallback.
local function worktree_compare(cx, main, branch)
	local range = `{branch}...origin/{branch}`
	git(main, { "rev-list", "--left-right", "--count", range }, {}, function(counts, cx)
		local ahead, behind = string.match(counts.stdout, "^(%d+)%s+(%d+)")
		if counts.status ~= 0 or not ahead then
			git(main, { "rev-parse", "--verify", "--quiet", `refs/remotes/origin/{branch}` }, {}, function(remote, cx)
				worktree_open(cx, main, if remote.status == 0 then `origin/{branch}` else branch)
			end)
		elseif ahead ~= "0" and behind ~= "0" then
			worktree_stop(cx, "error", `{branch} has diverged from origin/{branch}`, "Push or reset it first.")
		elseif ahead ~= "0" then
			local commits = if ahead == "1" then "commit" else "commits"
			worktree_stop(cx, "error", `{branch} has {ahead} unpushed {commits}`, "Push or reset first.")
		else
			worktree_open(cx, main, `origin/{branch}`)
		end
	end)
end

-- Fetches the default branch from origin, then compares. A fetch that fails or times out compares
-- with the origin/<branch> that git already has, so unpushed commits that git knows of still stop.
local function worktree_update(cx, main, branch)
	cx:toast("info", `Updating {branch}…`)
	git(main, { "fetch", "--quiet", "origin", branch }, { timeout_ms = FETCH_TIMEOUT_MS }, function(fetched, cx)
		if fetched.status ~= 0 then
			cx:toast("info", `Could not reach origin; {branch} may be old`, first_line(fetched.stderr))
		end
		worktree_compare(cx, main, branch)
	end)
end

-- Checks that the main checkout has no staged, unstaged or untracked changes.
-- `--untracked-files=normal` overrides a repo's `status.showUntrackedFiles=no`.
local function worktree_check(cx, main, branch, has_origin)
	git(main, { "status", "--porcelain", "--untracked-files=normal" }, {}, function(status, cx)
		if status.status ~= 0 then
			worktree_stop(cx, "error", "Could not read the main checkout", first_line(status.stderr))
		elseif status.stdout ~= "" then
			worktree_stop(cx, "error", "The main checkout has uncommitted changes", main)
		elseif has_origin then
			worktree_update(cx, main, branch)
		else
			worktree_open(cx, main, branch)
		end
	end)
end

-- Names the default branch: the branch origin/HEAD points to, else the one of main and master that
-- exists. Both or neither ends the press with a toast.
local function worktree_branch(cx, main)
	git(main, { "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD" }, {}, function(origin_head, cx)
		local from_origin = string.match(first_line(origin_head.stdout), "^origin/(.+)$")
		git(main, { "remote" }, {}, function(remotes, cx)
			local has_origin = string.find(`\n{remotes.stdout}`, "\norigin\n", 1, true) ~= nil
			if from_origin then
				worktree_check(cx, main, from_origin, has_origin)
				return
			end
			git(main, { "branch", "--list", "--format=%(refname:short)", "main", "master" }, {}, function(list, cx)
				local found = {}
				for name in string.gmatch(list.stdout, "[^\n]+") do
					table.insert(found, name)
				end
				if #found ~= 1 then
					worktree_stop(cx, "error", "No default branch", "Run: git remote set-head origin -a")
				else
					worktree_check(cx, main, found[1], has_origin)
				end
			end)
		end)
	end)
end

-- Zellij NewTab, with an agent in a new worktree at the default branch of the focused pane's repo.
tern.command({
	id = "worktree_agent_tab",
	title = "New agent tab in a new worktree",
	run = function(cx)
		if worktree_busy then
			return
		end
		local pane = cx.session:focused()
		local info = pane and cx.session:pane(pane)
		local cwd = info and info.cwd or ""
		if cwd == "" then
			cx:toast("error", "Not in a git repo", "Alt+Shift+T opens a plain agent tab.")
			return
		end
		worktree_busy = true
		git(cwd, { "worktree", "list", "--porcelain" }, {}, function(list, cx)
			local main = string.match(list.stdout, "^worktree ([^\n]+)")
			if list.status ~= 0 or not main then
				worktree_stop(cx, "error", "Not in a git repo", "Alt+Shift+T opens a plain agent tab.")
			elseif string.find(list.stdout, "^worktree [^\n]+\nbare\n") then
				worktree_stop(cx, "error", "The repo has no main checkout", main)
			else
				worktree_branch(cx, main)
			end
		end)
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

-- Zellij MoveFocusOrTab: the tiled pane on that side, else the tab on that side.
local function focus_or_tab(id, title, dir, tab_action)
	tern.command({
		id = id,
		title = title,
		run = function(cx)
			local before = cx.session:focused()
			cancel_pending_focus()
			cx:action("focus_pane:" .. dir)
			if cx.session:focused() == before then
				cx:action(tab_action)
			end
		end,
	})
end

focus_or_tab("focus_or_tab_left", "Focus the pane or tab on the left", "left", "previous_tab")
focus_or_tab("focus_or_tab_right", "Focus the pane or tab on the right", "right", "next_tab")

-- Zellij `Run ... { floating true; close_on_exit true }`: the program in a floating pane that asks
-- Tern for 80% of the tab in width and in height. Tern caps the focused float smaller.
local function float_command(id, title, command)
	tern.command({
		id = id,
		title = title,
		icon = "terminal",
		run = function(cx)
			open_float(cx, command, { 0.8, 0.8 })
		end,
	})
end

float_command("float_yazi", "Float yazi", "/opt/homebrew/bin/yazi")
float_command("float_lazygit", "Float lazygit", "/opt/homebrew/bin/lazygit")
float_command("float_btop", "Float btop", "/opt/homebrew/bin/btop")

-- Zellij Resize Increase and Resize Decrease: grows or shrinks the focused float in width and in
-- height with Tern's resize_split, one step each. Tern keeps the float in its corner and moves the
-- two edges away from that corner, so the direction that grows a float depends on its corner: right
-- and down grow a float in the top left corner, left and up one in the bottom right. A tiled pane
-- does not change.
local function resize_all(id, title, grow)
	tern.command({
		id = id,
		title = title,
		run = function(cx)
			local pane = cx.session:focused()
			local info = if pane then cx.session:pane(pane) else nil
			if not (info and info.floating) or is_picker(info) then
				return
			end
			for _, float in tab_floats(cx, cx.session:tab_of(pane)) do
				if float.pane == pane then
					local left = string.sub(float.corner, 2, 2) == "l"
					local top = string.sub(float.corner, 1, 1) == "t"
					cx:action("resize_split:" .. if left == grow then "right" else "left")
					cx:action("resize_split:" .. if top == grow then "down" else "up")
				end
			end
		end,
	})
end

resize_all("resize_increase", "Grow the floating pane", true)
resize_all("resize_decrease", "Shrink the floating pane", false)
