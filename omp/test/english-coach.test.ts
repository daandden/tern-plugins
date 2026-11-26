import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { initTheme, Settings } from "@oh-my-pi/pi-coding-agent";
import * as host from "@oh-my-pi/pi-coding-agent";
import type { UiNode } from "@oh-my-pi/pi-tui";
import { openCoachMemory } from "../extensions/coach-memory";
import { englishCoachFixture, panelTree, until } from "./helpers/english-coach-session";
import { allNodes, writePluginSettings } from "./support";

const FIX = "Better: This works.\nthis work → This works (Agreement)";
const cleanups: (() => Promise<void>)[] = [];
beforeAll(async () => {
	await Settings.init({ inMemory: true });
	initTheme();
});
afterEach(async () => {
	await Promise.all(cleanups.splice(0).map(cleanup => cleanup()));
});
async function fixture(options: Parameters<typeof englishCoachFixture>[0] = {}) {
	const value = await englishCoachFixture(options);
	cleanups.push(value.dispose);
	return value;
}

test("a plain prompt reaches the main agent immediately and its private correction draws in both backends", async () => {
	const answer = Promise.withResolvers<string>();
	const coach = await fixture({ reply: () => answer.promise });
	const original = "it not work";
	const image = { type: "image" as const, mimeType: "image/png", data: "image-not-for-the-coach" };
	const messages = [...coach.main.messages];
	const result = await coach.input(original, { images: [image] });
	expect(result).toEqual([undefined]);
	expect(coach.lines()).toEqual([]);
	await until(() => coach.requests.length === 1);
	expect(coach.requests[0]!.model).toBe("small");
	expect(coach.requests[0]!.messages.filter((message: any) => message.role === "user")).toEqual([
		{ role: "user", content: original },
	]);
	expect(JSON.stringify(coach.requests)).not.toContain(image.data);
	expect(coach.requests[0]!.max_completion_tokens ?? coach.requests[0]!.max_tokens).toBe(800);
	expect(coach.requests[0]!.reasoning_effort).toBe("low");
	answer.resolve("Better: It doesn't work.\nit not work → It doesn't work (Missing auxiliary verb)");
	await until(() => coach.lines().length > 0);
	expect(coach.lines()).toEqual(["it not doesn't work.", "it not work → It doesn't work (Missing auxiliary verb)"]);
	expect(coach.nativeText()).toEqual(["it not doesn't work."]);
	expect(coach.nativeHovers()).toEqual([
		{ text: "not doesn't", title: "not → doesn't: Missing auxiliary verb" },
	]);
	expect(coach.nativeSpans()[0]).toEqual([
		{ t: "it " }, { t: "not", s: "del" }, { t: " " }, { t: "doesn't", s: "ins" }, { t: " work" }, { t: ".", s: "ins" },
	]);
	expect([...coach.placements.entries()]).toEqual([["omp-tools.english-coach", { placement: "aboveEditor" }]]);
	expect(coach.main.messages).toEqual(messages);
	const usage = coach.main.sessionManager.getEntries().filter(entry => entry.type === "model_usage");
	expect(usage).toMatchObject([{ purpose: "english-coach", model: "small", usage: { input: 100, output: 10 } }]);
});

test.each(["No mistakes", "Not English"])("the %s outcome does not open a panel", async reply => {
	const coach = await fixture({ reply: () => reply });
	await coach.input("this work");
	await coach.checked();
	expect(coach.widgets.size).toBe(0);
	expect(coach.notices).toEqual([]);
});

test.each(["Here is some advice.", "Better: This works.", "Better: This works. 😀\nthis work → This works (Agreement)"])(
	"an unreadable reply %j shows a warning outside the panel",
	async reply => {
		const coach = await fixture({ reply: () => reply });
		await coach.input("this work");
		await until(() => coach.notices.length > 0);
		expect(coach.lines()).toEqual([]);
		expect(coach.notices[0]?.message).toContain("unreadable reply");
	},
);

test("each change explains its own mistake: listed in a plain terminal, on hover in Tern", async () => {
	const coach = await fixture({ reply: () => "Better: A user enters the wrong password.\nuser → A user (Missing article)\ninput → enters (Word choice)" });
	await coach.input("user input wrong password");
	await until(() => coach.lines().length > 0);
	expect(coach.lines()).toEqual(["A user input enters the wrong password.",
		"user → A user (Missing article)",
		"input → enters (Word choice)"]);
	expect(coach.nativeText()).toEqual(["A user input enters the wrong password."]);
	expect(coach.nativeHovers()).toEqual([
		{ text: "A", title: "+ A: Missing article" },
		{ text: "input enters the", title: "input → enters the: Word choice" },
	]);
});

test("Tern leaves the explanation list out of the correction note", async () => {
	const coach = await fixture({ reply: () => "Better: It works.\nit work → It works (Agreement)\nfoo → bar (Spelling)" });
	await coach.input("it work");
	await until(() => coach.lines().length > 0);
	expect(coach.nativeText()).toEqual(["it work works."]);
	expect(coach.nativeHovers().map(hover => hover.title)).toEqual(["work → works.: Agreement"]);
});

test("Tern explains a reported punctuation replacement but not an unreported period", async () => {
	const coach = await fixture({ reply: () => "Better: Wait, what now? Check again.\n[punctuation] ; → , (Use a comma)" });
	await coach.input("Wait; what now? Check again");
	await until(() => coach.lines().length > 0);
	expect(coach.nativeText()).toEqual(["Wait, what now? Check again."]);
	expect(coach.nativeHovers()).toEqual([{ text: ",", title: "+ ,: Use a comma" }]);
});

