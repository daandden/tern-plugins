-- Go to picker, host half: the `picker` block. It shows the sessions, tabs and panes that the window
-- half passes in as a tree in Tern's picker node, each with its status dot, a jump number and its
-- working time or waiting time, and reports the row you pick as a goto: link. Under their own
-- header above the tree, the Waiting on you rows (marked `group`) repeat the panes that wait for
-- you, each named by its session, tab and pane. It opens with agent panes only. Idle agents stay
-- out of the group until you show them; tern.kv keeps that choice under `waiting_idle`.
--
-- Keys: a typed letter or space goes into the search at once. The search filters the tree rows
-- (the Waiting on you rows hide), highlights the matching characters and shows in the head.
-- A digit is a jump number and goes to its row, so a search holds no digits. A session row that
-- shows one tab row under it shares its number with that tab, which shows no number and which
-- Up/Down skips. With more than 9 numbers, every jump number has two digits; after the first
-- digit, the reachable numbers show the typed digit highlighted and rows that the second digit
-- cannot reach dim. Up/Down move, Enter goes to the row. Esc undoes one step: the first digit,
-- then the search; with nothing to undo it closes. Backspace clears the first digit, else deletes
-- the last character.
-- Actions sit behind the prefix ctrl+;: then a switches agents only and all panes, i shows or
-- hides idle agents in the group, and any other key only ends the prefix. The action bar's
-- buttons do the same on a click.

local ui = tern.ui

-- The words of a row that a search matches, in lower case: the text the row shows (its label and a
-- remote host) and the names of its tab and session, so a search like "alpha tmp" finds a pane by
-- its session too.
local function search_text(row, rows)
	local parts = { row.label, row.host or "" }
	if row.tab then
		table.insert(parts, rows[row.tab].label)
	end
	if row.session then
		table.insert(parts, rows[row.session].label)
	end
	return string.lower(table.concat(parts, " "))
end

-- Whether every word of `query` is in `text`.
local function matches(text, query)
	for word in string.gmatch(string.lower(query), "%S+") do
		if string.find(text, word, 1, true) == nil then
			return false
		end
	end
	return true
end

-- Whether a row shows with the filter. With all panes every row shows. With agents only, session
-- rows always show, a tab or pane row shows when it holds an agent pane, and the pane row of a tab
-- that holds one agent pane (`solo`) hides, because its tab row stands for it. A Waiting on you
-- row of an idle agent shows only when `state.idle` is on.
local function in_view(state, i)
	local row = state.rows[i]
	if row.group and row.status == "idle" and not state.idle then
		return false
	end
	if state.all or row.kind == "session" then
		return true
	end
	if not row.agent then
		return false
	end
	if row.kind == "pane" and not row.group then
		return state.rows[row.tab].solo ~= i
	end
	return true
end

-- Tab status priority; statuses absent from this table rank last.
local TAB_ORDER = {
	input = 1,
	error = 2,
	alert = 3,
	done = 4,
	idle = 5,
	retrying = 6,
	compacting = 7,
	working = 8,
	background = 9,
	running = 10,
	exited = 11,
}
local QUIET = 12

-- Indexes tree rows by session and tab, preserving input order and excluding Waiting on you rows.
local function tree_links(rows)
	local sessions, tabs_of, panes_of = {}, {}, {}
	for i, row in rows do
		if row.group then
			continue
		elseif row.kind == "session" then
			table.insert(sessions, i)
			tabs_of[i] = {}
		elseif row.kind == "tab" then
			table.insert(tabs_of[row.session], i)
		elseif row.kind == "pane" then
			panes_of[row.tab] = panes_of[row.tab] or {}
			table.insert(panes_of[row.tab], i)
		end
	end
	return sessions, tabs_of, panes_of
end

-- Returns the tab's status rank, using only agent panes unless all panes are shown.
local function tab_rank(state, i)
	local panes = state.panes_of[i]
	if panes == nil then
		return TAB_ORDER[state.rows[i].status or ""] or QUIET
	end
	local rank = QUIET
	for _, p in panes do
		local pane = state.rows[p]
		if state.all or pane.agent then
			rank = math.min(rank, TAB_ORDER[pane.status or ""] or QUIET)
		end
	end
	return rank
end

