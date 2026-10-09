-- Link clicks to local HTML files open the rendered page in a browser pane split right of the
-- clicked pane, not the file's source in an editor block. Other file:// links open the file in
-- Tern's editor, the way a clicked path does.

local function is_html(path)
	local lower = string.lower(path)
	return string.match(lower, "%.html?$") ~= nil
end

local function percent_decode(text)
	return (string.gsub(text, "%%(%x%x)", function(hex)
		return string.char(tonumber(hex, 16))
	end))
end

local function percent_encode_path(path)
	return (string.gsub(path, "[^%w%-%._~/]", function(char)
		return string.format("%%%02X", string.byte(char))
	end))
end

-- A file:// URL of this machine as its decoded path and its URL with the host dropped (query and
-- fragment kept, so `#section` still scrolls the page); nil for other URLs and other hosts.
local function local_file_url(url)
	local host, rest = string.match(url, "^[Ff][Ii][Ll][Ee]://([^/]*)(/.*)$")
	if rest == nil or (host ~= "" and string.lower(host) ~= "localhost") then
		return nil
	end
	local encoded_path = string.match(rest, "^[^?#]*")
	return percent_decode(encoded_path), "file://" .. rest
end

-- Tern's browser op only opens a picture in picture, so the page is docked into a split right of
-- the pane the link was in once it opens.
local function open_page(cx, owner, url)
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

tern.route.link(function(link, cx)
	local path, url = local_file_url(link.url)
	if path == nil then
		return nil
	end
	-- A browser on this machine cannot read a remote host's file, so that one opens in the editor.
	if is_html(path) and cx.hosts:current().kind == "local" then
		open_page(cx, link.pane, url)
		return { handled = true }
	end
	return { path = path }
end)

-- A clicked path (not a file:// URL) to an HTML file reaches the file open, not the link route.
tern.route.open(function(req, cx)
	if req.origin ~= "link" or not is_html(req.path) or not is_local_host(cx, req.host) then
		return nil
	end
	local owner = cx.session:focused()
	if owner == nil then
		return nil
	end
	open_page(cx, owner, "file://" .. percent_encode_path(req.path))
	return { handled = true }
end)