test.each([
	["List errors first, then list error again", "List errors first, then list errors again", "list error", "list errors"],
	["Keep this error on screen, then fix this error today", "Keep this error on screen, then fix these errors today", "this error", "these errors"],
])("Coach memory anchors repeated wording to the actual edit in %j", async (input, rewrite, original, corrected) => {
	const memory = openCoachMemory();
	try {
		const before = memory.snapshot().rules.find(row => row.rule === "noun-number")?.occurrences ?? 0;
		const coach = await fixture({ reply: () => `Better: ${rewrite}\n[noun-number] ${original} → ${corrected} (Plural nouns)` });
		await coach.input(input);
		await until(() => coach.lines().length > 0);
		expect(coach.nativeHovers()).toHaveLength(1);
		expect(coach.nativeHovers()[0]?.title).toContain("Plural nouns");
		expect(memory.snapshot().rules.find(row => row.rule === "noun-number")?.occurrences).toBe(before + 1);
		expect(memory.ruleDetail("noun-number").example?.words).toEqual({ before: original, after: corrected });
	} finally {
		memory.close();
	}
});

test("Coach memory does not guess between two edits matching the same reported mistake", async () => {
	const memory = openCoachMemory();
	try {
		const before = memory.snapshot().rules.find(row => row.rule === "noun-number")?.occurrences ?? 0;
		const coach = await fixture({
			reply: () => "Better: List errors here, then list errors there.\n[noun-number] list error → list errors (Plural nouns)",
		});
		await coach.input("List error here, then list error there.");
		await until(() => coach.lines().length > 0);
		expect(coach.nativeText()).toEqual(["List error errors here, then list error errors there."]);
		expect(coach.nativeHovers()).toEqual([]);
		expect(memory.snapshot().rules.find(row => row.rule === "noun-number")?.occurrences ?? 0).toBe(before);
	} finally {
		memory.close();
	}
});

test("Coach memory counts grounded fixes without storing protected, unmatched or full-prompt examples", async () => {
	const memory = openCoachMemory();
	try {
		const before = memory.snapshot().rules.find(row => row.rule === "articles")?.occurrences ?? 0;
		const coach = await fixture({
			reply: body => {
				const input = body.messages.at(-1).content as string;
				if (input === "add dashboard") {
					return "Better: add a dashboard\n[articles] add dashboard → add a dashboard (Missing article)";
				}
				return `Better: ${input.replace("add dashboard", "add a dashboard")}\n[articles] dashboard → a dashboard (Missing article)\n[articles] phantom → invented (Missing article)`;
			},
		});
		await coach.input("please add dashboard beside `private_key()`");
		await until(() => coach.lines().length > 0);
		expect(memory.snapshot().rules.find(row => row.rule === "articles")?.occurrences).toBe(before + 1);
		expect(memory.ruleDetail("articles").example?.words).toEqual({ before: "dashboard", after: "a dashboard" });
		await coach.input("add dashboard");
		await until(() => coach.lines().length > 0);
		expect(memory.snapshot().rules.find(row => row.rule === "articles")?.occurrences).toBe(before + 2);
		expect(memory.ruleDetail("articles").example?.words).toBeUndefined();
	} finally {
		memory.close();
	}
});

test.each([
	["https://private.example/token", "https://private.example/token"],
	["src/private.ts", "src/private.ts"],
	["`privateCall()`", "privateCall"],
])("Coach memory counts the fix without storing model-added protected text %j", async (added, corrected) => {
	const memory = openCoachMemory();
	try {
		const before = memory.snapshot().rules.find(row => row.rule === "spelling")?.occurrences ?? 0;
		const coach = await fixture({
			reply: () => `Better: we need ${added} before the meeting\n[spelling] help → ${corrected} (Spelling)`,
		});
		await coach.input("we need help before the meeting");
		await until(() => coach.lines().length > 0);
		expect(memory.snapshot().rules.find(row => row.rule === "spelling")?.occurrences).toBe(before + 1);
		const { example } = memory.ruleDetail("spelling");
		expect(example).toBeDefined();
		expect(example?.words).toBeUndefined();
	} finally {
		memory.close();
	}
});

test.each([
	{ source: "rpc" },
	{ source: "extension" },
	{ mode: "rpc" },
	{ mode: "print" },
	{ mode: "acp" },
	{ hasUI: false },
	{ agent: { id: "worker", kind: "task" } },
	{ text: "/model sonnet" },
])("noninteractive, non-main, or command input does not start coaching: %j", async options => {
	const coach = await fixture();
	const context = { ...coach.ctx, ...options } as typeof coach.ctx;
	expect(await coach.input(options.text ?? "this work", { source: options.source as "rpc" | "extension" | undefined ?? "interactive" }, context)).toEqual([undefined]);
	await Bun.sleep(25);
	expect(coach.requests).toEqual([]);
	expect(coach.lines()).toEqual([]);
});

test("the project's englishCoach override is reloaded on a session switch", async () => {
	const coach = await fixture({ settings: { englishCoach: false } });
	await coach.input("this work");
	await Bun.sleep(25);
	expect(coach.requests).toEqual([]);
	expect(coach.lines()).toEqual([]);
	writePluginSettings(coach.ctx.cwd, { englishCoach: true });
	await coach.emit("session_switch");
	await coach.input("this work");
	await coach.checked();
	expect(coach.requests).toHaveLength(1);
	writePluginSettings(coach.ctx.cwd, { englishCoach: false });
	await coach.emit("session_switch");
	await coach.input("this work");
	await Bun.sleep(25);
	expect(coach.requests).toHaveLength(1);
});

test("a missing tiny selector is refreshed once, warned once, and never uses the main model", async () => {
	const coach = await fixture();
	const provider = `coach-missing-${crypto.randomUUID()}`;
	let discoveries = 0;
	coach.main.modelRegistry.registerProvider(provider, {
		api: "openai-completions", apiKey: "fixture-key",
		fetchDynamicModels: async () => { discoveries++; return []; },
	});
	coach.settings.setModelRole("tiny", `${provider}/absent`);
	await coach.input("this work");
	await until(() => coach.notices.length > 0);
	expect(coach.notices).toEqual([{ message: `@tiny has no model (${provider}/absent). Coaching is off for this session.`, level: "warning" }]);
	expect(discoveries).toBe(1);
	const renders = coach.renders();
	await coach.input("another sentence");
	await Bun.sleep(25);
	expect(discoveries).toBe(1);
	expect(coach.renders()).toBe(renders);
	expect(coach.requests).toEqual([]);
	expect(coach.notices).toHaveLength(1);
	expect(coach.lines()).toEqual([]);
});

