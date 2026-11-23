-- Captures Tern's agent list without consulting Go to.

-- Saves the current list in the isolated instance's plugin data.
tern.command({
	id = "capture",
	title = "Capture Tern agent status",
	run = function(cx)
		tern.kv.set("agents", cx.agents:list())
	end,
})
