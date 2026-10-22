-- Go to picker, host half: the `picker` block. It shows the sessions, tabs and panes that the window
-- half passes in as a tree, each with its status mark and a jump number, and reports the row you
-- pick as a goto: link. Above the tree and a thin line, the Waiting on you rows (marked `group`)
-- repeat the panes that wait for you, each named by its session, tab and pane. It opens with agent
-- panes only. Idle agents stay out of the group until you show them; tern.kv keeps that choice
-- under `waiting_idle`.
--
-- Keys: a typed letter or space goes into the search at once. The search filters the tree rows
-- (the Waiting on you rows hide), highlights the matching characters and shows in the footer.
-- A digit is a jump number and goes to its row, so a search holds no digits. A session row that
-- shows one tab row under it shares its number with that tab, which shows no number and which
-- Up/Down skips. With more than 9 numbers, every jump number has two digits; after the first
-- digit, the reachable numbers show the typed digit highlighted and rows that the second digit
-- cannot reach dim. Up/Down move, Enter goes to the row. Esc undoes one step: the first digit,
-- then the search; with nothing to undo it closes. Backspace clears the first digit, else deletes
-- the last character.
-- Actions sit behind the prefix ctrl+;: then a switches agents only and all panes, i shows or
-- hides idle agents in the group, and any other key only ends the prefix.

local ui = tern.ui

-- The box and footer use the palette's own class names (cmdk, ck-foot, kbd), and the palette sheet
-- in window.luau does the rest of the look.

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

-- The id prefix of each row: the list node is keyed "rows" inside the box element keyed "box" in
-- the main region. The list's `selected` prop and its select/activate events use these ids.
local LIST_ID = "main.box.rows."

-- The tree lines left of each row, by shown position: a tab hangs off its session, a pane off its
-- tab. "├─ " is a branch with more below, "└─ " the last branch, "│  " the line of a parent tab
-- that has more tabs below. The rows are as tall as a text line, so the line characters join. The
-- Waiting on you rows are not part of the tree and get no lines.
local function tree_prefixes(state)
	local last = {}
	local seen_tab, seen_pane = {}, {}
	for p = #state.shown, 1, -1 do
		local i = state.shown[p]
		local row = state.rows[i]
		if row.group then
			continue
		elseif row.kind == "tab" then
			last[i] = not seen_tab[row.session]
			seen_tab[row.session] = true
		elseif row.kind == "pane" then
			last[i] = not seen_pane[row.tab]
			seen_pane[row.tab] = true
		end
	end
	local prefixes = {}
	for p, i in state.shown do
		local row = state.rows[i]
		local branch = if last[i] then "└─ " else "├─ "
		if row.group then
			prefixes[p] = ""
		elseif row.kind == "tab" then
			prefixes[p] = branch
		elseif row.kind == "pane" then
			prefixes[p] = (if last[row.tab] then "   " else "│  ") .. branch
		else
			prefixes[p] = ""
		end
	end
	return prefixes
end

-- A keycap, as the palette draws its key chords.
local function kbd(text)
	return ui.el("span", { class = "kbd", text = text })
end

-- A span of `class` that shows `text`. The text sits in a child span, with a second child after
-- it: Tern sizes such a span in the palette's flex rows by its last child only.
local function text_span(class, text)
	return ui.el("span", { class = class }, {
		ui.el("span", { text = text }),
		ui.el("span", { text = "\u{00A0}" }),
	})
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

-- What each pane status from window.luau shows: a mark with no word, after the jump number. A
-- busy status is a mark that moves and an idle one a hollow ring, which window.luau draws on a
-- no-break space, because Tern keeps only its own style tokens: "num" is the hook, and the second
-- token picks the mark (accent: turning arc, em: orbiting dot, ins: sliding bar, del: one of three
-- dots, mark: widening rings, muted: hollow ring). A status that waits for you is a still Nerd
-- Font glyph in a Tern tone, with the "icon" token as its hook. window.luau sizes every mark, and
-- the empty mark of a row with no status, to one 22 px slot, so the numbers and names line up.
local STATUS = {
	input = { glyph = "\u{F059}", tokens = "icon warning" },
	retrying = { tokens = "num mark" },
	compacting = { tokens = "num ins" },
	working = { tokens = "num accent" },
	error = { glyph = "\u{F071}", tokens = "icon error" },
	background = { tokens = "num del", count = 3 },
	done = { glyph = "\u{F00C}", tokens = "icon success" },
	idle = { tokens = "num muted" },
	exited = { glyph = "\u{F00D}", tokens = "icon error" },
	running = { tokens = "num em" },
	alert = { glyph = "\u{F0F3}", tokens = "icon error" },
}

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