test("a provider refresh can find the tiny model without using the main model", async () => {
	const coach = await fixture();
	const small = coach.ctx.models.resolve("@tiny")!;
	const provider = `coach-discovery-${crypto.randomUUID()}`;
	let discoveries = 0;
	coach.main.modelRegistry.registerProvider(provider, {
		api: "openai-completions", apiKey: "fixture-key", baseUrl: small.baseUrl,
		fetchDynamicModels: async () => { discoveries++; return [{ ...small, id: "discovered", contextWindow: 128000, maxTokens: 4096 }]; },
	});
	coach.settings.setModelRole("tiny", `${provider}/discovered`);
	expect(coach.ctx.models.resolve("@tiny")).toBeUndefined();
	await coach.input("this work");
	await coach.checked();
	expect(coach.requests.map(body => body.model)).toEqual(["discovered"]);
	expect(discoveries).toBe(1);
});

test("credentials lost after tiny resolution warn once and never send a request", async () => {
	const coach = await fixture();
	const model = coach.ctx.models.resolve("@tiny")!;
	const credential = spyOn(coach.main.modelRegistry, "getApiKey").mockResolvedValue(undefined);
	try {
		await coach.input("this work");
		await until(() => coach.notices.length > 0);
		expect(coach.notices).toEqual([{ message: `@tiny has no credential (${model.provider}/${model.id}). Coaching is off for this session.`, level: "warning" }]);
		await coach.input("another sentence");
		expect(coach.lines()).toEqual([]);
		await Bun.sleep(25);
		expect(coach.requests).toEqual([]);
	} finally {
		credential.mockRestore();
	}
});

test("a 301-token prompt is not sent, while a 300-token prompt is checked", async () => {
	const coach = await fixture();
	await coach.input(`${"a ".repeat(300)}a`);
	expect(coach.requests).toEqual([]);
	await coach.input(`${"a ".repeat(299)}a`);
	await coach.checked();
	expect(coach.requests).toHaveLength(1);
});

test("reasoning is disabled when the selected model permits it", async () => {
	const coach = await fixture();
	const small = coach.ctx.models.resolve("@tiny")!;
	const provider = `coach-optional-reasoning-${crypto.randomUUID()}`;
	coach.main.modelRegistry.registerProvider(provider, {
		api: "openai-completions", apiKey: "fixture-key", baseUrl: small.baseUrl,
		models: [{
			...small, id: "optional-reasoning", contextWindow: 128000, maxTokens: 4096,
			thinking: { ...small.thinking!, requiresEffort: false },
			compat: { supportsReasoningEffort: true, reasoningDisableMode: "none-effort" },
		}],
	});
	coach.settings.setModelRole("tiny", `${provider}/optional-reasoning`);
	await coach.input("This works.");
	await coach.checked();
	expect(coach.requests).toHaveLength(1);
	expect(coach.requests[0]!.reasoning_effort).toBe("none");
});

test("a provider error warns outside the panel and records its attempted usage", async () => {
	const coach = await fixture({ fail: ["small"] });
	await coach.input("this work");
	await until(() => coach.notices.length > 0);
	expect(coach.notices[0]?.message).toContain("fixture provider unavailable");
	expect(coach.lines()).toEqual([]);
	expect(coach.main.sessionManager.getEntries().filter(entry => entry.type === "model_usage")).toMatchObject([
		{ purpose: "english-coach", model: "small", stopReason: "error" },
	]);
});

test("every completeSimple attempt is charged to the private English coach ledger", async () => {
	let attempts = 0;
	const coach = await fixture({ finishReason: () => ++attempts === 1 ? "repetition" : "stop" });
	await coach.input("This works.");
	await coach.checked();
	expect(coach.requests.map(body => body.model)).toEqual(["small", "small"]);
	expect(coach.main.sessionManager.getEntries().filter(entry => entry.type === "model_usage")).toMatchObject([
		{ purpose: "english-coach", model: "small", stopReason: "error", usage: { input: 100, output: 10 } },
		{ purpose: "english-coach", model: "small", stopReason: "stop", usage: { input: 100, output: 10 } },
	]);
	expect(coach.main.messages).toEqual([]);
});

test("usage is dropped when its initiating session changes while the provider is answering", async () => {
	const answer = Promise.withResolvers<string>();
	const coach = await fixture({ reply: () => answer.promise });
	await coach.input("This works.");
	await until(() => coach.requests.length === 1);
	const ledger = coach.main.sessionManager;
	ledger.newSession();
	answer.resolve("No mistakes");
	await Bun.sleep(30);
	expect(coach.lines()).toEqual([]);
	expect(ledger.getEntries().filter(entry => entry.type === "model_usage")).toEqual([]);
});

test("credential service errors warn without emoji or an input rejection", async () => {
	const coach = await fixture();
	const credential = spyOn(coach.main.modelRegistry, "getApiKey").mockRejectedValue(new Error("credential service unavailable ⚠️"));
	try {
		expect(await coach.input("This works.")).toEqual([undefined]);
		await until(() => coach.notices.length > 0);
		expect(coach.notices[0]?.message).toBe("English coach: Check failed: credential service unavailable ");
		expect(coach.lines()).toEqual([]);
		expect(coach.requests).toEqual([]);
	} finally {
		credential.mockRestore();
	}
});

test("a one-character rewrite is a valid correction", async () => {
	const coach = await fixture({ reply: () => "Better: a\nan → a (Article)" });
	await coach.input("an");
	await until(() => coach.lines().length > 0);
	expect(coach.lines()).toEqual(["an a", "an → a (Article)"]);
	expect(coach.nativeSpans()[0]).toEqual([{ t: "an", s: "del" }, { t: " " }, { t: "a", s: "ins" }]);
});

