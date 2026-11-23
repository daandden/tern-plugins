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
	if (!log) throw new Error("Usage: bun keenable-mcp.ts LOG [TOOL_NAME]");
	const tools = catalog ? keenableTools.filter(tool => tool.name === catalog) : [...keenableTools, {
		...keenableTools[0], name: "other_tool",
	}];
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
				appendFileSync(log, `${JSON.stringify({ method })}\n`);
				result = { protocolVersion: params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "keenable-fixture", version: "1" } };
				break;
			case "tools/list":
				result = { tools };
				break;
			case "tools/call":
				appendFileSync(log, `${JSON.stringify({ method, params: { name: params.name, arguments: params.arguments } })}\n`);
				result = { content: [{ type: "text", text: replies[params.name] ?? "Unexpected tool" }] };
				break;
			case "ping":
				result = {};
				break;
			default:
				console.log(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unexpected method: ${method}` } }));
				continue;
		}
		console.log(JSON.stringify({ jsonrpc: "2.0", id, result }));
	}
}
