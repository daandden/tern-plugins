-- Text and code files on this machine open in Neovim in a terminal pane, not in Tern's code view.
-- Tern 0.9.7's code view still ignores adjust_cell_height; terminal panes follow it.
-- Tern still opens Markdown (rendered), notebooks, images, PDFs, databases, binary files, files
-- over 4 MiB and files on remote hosts. Tern resolves a symlink before it asks a route, so a symlink
-- to a text file opens its target here. HTML files stay with html-links, or with Tern for a clicked
-- file:// link, which Tern renders itself. Other clicked file:// links come here: html-links returns
-- nil for every file:// link, and the files that do not go to Neovim open in Tern's file block.
--
-- A file that the `open` command of this repo's bin/ opens goes beside the pane that ran it, other
-- files beside the focused pane. A float (Yazi runs as one) has no side in the split, so the new
-- pane goes beside the tiled pane under it. A second file opens in the Neovim pane that this plugin
-- started in the same tab, so a click per file in the Files pane does not add a pane per file.

local NVIM = "/opt/homebrew/bin/nvim"
local MAX_BYTES = 4 * 1024 * 1024

-- Extensions of the files that Tern shows in a view of its own, not the code view.
local TERN_VIEWS = {
	md = true, markdown = true, mdx = true, ipynb = true,
	png = true, jpg = true, jpeg = true, gif = true, webp = true, svg = true, bmp = true, ico = true,
	tif = true, tiff = true, heic = true, avif = true, pdf = true,
	db = true, sqlite = true, sqlite3 = true, sqlitedb = true,
}

-- The file's extension in lower case, or nil.
local function extension(path)
	local ext = string.match(path, "%.([^./]+)$")
	return if ext then string.lower(ext) else nil
end

-- An open request names its host by machine name ("vanguyenmac"), not "local".
local function is_local_host(cx, name)
	local wanted = string.lower(name)
	for _, host in cx.hosts:list() do
		if host.kind == "local" and string.lower(host.name) == wanted then
			return true
		end
	end
	return wanted == "local"
end

-- Whether the path is a regular file of at most MAX_BYTES with no NUL byte. tern.fs.read raises
-- for a directory, a symlink, a larger file and a file that it cannot read.
local function is_text_file(path)
	local ok, bytes = pcall(tern.fs.read, path, MAX_BYTES)
	return ok and string.find(bytes, "\0", 1, true) == nil
end

-- The text as one word for the login shell, bash or fish: every ASCII character other than a
-- letter, a digit or one of / . _ + , : @ - gets a backslash, which both shells read the same way.
local function shell_word(text)
	return (string.gsub(text, "[^%w/%._+,:@%-\128-\255]", "\\%0"))
end

-- The path as one Vim file name argument, as fnameescape() writes it.
local function vim_escape(path)
	return (string.gsub(path, "[ \t%%#|\"'*?%[{`$\\!<]", "\\%0"))
end

-- The directory that holds the path; Neovim starts there.
local function dirname(path)
	return string.match(path, "^(.*)/[^/]*$") or "/"
end

-- The Ex command that moves the caret to the requested line and column, or nil.
local function cursor_call(req)
	if req.line == nil then
		return nil
	end
	return string.format("call cursor(%d, %d)", req.line, req.col or 1)
end

-- The command line of a new pane. Tern runs it through the login shell, and the PATH of a login
-- shell can lack /opt/homebrew/bin, so the PATH that Neovim and its plugins see gets it in front.
-- Bash and fish both take the PATH= prefix, and both join a quoted "$PATH" with colons.
local function launch_command(req)
	local parts = { 'PATH=/opt/homebrew/bin:"$PATH" exec', NVIM }
	local cursor = cursor_call(req)
	if cursor then
		table.insert(parts, shell_word("+" .. cursor))
	end
	table.insert(parts, "--")
	table.insert(parts, shell_word(req.path))
	return table.concat(parts, " ")
end