test("capitalization is never corrected: case-only mistakes are no mistakes, and case changes beside a real fix stay as typed", async () => {
	const clean = await fixture({ reply: () => "Better: I use Git Diff.\ni → I (Capitalization)\ngit diff → Git Diff (Capitalization)" });
	await clean.input("i use git diff.");
	await clean.checked();
	expect(clean.lines()).toEqual([]);
	const mixed = await fixture({ reply: () => "Better: It fails in Git Diff.\nit fail → It fails (Agreement)" });
	await mixed.input("it fail in git diff");
	await until(() => mixed.lines().length > 0);
	expect(mixed.nativeText()).toEqual(["it fail fails in git diff."]);
	expect(mixed.nativeHovers()).toEqual([{ text: "fail fails", title: "fail → fails: Agreement" }]);
});

test("a project's token limit skips longer prompts and caps replies for prompts at or below the limit", async () => {
	const coach = await fixture({ settings: { englishCoachMaxTokens: 4 } });
	await coach.input("a a a a a");
	expect(coach.lines()).toEqual([]);
	expect(coach.requests).toEqual([]);
	await coach.input("a a a a");
	await coach.checked();
	expect(coach.requests).toHaveLength(1);
	expect(coach.requests[0]!.max_completion_tokens ?? coach.requests[0]!.max_tokens).toBe(208);
	await coach.input("a a a");
	await coach.checked(2);
	expect(coach.requests).toHaveLength(2);
});

test("a session switch reloads the token limit from the new project's plugin overrides", async () => {
	const coach = await fixture({ settings: { englishCoachMaxTokens: 4 } });
	await coach.input("a a a a");
	await coach.checked();
	expect(coach.requests[0]!.max_completion_tokens ?? coach.requests[0]!.max_tokens).toBe(208);
	const other = await fixture({ settings: { englishCoachMaxTokens: 6 } });
	const context = { ...coach.ctx, cwd: other.ctx.cwd };
	await coach.emit("session_switch", {}, context);
	await coach.input("a a a a a a a", {}, context);
	expect(coach.lines()).toEqual([]);
	expect(coach.requests).toHaveLength(1);
	await coach.input("a a a a a a", {}, context);
	await coach.checked(2);
	expect(coach.requests).toHaveLength(2);
	expect(coach.requests[1]!.max_completion_tokens ?? coach.requests[1]!.max_tokens).toBe(212);
});

test.each([0, -1, "4", null, true])("an invalid token limit %j warns once and disables coaching for the session", async limit => {
	const coach = await fixture({ settings: { englishCoachMaxTokens: limit } });
	expect(coach.notices[0]?.message).toBe("englishCoachMaxTokens must be a positive number. Coaching is off for this session.");
	expect(coach.requests).toEqual([]);
	await coach.input("This works.");
	expect(coach.lines()).toEqual([]);
	const renders = coach.renders();
	await coach.input("Another sentence.");
	await Bun.sleep(25);
	expect(coach.requests).toEqual([]);
	expect(coach.renders()).toBe(renders);
	expect(coach.lines()).toEqual([]);
});

test.each([
	[undefined, "Vietnamese"],
	["Japanese", "Japanese"],
])("pattern names are asked for in the englishCoachLanguage %j", async (setting, language) => {
	const coach = await fixture({ settings: setting === undefined ? {} : { englishCoachLanguage: setting } });
	await coach.input("this work");
	await coach.checked();
	const system = JSON.stringify(coach.requests[0]!.messages.filter((message: any) => message.role !== "user"));
	expect(system).toContain(`Write each pattern name in ${language}`);
	expect(system).not.toContain("{{language}}");
});

test.each(["", "  ", 3])("an invalid englishCoachLanguage %j warns once and disables coaching for the session", async setting => {
	const coach = await fixture({ settings: { englishCoachLanguage: setting } });
	expect(coach.notices[0]?.message).toBe("englishCoachLanguage must name a language. Coaching is off for this session.");
	await coach.input("This works.");
	await Bun.sleep(25);
	expect(coach.requests).toEqual([]);
});

