import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { openCoachMemory } from "../extensions/coach-memory";

const day = 86_400_000;

function withMemory(run: (path: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), "coach-memory-test-"));
	try {
		run(join(dir, "coach", "memory.sqlite"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("duplicate delivery does not advance recurrence or repeat a cue in another pane", () => {
	withMemory(path => {
		const first = openCoachMemory({ path });
		const second = openCoachMemory({ path });
		try {
			const at = Date.UTC(2026, 10, 26, 12);
			const input = {
				at,
				generation: first.beginCheck(),
				fixes: [{ rule: "articles" }, { rule: "articles" }],
			};
			expect(first.recordCheck({ ...input, id: "one" })).toEqual({});
			expect(second.recordCheck({ ...input, id: "one" })).toEqual({});
			expect(second.recordCheck({ ...input, id: "two" })).toEqual({});
			expect(first.recordCheck({ ...input, id: "three" }).cue).toContain("3 of 3");
			expect(second.recordCheck({ ...input, id: "four" })).toEqual({});
		} finally {
			second.close();
			first.close();
		}
	});
});

test("a recurring cue can show again at local midnight but only once on either day", () => {
	withMemory(path => {
		let now = new Date(2026, 10, 26, 23, 59, 59, 999).getTime();
		const first = openCoachMemory({ path, clock: () => now });
		const second = openCoachMemory({ path, clock: () => now });
		try {
			const generation = first.beginCheck();
			const record = (memory: typeof first, id: string, at = now) =>
				memory.recordCheck({ generation, id, at, fixes: [{ rule: "articles" }] });
			expect(record(first, "one")).toEqual({});
			expect(record(first, "two")).toEqual({});
			expect(record(first, "three").cue).toContain("3 of 3");
			expect(record(second, "four")).toEqual({});
			const startedYesterday = now;
			now = new Date(2026, 10, 27).getTime();
			expect(record(second, "five", startedYesterday).cue).toContain("5 of 5");
			expect(record(first, "six")).toEqual({});
		} finally {
			second.close();
			first.close();
		}
	});
});

test("counts clean English prompts, distinct affected prompts and fixes in complete calendar weeks", () => {
	withMemory(path => {
		const at = new Date(2026, 10, 26, 12).getTime();
		const memory = openCoachMemory({ path, clock: () => at });
		const generation = memory.beginCheck();
		const record = (date: number, id: string, ...fixes: { rule: string | undefined }[]) =>
			memory.recordCheck({ at: new Date(2026, 10, date, 12).getTime(), id, generation, fixes });
		try {
			record(9, "previous-0", { rule: "articles" });
			record(10, "previous-1", { rule: "articles" });
			for (let index = 2; index < 5; index++) record(15, `previous-${index}`);
			record(16, "latest-0", { rule: "  ARTICLES  " }, { rule: "articles" }, { rule: "unknown" }, { rule: undefined });
			record(16, "latest-1", { rule: "prepositions" });
			for (let index = 2; index < 5; index++) record(22, `latest-${index}`);
			record(23, "this-week", { rule: "articles" }, { rule: "articles" });

			const snapshot = memory.snapshot();
			expect(snapshot.prompts).toBe(11);
			expect(snapshot.rules).toMatchObject([
				{
					rule: "articles", affectedPrompts: 4, occurrences: 6,
					latestWeek: { affectedPrompts: 1, prompts: 5 },
					previousWeek: { affectedPrompts: 2, prompts: 5 },
					trend: { kind: "comparison", percentagePoints: -20 },
				},
				{ rule: "unclassified", affectedPrompts: 1, occurrences: 2 },
				{ rule: "prepositions", affectedPrompts: 1, occurrences: 1 },
			]);
			expect(snapshot.focus).toMatchObject({ rule: "articles", pinned: false });
			expect(snapshot.digest).toMatchObject({
				from: new Date(2026, 10, 16).getTime(),
				until: new Date(2026, 10, 23).getTime(),
				mostFrequent: "articles",
				latestWeek: { affectedPrompts: 2, prompts: 5 },
				previousWeek: { affectedPrompts: 2, prompts: 5 },
			});
			expect(memory.snapshot(new Date(2026, 11, 1).getTime()).rules[0]?.trend).toEqual({ kind: "small-sample" });
			expect(memory.setPinnedFocus("prepositions", generation)).toBe(true);
			expect(memory.snapshot().focus).toMatchObject({ rule: "prepositions", pinned: true });
		} finally {
			memory.close();
		}
	});
});

test("the cue uses only the past seven days and picks one eligible classified rule", () => {
	withMemory(path => {
		const at = Date.UTC(2026, 10, 26, 12);
		const memory = openCoachMemory({ path, clock: () => at });
		const generation = memory.beginCheck();
		try {
			const record = (id: string, offset: number, ...rules: string[]) =>
				memory.recordCheck({ id, generation, at: at + offset, fixes: rules.map(rule => ({ rule })) });
			record("outside", -8 * day, "articles");
			record("inside", -6 * day, "articles", "prepositions", "unknown");
			record("recent", -day, "prepositions", "unknown");
			record("clean", -day);
			expect(record("today", 0, "articles", "prepositions", "unknown").cue).toContain("Prepositions in 3 of 4");
			expect(record("second-today", 0, "articles", "prepositions", "unknown").cue).toContain("Articles in 3 of 5");
			expect(record("third-today", 0, "articles", "prepositions", "unknown")).toEqual({});
		} finally {
			memory.close();
		}
	});
});

test("rejecting one fix keeps the other fix and the checked prompt", () => {
	withMemory(path => {
		const memory = openCoachMemory({ path });
		const generation = memory.beginCheck();
		const example = { before: "opened issue", after: "opened an issue" };
		try {
			memory.recordCheck({ id: "a", generation, at: Date.now(), fixes: [
				{ rule: "articles", example },
				{ rule: "articles" },
			] });
			const detail = memory.ruleDetail("articles");
			if (!detail.example) throw new Error("The most recent fix was not recorded");
			expect(detail.example.words).toBeUndefined();
			expect(detail.canGoOlder).toBe(true);
			const older = memory.ruleDetail("articles", { before: detail.example.id });
			if (!older.example) throw new Error("The earlier fix was not recorded");
			expect(older.example.words).toEqual(example);
			expect(older.canGoNewer).toBe(true);
			expect(memory.markNotMistake(detail.example.id, generation)).toBe(true);
			expect(memory.markNotMistake(detail.example.id, generation)).toBe(false);
			expect(memory.ruleDetail("articles").example?.words).toEqual(example);
			expect(memory.snapshot()).toMatchObject({
				prompts: 1, rules: [{ rule: "articles", occurrences: 1, affectedPrompts: 1 }],
			});
			expect(memory.markNotMistake(older.example.id, generation)).toBe(true);
			expect(memory.snapshot()).toMatchObject({ prompts: 1, rules: [] });
		} finally {
			memory.close();
		}
	});
});

test("practice rotates exercises and schedules wrong answers sooner across panes", () => {
	withMemory(path => {
		let at = Date.UTC(2026, 10, 26, 12);
		const memory = openCoachMemory({ path, clock: () => at });
		const second = openCoachMemory({ path, clock: () => at });
		try {
			const task = memory.ruleDetail("articles").practice;
			if (!task) throw new Error("A classified rule needs a practice question");
			expect(task.prompt).toContain("opened ___ issue");
			expect(task.choices).toEqual(["a", "an"]);
			expect(memory.answerPractice(task, 0)).toMatchObject({ correct: false, answer: "an", dueAt: at + day });
			expect(second.answerPractice(task, 0)).toBeUndefined();
			const next = second.ruleDetail("articles").practice;
			if (!next) throw new Error("A follow-up question was not scheduled");
			expect(next.prompt).toContain("reopen ___ file");
			expect(second.answerPractice(next, 0)).toBeUndefined();
			at += day;
			expect(second.answerPractice(next, 0)).toMatchObject({ correct: true, answer: "the", dueAt: at + 4 * day });
			expect(memory.ruleDetail("articles").practice?.dueAt).toBe(at + 4 * day);
			expect(memory.ruleDetail("unclassified").practice).toBeUndefined();
		} finally {
			second.close();
			memory.close();
		}
	});
});

test("reset clears private data and rejects stale checks and dashboard actions in another pane", () => {
	withMemory(path => {
		const at = Date.UTC(2026, 10, 26, 12);
		const first = openCoachMemory({ path, clock: () => at });
		const second = openCoachMemory({ path, clock: () => at });
		try {
			const generation = first.beginCheck();
			const secret = "reset-keeps-no-example";
			const input = { id: "external-identity", generation, at, fixes: [{ rule: "articles", example: { before: secret, after: "an example" } }] };
			first.recordCheck(input);
			const detail = first.ruleDetail("articles");
			if (!detail.example || !detail.practice) throw new Error("Expected a fix and a practice task");
			expect(first.setPinnedFocus("articles", generation)).toBe(true);
			expect(first.answerPractice(detail.practice, 1)?.correct).toBe(true);
			expect(statSync(path).mode & 0o777).toBe(0o600);
			expect(readFileSync(path).includes(secret)).toBe(true);
			expect(readFileSync(path).includes(input.id)).toBe(false);

			expect(second.reset(second.beginCheck())).toBe(true);
			expect(first.recordCheck(input)).toEqual({});
			expect(first.markNotMistake(detail.example.id, generation)).toBe(false);
			expect(first.setPinnedFocus("articles", generation)).toBe(false);
			expect(first.answerPractice(detail.practice, 1)).toBeUndefined();
			expect(first.snapshot()).toMatchObject({ prompts: 0, rules: [] });
			expect(first.snapshot().focus).toBeUndefined();
			expect(first.ruleDetail("articles").example).toBeUndefined();
			expect(first.ruleDetail("articles").practice?.dueAt).toBe(0);
			expect(first.beginCheck()).not.toBe(generation);
			expect(readdirSync(dirname(path))).toEqual(["memory.sqlite"]);
			expect(readFileSync(path).includes(secret)).toBe(false);

			first.recordCheck({ ...input, generation: first.beginCheck() });
			expect(second.snapshot().prompts).toBe(1);
		} finally {
			second.close();
			first.close();
		}
	});
});

test("a corrupt store is unavailable, not an empty history", () => {
	withMemory(path => {
		mkdirSync(dirname(path));
		writeFileSync(path, "not a SQLite database");
		expect(() => openCoachMemory({ path })).toThrow();
		expect(readFileSync(path, "utf8")).toBe("not a SQLite database");
	});
});