-- One row as a list item: the jump number and the status mark (of the pane it stands for), then
-- the tree lines and the label (search matches highlighted), or the place of a Waiting on you row.
local function row_item(state, position, i, prefix)
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
	local status = STATUS[target(state, row).status or ""]
	if status then
		local tokens = with(status.tokens, dim)
		for _ = 1, status.count or 1 do
			table.insert(label, ui.span(status.glyph or "\u{00A0}", tokens))
		end
	else
		table.insert(label, ui.span("\u{00A0}", "icon"))
	end
	table.insert(label, ui.span(" ", dim))
	if row.group then
		for _, span in place_spans(state, row, dim) do
			table.insert(label, span)
		end
	else
		table.insert(label, ui.span(prefix, with("muted", dim)))
		for _, span in highlighted(row.label, state.query, with(if row.kind == "session" then "strong" else nil, dim)) do
			table.insert(label, span)
		end
		if row.host then
			table.insert(label, ui.span("  @" .. row.host, with("muted", dim)))
		end
	end
	return { label = label }
end

-- Every shown row in a Tern list: it scrolls with the mouse wheel and keeps the row under the
-- cursor in view. A thin line (an item with the role goto.sep, drawn by window.luau) follows the
-- last Waiting on you row; it has no row index, so the cursor, jump numbers and clicks skip it. A
-- list with no line gets the role goto.flat, and window.luau keeps the line's height empty under
-- it, so 20 rows show either way and no part of a 21st row peeks in.
local function list_view(state)
	local items = {}
	local keys = {}
	local prefixes = tree_prefixes(state)
	for p, i in state.shown do
		table.insert(items, row_item(state, p, i, prefixes[p]))
		table.insert(keys, tostring(i))
		local next_row = state.shown[p + 1]
		if state.rows[i].group and next_row and not state.rows[next_row].group then
			table.insert(items, { label = { ui.span("\u{00A0}") } })
			table.insert(keys, "sep")
		end
	end
	local list = ui.list(items)
	local kids = list.c or {}
	for k, key in keys do
		kids[k].p = kids[k].p or {}
		kids[k].p.key = key
		if key == "sep" then
			kids[k].p.role = "goto.sep"
		end
	end
	list.p = list.p or {}
	list.p.key = "rows"
	list.p.role = if table.find(keys, "sep") then nil else "goto.flat"
	list.p.selected = LIST_ID .. tostring(state.cursor)
	list.p.empty = { ui.span("Nothing matches the search.", "muted") }
	list.p.max = { lines = 30 }
	return list
end

-- The palette's footer: the search while there is one, then the keys. The empty search span still
-- fills the space, so the keys stay on the right. While the ctrl+; prefix waits, the keys are the
-- actions, each named by what it does now.
local function foot_view(state)
	local left = text_span("goto-where", if state.query ~= "" then state.query .. "\u{258F}" else "")
	local keys
	if state.prefix then
		keys = {
			kbd("a"),
			ui.el("span", { text = if state.all then " agents " else " all " }),
			kbd("i"),
			ui.el("span", { text = if state.idle then " hide idle " else " show idle " }),
			kbd("esc"),
			ui.el("span", { text = " cancel" }),
		}
	else
		keys = {
			kbd("↑"),
			kbd("↓"),
			ui.el("span", { text = " move " }),
			kbd("↵"),
			ui.el("span", { text = " go " }),
			kbd("⌃;"),
			ui.el("span", { text = " actions" }),
		}
	end
	return ui.el("div", { class = "ck-foot" }, {
		left,
		ui.el("span", { class = "grow" }, keys),
	})
end

-- Handles the key after the ctrl+; prefix: a switches agents only and all panes, i shows or hides
-- idle agents in the Waiting on you group. Every key ends the prefix, and any other key does
-- nothing else. A cursor whose row the filter hides starts again where it starts on open, and a
-- cursor on a tab row that now shares its session's number moves to the session row.
local function action_key(state, key)
	state.prefix = false
	if key.ctrl or key.alt or key.meta then
		return
	end
	if key.text == "a" then
		state.all = not state.all
	elseif key.text == "i" then
		state.idle = not state.idle
		tern.kv.set("waiting_idle", state.idle)
	else
		return
	end
	refilter(state)
	if cursor_position(state) == 0 then
		place_cursor(state)
	elseif state.skip[state.cursor] then
		state.cursor = state.rows[state.cursor].session
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
		return {
			main = ui.col({
				ui.el("div", { class = "cmdk tn-cmdk goto-box", key = "box" }, {
					list_view(state),
					foot_view(state),
				}),
			}),
		}
	end,

	-- The key after ctrl+; is used up by the prefix.
	key = function(state, key, cx)
		if state.prefix then
			action_key(state, key)
			return true
		end
		return picker_key(state, key, cx)
	end,

	-- A click on a row goes there.
	event = function(state, ev, cx)
		if (ev.ev == "select" or ev.ev == "activate") and type(ev.item) == "string" then
			local i = tonumber(string.sub(ev.item, #LIST_ID + 1))
			if i and state.rows[i] then
				go(state, i, cx)
			end
		end
	end,
})