describe("English coach submission cancellation", () => {
	test("a newer prompt aborts the pending request and keeps only its own outcome", async () => {
		const first = Promise.withResolvers<string>();
		const second = Promise.withResolvers<string>();
		const coach = await fixture({
			reply: body => body.messages.at(-1).content === "first prompt" ? first.promise : second.promise,
		});
		try {
			await coach.input("first prompt");
			await until(() => coach.requests.length === 1);
			expect(coach.abortedRequests).toEqual([]);
			expect(await coach.input("second prompt")).toEqual([undefined]);
			expect(coach.lines()).toEqual([]);
			await until(() => coach.requests.length === 2 && coach.abortedRequests.length === 1);
			expect(coach.abortedRequests[0]!.messages.at(-1).content).toBe("first prompt");
			second.resolve("No mistakes");
			await coach.checked();
			first.resolve("Better: First prompt.\nfirst → First (Capitalization)");
			await Bun.sleep(30);
			expect(coach.lines()).toEqual([]);
		} finally {
			first.resolve("No mistakes");
			second.resolve("No mistakes");
		}
	});

	test.each(["/model sonnet", "/btw", ""])("an unchecked submission %j aborts the request and removes its panel", async text => {
		const answer = Promise.withResolvers<string>();
		const coach = await fixture({ reply: () => answer.promise });
		try {
			await coach.input("pending prompt");
			await until(() => coach.requests.length === 1);
			expect(await coach.input(text)).toEqual([undefined]);
			await until(() => coach.abortedRequests.length === 1);
			expect(coach.lines()).toEqual([]);
			answer.resolve("No mistakes");
			await Bun.sleep(30);
			expect(coach.requests).toHaveLength(1);
			expect(coach.lines()).toEqual([]);
		} finally {
			answer.resolve("No mistakes");
		}
	});

	test("an unchecked command ends a completed correction, and the next prompt opens a new panel", async () => {
		const coach = await fixture({ reply: () => FIX });
		await coach.input("this work");
		await until(() => coach.lines().length > 0);
		await coach.input("/model sonnet");
		expect(coach.lines()).toEqual([]);
		await coach.input("this work");
		await until(() => coach.lines().length > 0);
		expect(coach.requests).toHaveLength(2);
	});

	test.each(["session_before_switch", "session_switch", "session_before_branch", "session_tree", "session_shutdown"])(
		"%s aborts the pending request and removes its panel without a late outcome",
		async event => {
			const answer = Promise.withResolvers<string>();
			const coach = await fixture({ reply: () => answer.promise });
			try {
				await coach.input("pending prompt");
				await until(() => coach.requests.length === 1);
				await coach.emit(event);
				await until(() => coach.abortedRequests.length === 1);
				expect(coach.lines()).toEqual([]);
				answer.resolve("No mistakes");
				await Bun.sleep(30);
				expect(coach.lines()).toEqual([]);
			} finally {
				answer.resolve("No mistakes");
			}
		},
	);

	test("a session switch removes a completed outcome and permits a fresh panel", async () => {
		const coach = await fixture({ reply: () => FIX });
		await coach.input("this work");
		await until(() => coach.lines().length > 0);
		await coach.emit("session_switch");
		expect(coach.lines()).toEqual([]);
		await coach.input("this work");
		await until(() => coach.lines().length > 0);
		expect(coach.requests).toHaveLength(2);
	});

	test("failure to open a correction warns without rejecting input", async () => {
		const coach = await fixture({ reply: () => FIX });
		const widget = spyOn(coach.ctx.ui, "setWidget").mockImplementationOnce(() => {
			throw new Error("panel unavailable");
		});
		try {
			expect(await coach.input("this work")).toEqual([undefined]);
			await until(() => coach.notices.length > 0);
			expect(coach.notices[0]?.message).toContain("panel unavailable");
			expect(coach.lines()).toEqual([]);
		} finally {
			widget.mockRestore();
		}
	});

	test("failure to remove an old panel is reported without rejecting input dispatch", async () => {
		const coach = await fixture({ reply: () => FIX });
		await coach.input("this work");
		await until(() => coach.lines().length > 0);
		const widget = spyOn(coach.ctx.ui, "setWidget").mockImplementationOnce(() => {
			throw new Error("panel cleanup failed");
		});
		try {
			expect(await coach.input("/model sonnet")).toEqual([undefined]);
			expect(coach.notices[0]?.message).toContain("panel cleanup failed");
			expect(coach.requests).toHaveLength(1);
		} finally {
			widget.mockRestore();
		}
	});

	test("a cancelled credential lookup cannot warn or disable the next check", async () => {
		const lookup = Promise.withResolvers<string | undefined>();
		const coach = await fixture();
		const credential = spyOn(coach.main.modelRegistry, "getApiKey").mockImplementationOnce(() => lookup.promise);
		try {
			await coach.input("first prompt");
			await coach.input("second prompt");
			await coach.checked();
			lookup.resolve(undefined);
			await Bun.sleep(30);
			expect(coach.lines()).toEqual([]);
			await coach.input("third prompt");
			await coach.checked(2);
			expect(coach.lines()).toEqual([]);
			expect(coach.notices).toEqual([]);
		} finally {
			lookup.resolve(undefined);
			credential.mockRestore();
		}
	});

	test("a cancelled credential error cannot replace the newest outcome", async () => {
		const lookup = Promise.withResolvers<string | undefined>();
		const coach = await fixture();
		const credential = spyOn(coach.main.modelRegistry, "getApiKey").mockImplementationOnce(() => lookup.promise);
		try {
			await coach.input("first prompt");
			await coach.input("second prompt");
			await coach.checked();
			lookup.reject(new Error("old credential error"));
			await Bun.sleep(30);
			expect(coach.lines()).toEqual([]);
			expect(coach.notices).toEqual([]);
			expect(coach.requests).toHaveLength(1);
		} finally {
			lookup.resolve(undefined);
			credential.mockRestore();
		}
	});

	test("a cancelled provider refresh cannot warn or disable the next check", async () => {
		const refresh = Promise.withResolvers<void>();
		const coach = await fixture();
		const tiny = coach.settings.getModelRole("tiny");
		coach.settings.setModelRole("tiny", "missing-coach-provider/absent");
		const discovery = spyOn(coach.main.modelRegistry, "refreshDiscoverableProviders").mockImplementationOnce(() => refresh.promise);
		try {
			await coach.input("first prompt");
			expect(discovery).toHaveBeenCalledTimes(1);
			coach.settings.setModelRole("tiny", tiny);
			await coach.input("second prompt");
			await coach.checked();
			refresh.resolve();
			await Bun.sleep(30);
			expect(coach.lines()).toEqual([]);
			expect(coach.notices).toEqual([]);
			expect(coach.requests).toHaveLength(1);
		} finally {
			refresh.resolve();
			discovery.mockRestore();
		}
	});
});

describe("bounded English coach panel", () => {
	const input = Array.from({ length: 24 }, (_, index) => `fix word${index}`).join("\n");
	const reply = `Better: ${Array.from({ length: 24 }, (_, index) => `fix correction${index}`).join(" ")}\n${
		Array.from({ length: 24 }, (_, index) => `word${index} → correction${index} (Word choice)`).join("\n")
	}`;

	test("a long correction keeps every line and caps its scroll body at forty percent of the terminal", async () => {
		const coach = await fixture({ reply: () => reply });
		await coach.input(input);
		await until(() => coach.lines().length > 0);
		const lines = coach.lines();
		expect(lines.slice(0, 2)).toEqual(["fix word0 correction0", "fix word1 correction1"]);
		expect(lines).toContain("fix word23 correction23");
		expect(lines.at(-1)).toBe("word23 → correction23 (Word choice)");
		const body = () => allNodes(panelTree([...coach.widgets.values()][0]!)).find(node => node.p.role === "omp-tools.panel-body");
		expect(body()?.p.max).toEqual({ lines: 11 });
		coach.resize(4);
		expect(body()?.p.max).toEqual({ lines: 1 });
	});

	test("Tern keeps the full correction text and explains each change on hover", async () => {
		const coach = await fixture({ reply: () => reply });
		await coach.input(input);
		await until(() => coach.lines().length > 0);
		const native = coach.nativeText();
		expect(native).toContain("fix word0 correction0");
		expect(native).toContain("fix word23 correction23");
		expect(coach.nativeHovers().at(-1)?.title).toBe("word23 → correction23: Word choice");
	});
});

