import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

if (!process.argv[2]) throw new Error("Usage: bun goto-held-provider.ts RUN");
const run = resolve(process.argv[2]);
const encoder = new TextEncoder();
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	idleTimeout: 0,
	async fetch(request) {
		if (request.method !== "POST" || new URL(request.url).pathname !== "/v1/chat/completions") {
			return new Response("Not found", { status: 404 });
		}
		const body = await request.json() as {
			model: string;
			messages: { role: string; content: string | { type: string; text?: string }[] }[];
		};
		if (body.model !== "main" && body.model !== "side") return new Response("Unknown model", { status: 400 });
		const last = body.messages.at(-1);
		const holdPrompt = "Hold the main turn";
		const held = body.model === "main" && last?.role === "user" && (
			Array.isArray(last.content)
				? last.content.some(part => part.type === "text" && part.text === holdPrompt)
				: last.content === holdPrompt
		);
		appendFileSync(`${run}/held-requests.jsonl`, `${JSON.stringify({ held, ...body })}\n`);
		const id = crypto.randomUUID();
		const frame = (delta: Record<string, unknown>, finishReason: string | null = null) =>
			`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;
		const headers = { "content-type": "text/event-stream" };
		if (held) {
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(encoder.encode(frame({ role: "assistant", content: "Main turn held open." })));
				},
			});
			return new Response(stream, { headers });
		}
		const content = body.model === "side" ? "Local Side answer during a held turn." : "Main ready.";
		return new Response(frame({ role: "assistant", content }) + frame({}, "stop") + "data: [DONE]\n\n", { headers });
	},
});
const models = ["main", "side"].map(id => ({
	id, name: id, reasoning: false, input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096,
}));
await Bun.write(`${run}/held-provider.ts`, `export default function(pi) {
	pi.registerProvider("goto-held", { baseUrl: "http://127.0.0.1:${server.port}/v1", apiKey: "local-only", api: "openai-completions", models: ${JSON.stringify(models)} });
}`);
console.log(`ready: http://127.0.0.1:${server.port}`);
