import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

if (!process.argv[2]) throw new Error("Usage: bun picker-provider.ts RUN");
const run = resolve(process.argv[2]);
const html = `<form><fieldset><legend>Pick a color</legend><label><input type="radio" name="color" value="red">Red</label><label><input type="radio" name="color" value="blue">Blue</label></fieldset></form>`;

const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	async fetch(request) {
		if (request.method !== "POST" || new URL(request.url).pathname !== "/v1/chat/completions") {
			return new Response("Not found", { status: 404 });
		}
		const body = await request.json() as { model: string; messages: { role: string; content: unknown }[] };
		if (body.model !== "main" && body.model !== "side") return new Response("Unknown model", { status: 400 });
		appendFileSync(`${run}/requests.jsonl`, `${JSON.stringify(body)}\n`);
		const id = crypto.randomUUID();
		const frame = (delta: Record<string, unknown>, finishReason: string | null = null) =>
			`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;
		const headers = { "content-type": "text/event-stream" };
		if (body.model === "side") {
			return new Response((async function* () {
				yield frame({ role: "assistant", content: "Local Side answer. " });
				for (let i = 1; i <= 25; i++) {
					await Bun.sleep(800);
					yield frame({ content: `Part ${i}. ` });
				}
				yield frame({}, "stop") + "data: [DONE]\n\n";
			})(), { headers });
		}
		const latest = body.messages.at(-1);
		const text = Array.isArray(latest?.content)
			? latest.content.filter(part => part.type === "text").map(part => part.text).join("\n")
			: typeof latest?.content === "string" ? latest.content : "";
		const ask = latest?.role === "user" && text.split("\n").some(line => line.startsWith("Call the ask tool"));
		const result = latest?.role === "user" && text === "Attached image(s) from tool result:"
			? body.messages.at(-2) : latest;
		const content = result?.role === "tool" && typeof result.content === "string"
			? /^\s*"color":\s*"(red|blue)"/m.exec(result.content)?.[1] ?? "ok" : "ok";
		const delta = ask ? { tool_calls: [{ index: 0, id: `call_${id}`, type: "function", function: { name: "ask", arguments: JSON.stringify({ html }) } }] } : { content };
		return new Response(frame({ role: "assistant", ...delta }) + frame({}, ask ? "tool_calls" : "stop") + "data: [DONE]\n\n", { headers });
	},
});
const models = ["main", "side"].map(id => ({
	id, name: id, reasoning: false, input: ["text", "image"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096,
}));
await Bun.write(`${run}/provider.ts`, `export default function(pi) {
	pi.registerProvider("vfix", { baseUrl: "http://127.0.0.1:${server.port}/v1", apiKey: "fixture-key", api: "openai-completions", models: ${JSON.stringify(models)} });
}`);
console.log(`ready: http://127.0.0.1:${server.port}`);