describe("closing the English coach panel", () => {
	test("a running check has no panel and does not take Escape from the composer", async () => {
		const answer = Promise.withResolvers<string>();
		const coach = await fixture({ reply: () => answer.promise });
		await coach.input("this work");
		await until(() => coach.requests.length === 1);
		expect(coach.key("\x1b")).toBe(false);
		expect(coach.widgets.size).toBe(0);
		answer.resolve(FIX);
		await until(() => coach.lines().length > 0);
	});

	test("Esc keeps the panel while the editor has text, omp's ask dialog is open, or a tool approval waits", async () => {
		const coach = await fixture({ reply: () => FIX });
		await coach.input("this work");
		await until(() => coach.lines().length > 0);
		coach.type("draft");
		expect(coach.key("\x1b")).toBe(false);
		coach.type("");
		await coach.ask("tool_execution_start");
		expect(coach.key("\x1b")).toBe(false);
		expect(coach.lines()[0]).toBe("this work works.");
		await coach.ask("tool_execution_end");
		await coach.emit("tool_approval_requested", { toolCallId: "approve-1", toolName: "generate_image" });
		expect(coach.key("\x1b")).toBe(false);
		await coach.emit("tool_approval_resolved", { toolCallId: "approve-1", toolName: "generate_image", approved: false });
		expect(coach.key("\x1b")).toBe(true);
		expect(coach.widgets.size).toBe(0);
	});

	test("Esc still closes the panel after a branch drops omp's terminal input listeners", async () => {
		const coach = await fixture({ reply: () => FIX });
		coach.dropTerminalInput();
		await coach.emit("session_branch");
		await coach.input("this work");
		await until(() => coach.lines().length > 0);
		expect(coach.key("\x1b")).toBe(true);
		expect(coach.widgets.size).toBe(0);
	});

	test("the panel closes on a remapped interrupt key, on Escape only while the interrupt has no key, and never on Ctrl+C", async () => {
		const keymap = host.getKeybindings();
		try {
			host.setKeybindings(host.KeybindingsManager.inMemory({ "app.interrupt": "ctrl+x" }));
			const coach = await fixture({ reply: () => FIX });
			await coach.input("this work");
			await until(() => coach.lines().length > 0);
			expect(coach.key("\x1b")).toBe(false);
			expect(coach.key("\x03")).toBe(false);
			expect(coach.lines()[0]).toBe("this work works.");
			expect(coach.key("\x18")).toBe(true);
			expect(coach.widgets.size).toBe(0);

			host.setKeybindings(host.KeybindingsManager.inMemory({ "app.interrupt": [] }));
			await coach.input("this work");
			await until(() => coach.lines().length > 0);
			expect(coach.key("\x1b")).toBe(true);
			expect(coach.widgets.size).toBe(0);

			host.setKeybindings(host.KeybindingsManager.inMemory({ "app.interrupt": ["ctrl+c", "ctrl+x"] }));
			await coach.input("this work");
			await until(() => coach.lines().length > 0);
			expect(coach.key("\x03")).toBe(false);
			expect(coach.key("\x1b")).toBe(false);
			expect(coach.lines()[0]).toBe("this work works.");
			expect(coach.key("\x18")).toBe(true);
		} finally {
			host.setKeybindings(keymap);
		}
	});

	test("clicking the Tern esc hint closes the panel", async () => {
		const coach = await fixture({ reply: () => FIX });
		await coach.input("this work");
		await until(() => coach.lines().length > 0);
		const walk = (node: UiNode): UiNode[] => [node, ...node.children().flatMap(walk)];
		const close = walk([...coach.widgets.values()][0]!).find(node => node.props().actions?.click === "close");
		close!.handlers.onAction!("close", { type: "action", key: "close", act: "close", mods: [] } as never);
		expect(coach.widgets.size).toBe(0);
	});
});

test("the correction uses Tern's native note heading without changing the terminal body", async () => {
	const coach = await fixture({ reply: () => FIX });
	await coach.input("this work");
	await until(() => coach.lines().length > 0);
	const tree = panelTree(coach.widgets.get("omp-tools.english-coach")!, true);
	expect(tree[0]?.p.role).toBe("omp.btw.note");
	expect(JSON.stringify(tree)).toContain("English correction");
	expect(coach.lines()).toEqual(["this work works.", "this work → This works (Agreement)"]);
});

