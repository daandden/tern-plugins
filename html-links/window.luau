-- Every local HTML file that Tern would open as source opens as the rendered page in a browser pane
-- split right of its opener pane: the Files pane, the palette, `tern open`, the `open` command of
-- this repo's bin/ (which calls `tern open`) and macOS open that names Tern (`open -a Tern`). A file
-- that the `open` command opens goes beside the pane that ran it, others beside the focused pane.
-- A clicked file:// link to an HTML file is Tern's own: Tern renders it since 0.7.3, so the link
-- route leaves every file:// URL alone. Cmd+R reloads the page, so an edit to the file shows. A web
-- link that Tern opens stays in Tern only when it goes to this machine (localhost, a loopback
-- address or the machine's name). Other web links open in Microsoft Edge, the default browser.

local function is_html(path)
	local lower = string.lower(path)
	return string.match(lower, "%.html?$") ~= nil
end

local function percent_encode_path(path)
	return (string.gsub(path, "[^%w%-%._~/]", function(char)
		return string.format("%%%02X", string.byte(char))
	end))
end

-- Whether a URL is a file:// URL of this machine.
local function is_local_file_url(url)
	local host, rest = string.match(url, "^[Ff][Ii][Ll][Ee]://([^/]*)(/.*)$")
	return rest ~= nil and (host == "" or string.lower(host) == "localhost")
end

-- The lowercase host of an http or https URL, without brackets for IPv6; nil for other URLs.
local function web_host(url)
	local scheme, rest = string.match(url, "^(%a[%w+.-]*)://(.*)$")
	if scheme == nil then
		return nil
	end
	scheme = string.lower(scheme)
	if scheme ~= "http" and scheme ~= "https" then
		return nil
	end
	local authority = string.gsub(string.match(rest, "^[^/?#]*"), "^.*@", "")
	local host = string.match(authority, "^%[([^%]]*)%]") or string.match(authority, "^[^:]*")
	return string.lower(host)
end

-- Whether a web host is this machine: localhost and its subdomains, a loopback address, 0.0.0.0,
-- or the name of this machine (with or without `.local`).
local function is_local_web_host(cx, host)
	if host == "localhost" or string.match(host, "%.localhost$") or host == "::1" or host == "0.0.0.0" then
		return true
	end
	if string.match(host, "^127%.%d+%.%d+%.%d+$") then
		return true
	end
	for _, machine in cx.hosts:list() do
		local name = string.lower(machine.name)
		if machine.kind == "local" and (host == name or host == name .. ".local") then
			return true
		end
	end
	return false
end

-- Opens a URL in Microsoft Edge, and shows a toast when Edge does not open it.
local function open_in_edge(url)
	tern.process.run({ "/usr/bin/open", "-a", "Microsoft Edge", url }, function(result, later)
		if result.status ~= 0 and later then
			later:toast("error", "Could not open the link in Edge", result.stderr)
		end
	end)
end

-- The tiled pane that a page docks beside: the pane itself, or for a float (Yazi runs as one) the
-- tiled pane under the float, because a page cannot dock beside a float.
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

-- Tern's browser op only opens a picture in picture, so the page is docked into a split right of
-- the opener pane once it opens.
local function open_page(cx, opener, url)
	local owner = tiled_pane(cx, opener)
	cx.browser:call({ op = "open", owner = owner, url = url }):next(function(result, err, later)
		if later == nil then
			return
		end
		local why = err or (result and result.error and result.error.message)
		if why then
			later:toast("error", "Could not open the page", tostring(why))
			return
		end
		local block = result and result.ok and result.ok.block
		if block == nil then
			return
		end
		local ok, dock_why = later.layout:dock(block, owner, "right")
		if not ok then
			later:toast("error", "Could not put the page in a pane", dock_why)
		end
	end)
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

-- A web link to another machine opens in Edge, and one to this machine opens in Tern (nil runs
-- Tern's built-in handling, as for every other URL).
tern.route.link(function(link, cx)
	local host = web_host(link.url)
	if host == nil or is_local_web_host(cx, host) then
		return nil
	end
	open_in_edge(link.url)
	return { handled = true }
end)

-- Every file open of a local HTML file: a clicked plain path, the Files pane, the palette, `tern
-- open`, bin/open and `open -a Tern`.
tern.route.open(function(req, cx)
	if not is_html(req.path) or not is_local_host(cx, req.host) then
		return nil
	end
	local owner = take_opener(cx, req.path) or cx.session:focused()
	if owner == nil then
		return nil
	end
	open_page(cx, owner, "file://" .. percent_encode_path(req.path))
	return { handled = true }
end)

-- The browser panes that Cmd+R reloads: the focused one, or from another pane the pages of local
-- files in its tab, so that a page beside the editor or the shell that changed the file reloads.
local function pages_to_reload(cx)
	local focused = cx.session:focused()
	if focused == nil then
		return {}
	end
	local info = cx.session:pane(focused)
	if info and info.kind == "browser" then
		return { focused }
	end
	local tab = cx.session:tab_of(focused)
	local pages = {}
	for _, pane in cx.session:panes() do
		if pane.kind == "browser" and pane.tab == tab and pane.url and is_local_file_url(pane.url) then
			table.insert(pages, pane.pane)
		end
	end
	return pages
end

-- Reloads the focused page, or the local pages in the focused pane's tab. settings.json binds Cmd+R
-- to it after the SQLite refresh actions, because Tern drops a plugin default key that a preset binds.
tern.command({
	id = "reload_page",
	title = "Reload page",
	available = function(cx)
		return #pages_to_reload(cx) > 0
	end,
	run = function(cx)
		for _, pane in pages_to_reload(cx) do
			cx.browser:call({ op = "nav", block = pane, go = "reload" }):next(function(result, err, later)
				local why = err or (result and result.error and result.error.message)
				if why and later then
					later:toast("error", "Could not reload the page", tostring(why))
				end
			end)
		end
	end,
})
