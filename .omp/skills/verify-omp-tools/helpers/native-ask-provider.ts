import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

if (!process.argv[2]) throw new Error("Usage: bun native-ask-provider.ts RUN");
const run = resolve(process.argv[2]);
const html = `<form><fieldset><legend>Pick a color</legend><label><input type="radio" name="color" value="red">Red</label><label><input type="radio" name="color" value="blue">Blue</label></fieldset></form>`;
const sideQuestionForm = `<form>
	<fieldset><legend>Pick a color</legend><label><input type="radio" name="color" value="red">Red</label><label><input type="radio" name="color" value="blue">Blue</label></fieldset>
	<fieldset><legend>Pick a shape</legend><label><input type="radio" name="shape" value="square">Square</label><label><input type="radio" name="shape" value="circle">Circle</label></fieldset>
	<label>Label <input type="text" name="label"></label>
</form>`;

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
		const latest = body.messages.at(-1);
		const text = Array.isArray(latest?.content)
			? latest.content.filter(part => part.type === "text").map(part => part.text).join("\n")
			: typeof latest?.content === "string" ? latest.content : "";
		const answer = (content: string) =>
			new Response(frame({ role: "assistant", content }) + frame({}, "stop") + "data: [DONE]\n\n", { headers });
		const call = (name: string, args: Record<string, unknown>) => new Response(frame({
			role: "assistant",
			tool_calls: [{ index: 0, id: `call_${id}`, type: "function", function: { name, arguments: JSON.stringify(args) } }],
		}) + frame({}, "tool_calls") + "data: [DONE]\n\n", { headers });
		if (body.model === "side") {
			if (latest?.role === "user" && text.includes("Read the local fixture")) {
				return call("read", { path: "side-fixture.txt" });
			}
			if (latest?.role === "tool" && text.includes("Local fixture contents.")) return answer("Local Side read answer.");
			if (latest?.role === "user" && text.includes("Check the follow-up")) return answer("Local Side follow-up answer.");
			return new Response((async function* () {
				yield frame({ role: "assistant", content: "Local Side answer. " });
				for (let i = 1; i <= 25; i++) {
					await Bun.sleep(800);
					yield frame({ content: `Part ${i}. ` });
				}
				yield frame({}, "stop") + "data: [DONE]\n\n";
			})(), { headers });
		}
		if (latest?.role === "user") {
			if (text.includes("Call the ask tool for Side questions")) return call("ask", { html: sideQuestionForm });
			if (text.split("\n").some(line => line.startsWith("Call the ask tool"))) return call("ask", { html });
			if (text.includes("Continue with the ordinary message")) return answer("Local main received the ordinary message.");
		}
		const result = latest?.role === "user" && text === "Attached image(s) from tool result:"
			? body.messages.at(-2) : latest;
		const content = result?.role === "tool" && typeof result.content === "string"
			? /^\s*"color":\s*"(red|blue)"/m.exec(result.content)?.[1] ?? "ok" : "ok";
		return answer(content);
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