-- Orders each session's tabs by status, preserving last-seen order for ties and for split panes.
local function tree_order(state)
	local order = {}
	for _, session in state.sessions do
		table.insert(order, session)
		local tabs = table.clone(state.tabs_of[session])
		local rank = {}
		for _, tab in tabs do
			rank[tab] = tab_rank(state, tab)
		end
		table.sort(tabs, function(a, b)
			if rank[a] ~= rank[b] then
				return rank[a] < rank[b]
			end
			return a < b
		end)
		for _, tab in tabs do
			table.insert(order, tab)
			for _, pane in state.panes_of[tab] or {} do
				table.insert(order, pane)
			end
		end
	end
	return order
end

-- Gives the shown rows their jump numbers. A session row that shows one tab row under it shares
-- its number with that tab (`merged`), because both go to the same pane: the tab row
-- shows no number, and Up/Down skips it (`skip`). Every other row gets the next number, and the
-- Waiting on you rows keep their own. `jump_of` is the number of each shown position, and `jumps`
-- the position of the row that shows each number.
local function number_rows(state)
	local tabs = {}
	for _, i in state.shown do
		local row = state.rows[i]
		if row.kind == "tab" and not row.group then
			tabs[row.session] = tabs[row.session] or {}
			table.insert(tabs[row.session], i)
		end
	end
	state.merged, state.skip, state.jump_of, state.jumps = {}, {}, {}, {}
	for session, list in tabs do
		if #list == 1 then
			state.merged[session] = list[1]
			state.skip[list[1]] = true
		end
	end
	for position, i in state.shown do
		if not state.skip[i] then
			table.insert(state.jumps, position)
		end
		state.jump_of[position] = #state.jumps
	end
end

-- The indexes of the rows the list shows, after the filter. With no search: the Waiting on you
-- rows, then the tree. With a search: the tree rows that match, with the session and tab rows
-- above each match.
local function refilter(state)
	local shown = {}
	local tree = tree_order(state)
	if state.query == "" then
		for i, row in state.rows do
			if row.group and in_view(state, i) then
				table.insert(shown, i)
			end
		end
		for _, i in tree do
			if in_view(state, i) then
				table.insert(shown, i)
			end
		end
	else
		local keep = {}
		for _, i in tree do
			local row = state.rows[i]
			if in_view(state, i) and matches(state.texts[i], state.query) then
				keep[i] = true
				if row.session then
					keep[row.session] = true
				end
				if row.tab then
					keep[row.tab] = true
				end
			end
		end
		for _, i in tree do
			if keep[i] then
				table.insert(shown, i)
			end
		end
	end
	state.shown = shown
	state.digit = nil
	number_rows(state)
end

-- The jump number `k` as text: one digit when the list has 9 numbers or fewer, else two digits up
-- to 99. Nil past the last number.
local function jump_number(state, k)
	if k == nil or k > 99 then
		return nil
	end
	if #state.jumps <= 9 then
		return tostring(k)
	end
	return string.format("%02d", k)
end

-- The position of the cursor in the shown rows, or 0 when its row is hidden.
local function cursor_position(state)
	for position, i in state.shown do
		if i == state.cursor then
			return position
		end
	end
	return 0
end

