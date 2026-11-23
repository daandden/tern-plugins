import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

export const keenableTools = [
	{
		name: "search_web_pages",
		description: "Fixture: Search for source pages.",
		inputSchema: {
			type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false,
		},
	},
	{
		name: "fetch_page_content",
		description: "Fixture: Read a source page.",
		inputSchema: {
			type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false,
		},
	},
];

if (import.meta.main) {
	const [log, catalog] = process.argv.slice(2);
	if (!log) throw new Error("Usage: bun keenable-mcp.ts LOG [TOOL_NAME|announce-on-call]");
	const announce = catalog === "announce-on-call";
	const otherTool = { ...keenableTools[0], name: "other_tool" };
	const tools = announce ? [...keenableTools]
		: catalog ? keenableTools.filter(tool => tool.name === catalog) : [...keenableTools, otherTool];
	let pendingCall: { id: number; result: unknown } | undefined;
	const record = (entry: object) => appendFileSync(log, `${JSON.stringify(entry)}\n`);
	const send = (frame: object) => console.log(JSON.stringify({ jsonrpc: "2.0", ...frame }));
	const replies: Record<string, string> = {
		search_web_pages: "Keenable fixture search result",
		fetch_page_content: "Keenable fixture page content",
	};
	for await (const line of createInterface({ input: process.stdin })) {
		const { id, method, params } = JSON.parse(line);
		if (id === undefined) continue;
		let result: unknown;
		switch (method) {
			case "initialize":
				record({ method });
				result = {
					protocolVersion: params.protocolVersion,
					capabilities: { tools: announce ? { listChanged: true } : {} },
					serverInfo: { name: "keenable-fixture", version: "1" },
				};
				break;
			case "tools/list":
				if (pendingCall) {
					record({ method, tools: tools.map(tool => tool.name) });
					send({ id, result: { tools } });
					send(pendingCall);
					pendingCall = undefined;
					continue;
				}
				result = { tools };
				break;
			case "tools/call":
				record({ method, params: { name: params.name, arguments: params.arguments } });
				result = { content: [{ type: "text", text: replies[params.name] ?? "Unexpected tool" }] };
				if (announce && !tools.includes(otherTool)) {
					tools.push(otherTool);
					pendingCall = { id, result };
					const notification = { method: "notifications/tools/list_changed" };
					record(notification);
					send(notification);
					continue;
				}
				break;
			case "ping":
				result = {};
				break;
			default:
				send({ id, error: { code: -32601, message: `Unexpected method: ${method}` } });
				continue;
		}
		send({ id, result });
	}
}