describe("protected code and links", () => {
	test("a reply that drops protected text fails once and records its usage", async () => {
		const coach = await fixture({
			reply: () => "Better: It fails.\n- it fail → It fails (Agreement)",
		});
		expect(await coach.input("it fail in src/private.ts")).toEqual([undefined]);
		await until(() => coach.notices.length > 0);
		expect(coach.lines()).toEqual([]);
		expect(coach.notices[0]?.message).toContain("unreadable reply");
		expect(coach.requests).toHaveLength(1);
		expect(coach.main.sessionManager.getEntries().filter(entry => entry.type === "model_usage")).toMatchObject([
			{ purpose: "english-coach", model: "small", usage: { input: 100, output: 10 } },
		]);
	});

	test.each([
		["repeated", "Better: It fails in [[COACH_1]] and [[COACH_1]].\n- it fail → It fails (Agreement)"],
		["invented rewrite", "Better: It fails in [[COACH_1]] and [[COACH_99]].\n- it fail → It fails (Agreement)"],
		["invented mistake", "Better: It fails in [[COACH_1]].\n- it fail [[COACH_99]] → It fails (Agreement)"],
	])("a %s placeholder fails without showing a partial correction", async (_kind, reply) => {
		const coach = await fixture({ reply: () => reply });
		await coach.input("it fail in src/private.ts");
		await until(() => coach.notices.length > 0);
		expect(coach.lines()).toEqual([]);
		expect(coach.notices[0]?.message).toContain("unreadable reply");
		expect(coach.requests).toHaveLength(1);
	});

	test("reordered protected text fails rather than changing the prompt's meaning", async () => {
		const coach = await fixture({
			reply: () => "Better: It fails from [[COACH_2]] to [[COACH_1]].\n- it fail → It fails (Agreement)",
		});
		await coach.input("it fail from src/first.ts to src/second.ts");
		await until(() => coach.notices.length > 0);
		expect(coach.lines()).toEqual([]);
		expect(coach.notices[0]?.message).toContain("unreadable reply");
		expect(coach.requests).toHaveLength(1);
	});

	test("code, paths, and URLs stay out of the request and return verbatim in corrections", async () => {
		const coach = await fixture({
			reply: body => {
				const input = body.messages.find((message: any) => message.role === "user").content as string;
				return `Better: ${input.replace("it fail", "It fails")}\n${input} → ${input.replace("it fail", "It fails")} (Agreement)`;
			},
		});
		const input = "it fail with `secretCall()` in src/private.ts at https://private.example/token";
		expect(await coach.input(input)).toEqual([undefined]);
		await until(() => coach.lines().length > 0);
		expect(coach.requests).toHaveLength(1);
		const request = JSON.stringify(coach.requests[0]);
		for (const secret of ["secretCall", "src/private.ts", "private.example", "/token"]) {
			expect(request).not.toContain(secret);
		}
		const fixed = "It fails with `secretCall()` in src/private.ts at https://private.example/token";
		const corrected = "it fail fails with `secretCall()` in src/private.ts at https://private.example/token";
		expect(coach.lines()).toEqual([corrected, `${input} → ${fixed} (Agreement)`]);
		expect(coach.nativeText()).toContain(corrected);
		expect(coach.nativeSpans()[0]!.filter(span => span.s === "dim").map(span => span.t)).toEqual([
			"`secretCall()`", "src/private.ts", "https://private.example/token",
		]);
	});

	test("a short sentence above a large fenced paste is checked and shows one counted marker line", async () => {
		const coach = await fixture({
			settings: { englishCoachMaxTokens: 4 },
			reply: body => {
				const input = body.messages.find((message: any) => message.role === "user").content as string;
				return `Better: ${input.replace("it fail", "It fails").replace(/\s+/g, " ")}\nit fail → It fails (Agreement)`;
			},
		});
		await coach.input(`it fail\n\`\`\`typescript\n${"const privateSecret = 123;\n".repeat(1000)}\`\`\``);
		await until(() => coach.lines().length > 0);
		expect(coach.requests).toHaveLength(1);
		expect(JSON.stringify(coach.requests)).not.toContain("privateSecret");
		expect(JSON.stringify(coach.requests)).not.toContain("typescript");
		expect(coach.lines()).toEqual(["it fail fails", "[code block, 1000 lines]", "it fail → It fails (Agreement)"]);
		expect(coach.nativeText()).toEqual(["it fail fails", "[code block, 1000 lines]"]);
		expect(coach.nativeHovers().map(hover => hover.title)).toEqual(["fail → fails: Agreement"]);
	});

	test.each([
		"`onlyCode()`",
		"src/private.ts https://private.example/token",
		"```ts\nonlyCode();\n```",
		"`onlyCode()` /Users/private/file.ts C:\\private\\file.ts",
	])("protected-only input %j skips the model and stays quiet", async input => {
		const coach = await fixture();
		await coach.input(input);
		expect(coach.requests).toEqual([]);
		expect(coach.lines()).toEqual([]);
	});

	test("protected-only input cancels an unfinished check without showing its late correction", async () => {
		const answer = Promise.withResolvers<string>();
		const coach = await fixture({ reply: () => answer.promise });
		try {
			await coach.input("pending prompt");
			await until(() => coach.requests.length === 1);
			expect(await coach.input("```ts\nprivateSecret();\n```")).toEqual([undefined]);
			await until(() => coach.abortedRequests.length === 1);
			expect(coach.lines()).toEqual([]);
			answer.resolve("Better: Pending prompt.\npending → Pending (Capitalization)");
			await Bun.sleep(30);
			expect(coach.requests).toHaveLength(1);
			expect(coach.lines()).toEqual([]);
		} finally {
			answer.resolve("No mistakes");
		}
	});

	test("expanded pasted prose counts in full rather than as a compact paste chip", async () => {
		const coach = await fixture();
		await coach.input("This is the complete expanded prose from a large paste.\n".repeat(500));
		expect(coach.requests).toEqual([]);
		expect(coach.lines()).toEqual([]);
	});

	test("protected text and its placeholder tokens do not consume the English budget", async () => {
		const coach = await fixture({ settings: { englishCoachMaxTokens: 4 } });
		await coach.input(`it fail ${"`privateCode()` ".repeat(30)}${"src/private.ts ".repeat(30)}https://private.example/${"secret".repeat(1000)}`);
		await coach.checked();
		expect(coach.requests).toHaveLength(1);
		expect(JSON.stringify(coach.requests)).not.toContain("secret");
		expect(coach.lines()).toEqual([]);
	});

	test.each([
		["``privateCode(\n`nested`)\n``", "privateCode"],
		["C:\\private\\file.ts \\\\server\\secret\\file.ts relative\\secret\\file.ts", "secret"],
		["www.private.example/secret", "private"],
	])("protected form %j stays out of the request and returns exactly", async (protectedText, secret) => {
		const coach = await fixture({
			reply: body => {
				const input = body.messages.find((message: any) => message.role === "user").content as string;
				return `Better: ${input.replace("it fail", "It fails")}\nit fail → It fails (Agreement)`;
			},
		});
		await coach.input(`it fail ${protectedText}`);
		await until(() => coach.lines().length > 0);
		expect(JSON.stringify(coach.requests)).not.toContain(secret);
		expect(coach.lines()).toEqual([...`it fail fails ${protectedText}`.split("\n"), "it fail → It fails (Agreement)"]);
	});

	test.each([
		["~~~js\r\nprivateSecret();\r\nnext();\r\n~~~", 2],
		["````js\nprivateSecret();\n```\n````", 2],
		["```js\nprivateSecret();", 1],
		["```js\n```", 0],
		["```js\n\n```", 1],
	])("fenced form %j restores its line count without exposing the block", async (block, count) => {
		const coach = await fixture({
			reply: body => {
				const input = body.messages.find((message: any) => message.role === "user").content as string;
				return `Better: ${input.replace("it fail", "It fails").replace(/\s+/g, " ")}\nit fail → It fails (Agreement)`;
			},
		});
		await coach.input(`it fail\n${block}`);
		await until(() => coach.lines().length > 0);
		expect(coach.requests).toHaveLength(1);
		expect(JSON.stringify(coach.requests)).not.toContain("privateSecret");
		expect(coach.lines()).toEqual(["it fail fails", `[code block, ${count} lines]`, "it fail → It fails (Agreement)"]);
	});

	test("literal placeholder-like text and code containing it restore without replacing either twice", async () => {
		const coach = await fixture({
			reply: body => {
				const input = body.messages.find((message: any) => message.role === "user").content as string;
				return `Better: ${input.replace("it fail", "It fails")}\nit fail → It fails (Agreement)`;
			},
		});
		await coach.input("it fail [[COACH_1]] with `[[COACH__2]]`");
		await until(() => coach.lines().length > 0);
		expect(coach.lines()).toEqual(["it fail fails [[COACH_1]] with `[[COACH__2]]`", "it fail → It fails (Agreement)"]);
	});
});