-- The ids of the Neovim panes that this plugin started, kept in tern.kv so that a plugin reload
-- (another plugin's reload reloads this one too) does not forget them.
local PANES_KEY = "panes"

-- A pane that this plugin started in the tab and that is still open, or nil. Neovim replaced the
-- shell there (exec), so the pane closes when Neovim quits. Closed panes leave the list.
local function our_pane_in_tab(cx, tab)
	local found = nil
	local open = {}
	for _, pane in tern.kv.get(PANES_KEY) or {} do
		local info = cx.session:pane(pane)
		if info and info.exited == nil then
			table.insert(open, pane)
			if found == nil and info.tab == tab and not info.parked then
				found = pane
			end
		end
	end
	tern.kv.set(PANES_KEY, open)
	return found
end

-- Adds a pane that this plugin started to the list in tern.kv.
local function remember_pane(pane)
	local panes = tern.kv.get(PANES_KEY) or {}
	table.insert(panes, pane)
	tern.kv.set(PANES_KEY, panes)
end

-- Opens the file in a running Neovim pane. Ctrl-\ Ctrl-N leaves any mode for Normal mode, and
-- :drop edits the file in the current window, or in a new split when that buffer has changes.
local function open_in_pane(cx, pane, req)
	local command = "drop " .. vim_escape(req.path)
	local cursor = cursor_call(req)
	if cursor then
		command ..= " | " .. cursor
	end
	cx:run(pane, "\28\14:" .. command .. "\r")
	cx.layout:focus(pane)
end

-- The tiled pane that a new pane splits: the pane itself, or for a float the tiled pane under it.
local function tiled_pane(cx, pane)
	local tab = cx.session:tab_of(pane)
	local layout = if tab then cx.session:layout(tab) else nil
	for _, float in (if layout then layout.floats else {}) do
		if float.pane == pane then
			return float.over
		end
	end
	return pane
end

-- Starts Neovim on the file: in a new tab when the open asks for one, else in a split beside the
-- owner pane (below it for "below").
local function open_new_pane(cx, req, owner)
	local launch = { cwd = dirname(req.path), command = launch_command(req) }
	local pane
	if req.how == "tab" or owner == nil then
		pane = cx.layout:new_tab(launch)
	else
		local dir = if req.how == "below" then "down" else "right"
		pane = cx.layout:split(tiled_pane(cx, owner), dir, launch, { focus = true })
	end
	if pane == nil then
		cx:toast("error", "Could not open Neovim", req.path)
		return
	end
	remember_pane(pane)
end

-- Whether a local file goes to Neovim: a text file with no extension that Tern shows in a view of
-- its own. A control character (a newline, say) cannot pass through the shell command line or
-- Vim's command line, so Tern opens that path.
local function goes_to_nvim(path)
	local ext = extension(path)
	if ext and TERN_VIEWS[ext] then
		return false
	end
	if string.find(path, "%c") then
		return false
	end
	return is_text_file(path)
end

-- Opens req.path in Neovim: in this plugin's Neovim pane in the owner's tab, else in a new pane.
local function open_in_nvim(cx, req, owner)
	local tab = if owner then cx.session:tab_of(owner) else nil
	local pane = if req.how ~= "tab" and tab then our_pane_in_tab(cx, tab) else nil
	if pane then
		open_in_pane(cx, pane, req)
	else
		open_new_pane(cx, req, owner)
	end
end

-- Whether the path names an HTML file, which html-links opens as a page.
local function is_html(path)
	local ext = extension(path)
	return ext == "html" or ext == "htm"
end

-- The handoff files of bin/open, named `<pane>.<pid>`, each with the real path of one file.
local HANDOFFS = (tern.getenv("HOME") or "") .. "/.cache/tern/open-owners"

-- The open pane whose bin/open call asks to open the path, or nil. This removes the handoff file,
-- which tells bin/open that the file opened. `tern open` focuses the pane that runs it before the
-- route runs, so when two panes ask for the same path at once, the focused pane's file wins.
local function take_opener(cx, path)
	local ok, names = pcall(tern.fs.list, HANDOFFS)
	if not ok then
		return nil
	end
	local focused = cx.session:focused()
	local pane, file = nil, nil
	for _, name in names do
		local candidate = tonumber(string.match(name, "^(%d+)%.%d+$"))
		local candidate_file = HANDOFFS .. "/" .. name
		local read_ok, text = pcall(tern.fs.read, candidate_file, 64 * 1024)
		if candidate and read_ok and text == path .. "\n" and cx.session:pane(candidate) then
			if pane == nil or candidate == focused then
				pane, file = candidate, candidate_file
			end
		end
	end
	if file then
		pcall(tern.fs.remove, file)
	end
	return pane
end

-- The text with each %XX escape of a URL turned back into its byte.
local function percent_decode(text)
	return (string.gsub(text, "%%(%x%x)", function(hex)
		return string.char(tonumber(hex, 16))
	end))
end

-- The decoded path of a file:// URL of this machine (query and fragment dropped), or nil for other
-- URLs and other hosts.
local function local_file_path(url)
	local host, rest = string.match(url, "^[Ff][Ii][Ll][Ee]://([^/]*)(/.*)$")
	if rest == nil or (host ~= "" and string.lower(host) ~= "localhost") then
		return nil
	end
	return percent_decode(string.match(rest, "^[^?#]*"))
end

-- File opens from the Files pane, the palette, `tern open`, bin/open, a clicked plain path and
-- Carly. Every HTML file stays with html-links.
tern.route.open(function(req, cx)
	if is_html(req.path) then
		return nil
	end
	if not is_local_host(cx, req.host) or not goes_to_nvim(req.path) then
		return nil
	end
	open_in_nvim(cx, req, take_opener(cx, req.path) or cx.session:focused())
	return { handled = true }
end)

-- Clicked file:// links. A link route that answers with a path makes Tern open the path in its own
-- file block without calling route.open, so text files need this route too. Links to HTML files
-- stay with Tern, which renders them. A file:// link that does not go to Neovim opens in Tern's file
-- block.
tern.route.link(function(link, cx)
	local path = local_file_path(link.url)
	if path == nil or is_html(path) then
		return nil
	end
	if cx.hosts:current().kind ~= "local" or not goes_to_nvim(path) then
		return { path = path }
	end
	open_in_nvim(cx, { path = path, how = "default" }, link.pane)
	return { handled = true }
end)
