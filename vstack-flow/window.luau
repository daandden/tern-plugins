-- A Cmd-click on a local Flow link opens the page in Tern beside the opener pane, or navigates
-- the tab's existing page for that Flow. Cmd+⌥-click and other links are left to Tern.

local CAPABILITY = string.rep("%x", 64)

-- The part of a Flow link that names its Flow: the URL up to and including the capability
-- segment's slash, `http://127.0.0.1:<port>/f/<project>/<flow>/<capability>/`. Nil for any other URL,
-- such as one with user information, a query or more path after the capability.
local function flow_key(url)
	local key, host, rest =
		string.match(url, "^(http://([^/?#:@]+):?%d*/f/[^/?#]+/[^/?#]+/" .. CAPABILITY .. "/)(.*)$")
	if key == nil or (rest ~= "" and string.sub(rest, 1, 1) ~= "#") then
		return nil
	end
	host = string.lower(host)
	if host ~= "127.0.0.1" and host ~= "localhost" then
		return nil
	end
	return key
end

-- The tiled pane that a page opens beside: the pane itself, or for a floating pane the tiled pane
-- under it, because a page cannot dock beside a float.
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

-- The browser pane in `tab` that shows a page of the Flow named by `key`, or nil.
local function open_page(cx, tab, key)
	for _, pane in cx.session:panes() do
		if pane.kind == "browser" and pane.tab == tab and pane.url and flow_key(pane.url) == key then
			return pane.pane
		end
	end
	return nil
end

-- Shows a toast for a browser error when the callback context is available.
local function report(failure, result, err, later)
	local why = err or (result and result.error and result.error.message)
	if why and later then
		later:toast("error", failure, tostring(why))
	end
end

-- Claims a Cmd-click on a Flow link: the tab's open page of that Flow goes to the clicked
-- question, else a new page opens beside the opener pane. Cmd+⌥-click goes to Tern's own handling.
tern.route.link(function(link, cx)
	if link.mods.alt then
		return nil
	end
	local key = flow_key(link.url)
	if key == nil then
		return nil
	end
	local owner = tiled_pane(cx, link.pane)
	local page = open_page(cx, cx.session:tab_of(owner), key)
	if page then
		cx.browser:call({ op = "goto", block = page, url = link.url }):next(function(result, err, later)
			report("Could not show the question", result, err, later)
		end)
		cx.layout:focus(page)
	else
		cx.browser:call({ op = "open", owner = owner, url = link.url, how = "beside" }):next(function(result, err, later)
			report("Could not open the Flow page", result, err, later)
			-- The open leaves the page under automation; release hands it back as an ordinary page.
			local block = result and result.ok and result.ok.block
			if block and later then
				later.browser:call({ op = "release", block = block })
			end
		end)
	end
	return { handled = true }
end)
