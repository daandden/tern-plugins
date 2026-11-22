/// <reference types="bun" />
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { seedOmp } from "./seed-omp";

const dir = resolve(process.argv[2] ?? (() => { throw new Error("Usage: bun image-mode-provider.ts RUN_DIR [--mounted]"); })());
const mounted = process.argv[3] === "--mounted";
// Only a user text part that is exactly this prompt gets a tool call. Title requests, background-job notices, and other follow-ups get text, so one prompt makes one call.
const SMOKE_PROMPT = "Call generate_image";
mkdirSync(`${dir}/data/agent`, { recursive: true });
mkdirSync(`${dir}/data/home`, { recursive: true });
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	async fetch(request) {
		if (request.method !== "POST" || new URL(request.url).pathname !== "/v1/chat/completions") {
			return new Response("Not found", { status: 404 });
		}
		const body = (await request.json()) as Record<string, any>;
		appendFileSync(`${dir}/requests.jsonl`, `${JSON.stringify({ at: Date.now(), body })}\n`);
		const chunk = (delta: Record<string, unknown>, finishReason: string | null = null) =>
			`data: ${JSON.stringify({ id: "image-mode-smoke", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;
		const reply = (stream: string) =>
			new Response(`${stream}data: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
		const last = body.messages?.at(-1);
		const parts: string[] = typeof last?.content === "string"
			? [last.content]
			: (last?.content ?? []).map((part: { text?: string }) => part.text ?? "");
		if (last?.role !== "user" || !parts.some(text => text.trim() === SMOKE_PROMPT)) {
			return reply(chunk({ role: "assistant", content: "generate_image returned the shown result." }) + chunk({}, "stop"));
		}
		const args = readFileSync(`${dir}/tool-args.json`, "utf8").trim();
		const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
		const call = mounted
			? { name: "bash", arguments: JSON.stringify({ command: `generate_image --json ${quote(args)}` }) }
			: { name: "generate_image", arguments: args };
		return reply(chunk({
			role: "assistant",
			tool_calls: [{ index: 0, id: `call_${Date.now()}`, type: "function", function: call }],
		}) + chunk({}, "tool_calls"));
	},
});
const models = [{ id: "main", name: "main", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096 }];
await Bun.write(
	`${dir}/provider.ts`,
	`export default function(pi) { pi.registerProvider("image-smoke", { baseUrl: "http://127.0.0.1:${server.port}/v1", apiKey: "local-only", api: "openai-completions", models: ${JSON.stringify(models)} }); }\n`,
);
const config = `tools:\n  commands: ${mounted}\nadvisor:\n  enabled: false\nmarketplace:\n  autoUpdate: off\ncompaction:\n  enabled: false\nretry:\n  enabled: false\n  modelFallback: false\nmodelRoles:\n  default: image-smoke/main\n  smol: image-smoke/main\n  tiny: image-smoke/main\n  slow: image-smoke/main\n  plan: image-smoke/main\n`;
await Bun.write(`${dir}/smoke-config.yml`, config);
await seedOmp(dir, config);
console.log(`ready: http://127.0.0.1:${server.port}`);