-- Moves the cursor to the shown row at `position`, clamped to the list.
local function move_to(state, position)
	local i = state.shown[math.clamp(position, 1, math.max(1, #state.shown))]
	if i then
		state.cursor = i
	end
end

-- Moves the cursor `delta` rows up or down, past the tab rows that share their session's number.
-- At either end of the list it stays.
local function step(state, delta)
	local position = cursor_position(state) + delta
	while state.shown[position] and state.skip[state.shown[position]] do
		position += delta
	end
	if state.shown[position] then
		state.cursor = state.shown[position]
	end
end

-- Puts the cursor on the first Waiting on you row. Else on the row of the pane you are in
-- (`state.current`), or on its tab row when that tab stands for your pane, or, when the filter
-- hides your pane, on your session's row. A tab row that shares its session's number gives the
-- cursor to the session row, because Up/Down skips it.
local function place_cursor(state)
	local first = state.shown[1]
	if first and state.rows[first].group then
		state.cursor = first
		return
	end
	local candidates = { state.current }
	local here = state.rows[state.current]
	if here and here.tab and state.rows[here.tab].solo == state.current then
		table.insert(candidates, here.tab)
	end
	if here and here.session then
		table.insert(candidates, here.session)
	end
	for _, i in candidates do
		state.cursor = i
		if cursor_position(state) > 0 then
			if state.skip[i] then
				state.cursor = state.rows[i].session
			end
			return
		end
	end
	move_to(state, 1)
end

-- Sets the search. The cursor goes to the first match, or, when the search is empty, to where it
-- starts on open.
local function set_query(state, query)
	state.query = query
	refilter(state)
	if query == "" then
		place_cursor(state)
	else
		move_to(state, 1)
	end
end

-- The row that a shown row stands for: with agents only, a tab that holds one agent pane shows that
-- pane's status and goes to that pane.
local function target(state, row)
	if not state.all and row.solo then
		return state.rows[row.solo]
	end
	return row
end

-- The row that the row at index `i` goes to: a session row that shares its number with a tab goes
-- where that tab goes.
local function destination(state, i)
	return target(state, state.rows[state.merged[i] or i])
end

-- Reports the row at index `i` to the window half, which moves focus there and closes the picker.
local function go(state, i, cx)
	local to = destination(state, i)
	cx:open("goto:" .. to.kind .. "/" .. string.format("%d", to.id))
end

-- Handles a typed digit: the jump number it completes goes to its row.
local function press_digit(state, digit, cx)
	local count = math.min(#state.jumps, 99)
	local position
	if #state.jumps <= 9 then
		position = tonumber(digit)
	elseif state.digit == nil then
		if tonumber(digit) * 10 <= count then
			state.digit = digit
		end
		return
	else
		position = tonumber(state.digit .. digit)
		state.digit = nil
	end
	if position >= 1 and position <= count then
		go(state, state.shown[state.jumps[position]], cx)
	end
end

-- Adds `extra` to the style tokens `tokens`.
local function with(tokens, extra)
	if extra == nil then
		return tokens
	end
	return if tokens then tokens .. " " .. extra else extra
end

-- `text` as spans in `tokens`, with each part that a word of `query` matches (ignoring case) in
-- the highlight tokens.
local function highlighted(text, query, tokens)
	local marked = {}
	local lower = string.lower(text)
	for word in string.gmatch(string.lower(query), "%S+") do
		local from = 1
		while true do
			local s, e = string.find(lower, word, from, true)
			if s == nil then
				break
			end
			for b = s, e do
				marked[b] = true
			end
			from = e + 1
		end
	end
	local spans = {}
	local start = 1
	for b = 2, #text + 1 do
		if b > #text or (marked[b] or false) ~= (marked[start] or false) then
			local part = string.sub(text, start, b - 1)
			table.insert(spans, ui.span(part, if marked[start] then with(tokens, "accent strong") else tokens))
			start = b
		end
	end
	return spans
end

-- What each pane status shows: a dot in a Tern tone before the row, and the status's words as the
-- row's tooltip. Every busy status takes the pending dot, the one dot that Tern pulses.
local STATUS = {
	input = { dot = "warning", words = "Waits for your input" },
	retrying = { dot = "pending", words = "Retrying" },
	compacting = { dot = "pending", words = "Compacting" },
	working = { dot = "pending", words = "Working" },
	error = { dot = "error", words = "Error" },
	background = { dot = "pending", words = "Background jobs running" },
	done = { dot = "success", words = "Done" },
	idle = { dot = "muted", words = "Idle" },
	exited = { dot = "error", words = "Exited" },
	running = { dot = "pending", words = "Running a command" },
	alert = { dot = "error", words = "Alert" },
}

-- The row tone of each kind of time, which the palette sheet in window.luau gives the time column:
-- working time in the accent, waiting time in the warning tone.
local TIME_TONE = { working = "accent", waiting = "warning" }

-- The depth of each kind of tree row, for the picker's tree guides.
local DEPTH = { session = 0, tab = 1, pane = 2 }

-- The jump number as plain muted text. After the first of two digits, a row that the second digit
-- reaches shows that digit in the accent.
local function number_spans(state, number, dim)
	if state.digit and string.sub(number, 1, 1) == state.digit then
		return {
			ui.span(string.sub(number, 1, 1), "accent strong"),
			ui.span(string.sub(number, 2), "muted"),
		}
	end
	return { ui.span(number, with("muted", dim)) }
end

-- The label of a Waiting on you row: its session (muted), its tab when it is a pane row, then its
-- own name, so the row says where it is without the tree. A tab with no name of its own takes the
-- title of its focused pane, so a tab label that equals the pane's title is left out.
local function place_spans(state, row, dim)
	local spans = { ui.span(state.rows[row.session].label .. " / ", with("muted", dim)) }
	local tab = if row.tab then state.rows[row.tab].label else nil
	if tab and tab ~= row.label then
		table.insert(spans, ui.span(tab .. " / ", dim))
	end
	table.insert(spans, ui.span(row.label, dim))
	return spans
end

-- One row as a picker item: the jump number, then the label (search matches highlighted) or the
-- place of a Waiting on you row. The dot, tooltip and working or waiting time are those of the
-- pane the row stands for. A tree row with shown rows under it gets an open chevron.
local function picker_item(state, position, i, has_children)
	local row = state.rows[i]
	local number = jump_number(state, state.jump_of[position])
	local reachable = state.digit == nil or (number ~= nil and string.sub(number, 1, 1) == state.digit)
	local dim = if reachable then nil else "dim"
	local label: { any } = {}
	if state.skip[i] then
		table.insert(label, ui.span(string.rep("\u{00A0}", if #state.jumps <= 9 then 1 else 2) .. " ", dim))
	elseif number then
		for _, span in number_spans(state, number, dim) do
			table.insert(label, span)
		end
		table.insert(label, ui.span(" ", dim))
	end
	if row.group then
		for _, span in place_spans(state, row, dim) do
			table.insert(label, span)
		end
	else
		for _, span in highlighted(row.label, state.query, with(if row.kind == "session" then "strong" else nil, dim)) do
			table.insert(label, span)
		end
		if row.host then
			table.insert(label, ui.span("  @" .. row.host, with("muted", dim)))
		end
	end
	local item: { [string]: any } = { id = tostring(i), label = label }
	local shown = target(state, row)
	local status = STATUS[shown.status or ""]
	if status then
		item.dot = status.dot
		item.title = status.words
	end
	if not row.group then
		item.depth = DEPTH[row.kind]
		item.open = if has_children then true else nil
	end
	if shown.time then
		item.facts = { time = math.max(0, os.time() - shown.time.at) * 1000 }
		item.tone = TIME_TONE[shown.time.kind]
	end
	return item
end

-- The head's title while the ctrl+; prefix waits: the action keys, each named by what it does now.
local function prefix_title(state)
	if not state.prefix then
		return nil
	end
	return {
		ui.span("a", "key"),
		ui.span(if state.all then " agents only  " else " all panes  "),
		ui.span("i", "key"),
		ui.span(if state.idle then " hide idle  " else " show idle  "),
		ui.span("esc", "key"),
		ui.span(" cancel"),
	}
end

-- The picker: Tern's picker node, drawn in the block's layer as a sheet over the whole floating
-- pane. The Waiting on you rows come under their own group header, the tree under "Sessions". The
-- action bar holds the two view switches (pressed while on), Close and Go.
local function picker_view(state)
	local has_children = {}
	for _, i in state.shown do
		local row = state.rows[i]
		if not row.group then
			if row.kind == "tab" then
				has_children[row.session] = true
			elseif row.kind == "pane" then
				has_children[row.tab] = true
			end
		end
	end
	local items, waiting, tree = {}, {}, {}
	for p, i in state.shown do
		table.insert(items, picker_item(state, p, i, has_children[i]))
		table.insert(if state.rows[i].group then waiting else tree, tostring(i))
	end
	local order = {}
	if #waiting > 0 then
		table.insert(order, { group = "waiting", label = "Waiting on you", count = #waiting })
		table.move(waiting, 1, #waiting, #order + 1, order)
	end
	if #tree > 0 then
		table.insert(order, { group = "tree", label = "Sessions" })
		table.move(tree, 1, #tree, #order + 1, order)
	end
	return ui.node("picker", {
		key = "goto",
		role = "goto.picker",
		size = "screen",
		layout = "tree",
		preview = "none",
		title = prefix_title(state),
		query = state.query,
		placeholder = "Go to…",
		noun = "panes",
		items = items,
		order = order,
		selected = tostring(state.cursor),
		columns = { { id = "time", format = "elapsed" } },
		actions = {
			{ id = "all", label = "All panes", keys = { "ctrl+;", "a" }, on = state.all },
			{ id = "idle", label = "Show idle", keys = { "ctrl+;", "i" }, on = state.idle },
			{ id = "close", label = "Close", keys = { "esc" } },
			{ id = "go", label = "Go", keys = { "enter" }, primary = true },
		},
	})
end

-- Switches agents only and all panes ("all"), or shows or hides idle agents in the Waiting on you
-- group ("idle"). A cursor whose row the filter hides starts again where it starts on open, and a
-- cursor on a tab row that now shares its session's number moves to the session row.
local function toggle(state, which)
	if which == "all" then
		state.all = not state.all
	elseif which == "idle" then
		state.idle = not state.idle
		tern.kv.set("waiting_idle", state.idle)
	end
	refilter(state)
	if cursor_position(state) == 0 then
		place_cursor(state)
	elseif state.skip[state.cursor] then
		state.cursor = state.rows[state.cursor].session
	end
end

-- Handles the key after the ctrl+; prefix: a switches agents only and all panes, i shows or hides
-- idle agents. Every key ends the prefix, and any other key does nothing else.
local function action_key(state, key)
	state.prefix = false
	if key.ctrl or key.alt or key.meta then
		return
	end
	if key.text == "a" then
		toggle(state, "all")
	elseif key.text == "i" then
		toggle(state, "idle")
	end
end

-- Handles a key with no prefix waiting: search, jump numbers, moves, Esc and the ctrl+; prefix.
local function picker_key(state, key, cx)
	local name = key.name
	local text = key.text
	if key.ctrl and name == ";" and not (key.alt or key.meta) then
		state.prefix = true
	elseif name == "escape" then
		if state.digit then
			state.digit = nil
		elseif state.query ~= "" then
			set_query(state, "")
		else
			cx:open("goto:close")
		end
	elseif name == "enter" then
		if state.rows[state.cursor] and cursor_position(state) > 0 then
			go(state, state.cursor, cx)
		end
	elseif name == "up" then
		step(state, -1)
	elseif name == "down" then
		step(state, 1)
	elseif name == "backspace" then
		if state.digit then
			state.digit = nil
		else
			local last = utf8.offset(state.query, -1)
			if last == nil then
				return false
			end
			set_query(state, string.sub(state.query, 1, last - 1))
		end
	elseif key.ctrl or key.alt or key.meta or text == nil or text == "" then
		return false
	elseif string.match(text, "^%d$") then
		press_digit(state, text, cx)
	else
		set_query(state, state.query .. text)
	end
	return true
end

tern.block.define("picker", {
	init = function(_cx, args, _saved)
		local ok, data = pcall(tern.json.decode, args[1] or "")
		local rows = if ok and type(data) == "table" and type(data.rows) == "table" then data.rows else {}
		local texts = {}
		for i, row in rows do
			texts[i] = search_text(row, rows)
		end
		local sessions, tabs_of, panes_of = tree_links(rows)
		local state = {
			rows = rows,
			texts = texts,
			sessions = sessions,
			tabs_of = tabs_of,
			panes_of = panes_of,
			shown = {},
			current = if ok and type(data) == "table" then data.current or 1 else 1,
			cursor = 1,
			all = false,
			idle = tern.kv.get("waiting_idle") == true,
			query = "",
			prefix = false,
			digit = nil,
		}
		refilter(state)
		place_cursor(state)
		return state
	end,

	title = function(_state)
		return "Go to"
	end,

	view = function(state, _cx)
		return { layer = ui.col({ picker_view(state) }) }
	end,

	-- The key after ctrl+; is used up by the prefix.
	key = function(state, key, cx)
		if state.prefix then
			action_key(state, key)
			return true
		end
		return picker_key(state, key, cx)
	end,

	-- A click on a row goes there. The action bar's buttons switch the view, close the picker or go
	-- to the row under the cursor, and the empty search's Clear button clears the search.
	event = function(state, ev, cx)
		if (ev.ev == "select" or ev.ev == "activate") and type(ev.item) == "string" then
			local i = tonumber(ev.item)
			if i and state.rows[i] then
				go(state, i, cx)
			end
		elseif ev.ev == "action" then
			if ev.act == "all" or ev.act == "idle" then
				toggle(state, ev.act)
			elseif ev.act == "close" then
				cx:open("goto:close")
			elseif ev.act == "go" and state.rows[state.cursor] and cursor_position(state) > 0 then
				go(state, state.cursor, cx)
			elseif ev.act == "clear" then
				set_query(state, "")
			end
		end
	end,
})