describe("English coach command allow list", () => {
	test.each([
		"/skill:review it fail",
		"/skill:team:review\tit fail",
		"/btw\nit fail",
	])("only the argument of %j reaches the coach model", async input => {
		const coach = await fixture({
			settings: { englishCoachMaxTokens: 2 },
			reply: () => "Better: It fails.\nit fail → It fails (Agreement)",
		});
		expect(await coach.input(input)).toEqual([undefined]);
		await until(() => coach.lines()[0] === "it fail fails.");
		expect(coach.requests).toHaveLength(1);
		expect(coach.requests[0]!.messages.filter((message: any) => message.role === "user")).toEqual([
			{ role: "user", content: "it fail" },
		]);
		expect(coach.lines()).toEqual(["it fail fails.", "it fail → It fails (Agreement)"]);
	});

	test.each(["coach-file", "team:coach-file"])("a discovered prompt-file command /%s sends only its unexpanded argument", async name => {
		const coach = await fixture({ promptCommands: [name] });
		expect(await coach.input(`/${name} it fail`)).toEqual([undefined]);
		await coach.checked();
		expect(coach.requests).toHaveLength(1);
		expect(coach.requests[0]!.messages.filter((message: any) => message.role === "user")).toEqual([
			{ role: "user", content: "it fail" },
		]);
		expect(JSON.stringify(coach.requests)).not.toContain("Expanded template");
	});

	test.each([
		"/",
		"/ fix this",
		"/model sonnet",
		"/resume 3f2a",
		"/unknown-coach-command fix this",
		"/coach-file-extra fix this",
		"/skill: fix this",
		"/skills:review fix this",
		"/btw",
		"/btw \t\n",
		"/skill:review",
		"/skill:review \t",
		"/coach-file",
		"/coach-file \n",
	])("unchecked command %j removes the previous outcome without a request", async input => {
		const coach = await fixture({ promptCommands: ["coach-file"], reply: () => FIX });
		await coach.input("this work");
		await until(() => coach.lines().length > 0);
		expect(await coach.input(input)).toEqual([undefined]);
		await Bun.sleep(25);
		expect(coach.lines()).toEqual([]);
		expect(coach.requests).toHaveLength(1);
	});

	test("prompt-file names are discovered once per session and replaced for a new cwd", async () => {
		const other = await fixture({ promptCommands: ["other-coach-file"] });
		const coach = await fixture({ promptCommands: ["coach-file"] });
		const discovery = spyOn(host, "discoverSlashCommands");
		try {
			await coach.emit("session_switch");
			expect(discovery).toHaveBeenCalledTimes(1);
			expect(discovery.mock.calls[0]).toEqual([{ cwd: coach.ctx.cwd }]);
			await coach.input("/coach-file it fail");
			await coach.checked();
			await coach.input("This works.");
			await coach.checked(2);
			await Bun.write(`${coach.ctx.cwd}/.omp/commands/late-coach-file.md`, "$ARGUMENTS");
			await coach.input("/late-coach-file it fail");
			expect(coach.lines()).toEqual([]);
			expect(discovery).toHaveBeenCalledTimes(1);
			expect(coach.requests).toHaveLength(2);

			const context = { ...coach.ctx, cwd: other.ctx.cwd };
			await coach.emit("session_switch", {}, context);
			expect(discovery).toHaveBeenCalledTimes(2);
			expect(discovery.mock.calls[1]).toEqual([{ cwd: other.ctx.cwd }]);
			await coach.input("/coach-file it fail", {}, context);
			expect(coach.lines()).toEqual([]);
			await coach.input("/other-coach-file it fail", {}, context);
			await coach.checked(3);
			expect(discovery).toHaveBeenCalledTimes(2);
			expect(coach.requests.at(-1)!.messages.filter((message: any) => message.role === "user")).toEqual([
				{ role: "user", content: "it fail" },
			]);
		} finally {
			discovery.mockRestore();
		}
	});

	test("allowed command arguments keep code and links out of the request and the English budget", async () => {
		const coach = await fixture({ settings: { englishCoachMaxTokens: 4 } });
		await coach.input(`/skill:review it fail \`privateCode()\` src/private.ts https://private.example/${"secret".repeat(1000)}`);
		await coach.checked();
		expect(coach.requests).toHaveLength(1);
		const request = JSON.stringify(coach.requests);
		for (const excluded of ["skill:review", "privateCode", "src/private.ts", "private.example", "secret"]) {
			expect(request).not.toContain(excluded);
		}
	});

	test("an allowed command with only code stays quiet", async () => {
		const coach = await fixture();
		await coach.input("/btw `privateCode()`");
		expect(coach.lines()).toEqual([]);
		expect(coach.requests).toEqual([]);
	});
});
