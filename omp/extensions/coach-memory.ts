import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync } from "node:fs";
import { dirname, join } from "node:path";
import { getBaseConfigRoot } from "@oh-my-pi/pi-utils";
import { type CoachRuleId, type RecordedCoachRule, classifyCoachRule, coachRule, coachRuleLabel, unclassified } from "./coach-rules";

const day = 86_400_000;
const week = 7 * day;
const minWeekSample = 5;

interface ExampleWords {
	before: string;
	after: string;
}

interface CoachCheck {
	id: string;
	generation: string;
	at: number;
	fixes: readonly { rule: string | undefined; example?: ExampleWords }[];
}

interface CoachPeriod {
	affectedPrompts: number;
	prompts: number;
}

export type CoachTrend = { kind: "small-sample" } | { kind: "comparison"; percentagePoints: number };

export interface CoachRuleStats {
	rule: RecordedCoachRule;
	occurrences: number;
	affectedPrompts: number;
	latestWeek: CoachPeriod;
	previousWeek: CoachPeriod;
	trend: CoachTrend;
}

interface CoachFocus {
	rule: CoachRuleId;
	reason: string;
	pinned: boolean;
}

interface CoachDigest {
	from: number;
	until: number;
	latestWeek: CoachPeriod;
	previousWeek: CoachPeriod;
	mostFrequent?: CoachRuleId;
	trend: CoachTrend;
}

export interface CoachSnapshot {
	generation: string;
	prompts: number;
	rules: readonly CoachRuleStats[];
	focus?: CoachFocus;
	digest: CoachDigest;
}

export interface CoachPracticeTask {
	rule: CoachRuleId;
	generation: string;
	attempts: number;
	dueAt: number;
	prompt: string;
	choices: readonly [string, string];
}

interface CoachPracticeResult {
	correct: boolean;
	answer: string;
	explanation: string;
	dueAt: number;
}

export interface CoachRuleDetail {
	generation: string;
	example?: { id: number; at: number; words?: ExampleWords };
	canGoOlder: boolean;
	canGoNewer: boolean;
	pinned: boolean;
	practice?: CoachPracticeTask;
}

type ExampleCursor = { before: number } | { after: number };

export interface CoachMemory {
	beginCheck(): string;
	recordCheck(check: CoachCheck): { cue?: string };
	snapshot(at?: number): CoachSnapshot;
	ruleDetail(rule: RecordedCoachRule, cursor?: ExampleCursor): CoachRuleDetail;
	markNotMistake(id: number, generation: string): boolean;
	setPinnedFocus(rule: CoachRuleId | undefined, generation: string): boolean;
	answerPractice(task: CoachPracticeTask, choice: 0 | 1): CoachPracticeResult | undefined;
	reset(generation: string): boolean;
	close(): void;
}

const schema = `
CREATE TABLE IF NOT EXISTS memory (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  generation TEXT NOT NULL,
  pinned_rule TEXT
) STRICT;
CREATE TABLE IF NOT EXISTS checks (
  id TEXT PRIMARY KEY NOT NULL,
  at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS checks_at ON checks(at);
CREATE TABLE IF NOT EXISTS fixes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id TEXT NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  rule TEXT NOT NULL,
  original TEXT,
  replacement TEXT,
  rejected INTEGER NOT NULL DEFAULT 0 CHECK (rejected IN (0, 1)),
  CHECK ((original IS NULL) = (replacement IS NULL))
) STRICT;
CREATE INDEX IF NOT EXISTS fixes_check ON fixes(check_id);
CREATE INDEX IF NOT EXISTS active_fixes_rule ON fixes(rule, id) WHERE rejected = 0;
CREATE TABLE IF NOT EXISTS cues (
  rule TEXT PRIMARY KEY NOT NULL,
  at INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS practice (
  rule TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL,
  streak INTEGER NOT NULL,
  due_at INTEGER NOT NULL
) STRICT;
`;

interface WeekCounts {
	latest: number;
	previous: number;
}

function completeWeeks(at: number) {
	const monday = new Date(at);
	monday.setHours(0, 0, 0, 0);
	monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
	const end = monday.getTime();
	monday.setDate(monday.getDate() - 7);
	const latest = monday.getTime();
	monday.setDate(monday.getDate() - 7);
	return { end, latest, previous: monday.getTime() };
}

function periods(affected: WeekCounts, samples: WeekCounts) {
	const latestWeek = { affectedPrompts: affected.latest, prompts: samples.latest };
	const previousWeek = { affectedPrompts: affected.previous, prompts: samples.previous };
	const trend: CoachTrend = samples.latest >= minWeekSample && samples.previous >= minWeekSample
		? { kind: "comparison", percentagePoints: 100 * (affected.latest / samples.latest - affected.previous / samples.previous) }
		: { kind: "small-sample" };
	return { latestWeek, previousWeek, trend };
}

function privateDatabase(path: string, useGlobalPath: boolean): Database {
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	if (useGlobalPath) {
		if (!lstatSync(dir).isDirectory()) throw new Error("Coach memory directory is not a directory");
		chmodSync(dir, 0o700);
	}
	const fd = openSync(path, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
	try {
		const stat = fstatSync(fd);
		if (!stat.isFile() || stat.nlink !== 1) throw new Error("Coach memory must be a private file");
		if ((stat.mode & 0o777) !== 0o600) fchmodSync(fd, 0o600);
	} finally {
		closeSync(fd);
	}
	return new Database(path, { create: false, strict: true });
}

export function openCoachMemory(options: { path?: string; clock?: () => number } = {}): CoachMemory {
	const clock = options.clock ?? Date.now;
	const db = privateDatabase(options.path ?? join(getBaseConfigRoot(), "coach", "memory.sqlite"), options.path === undefined);
	try {
		db.run("PRAGMA busy_timeout = 2000");
		db.run("PRAGMA foreign_keys = ON");
		db.run("PRAGMA journal_mode = DELETE");
		db.run("PRAGMA secure_delete = ON");
		db.transaction(() => {
			db.run(schema);
			db.run("INSERT INTO memory (singleton, generation) VALUES (1, ?) ON CONFLICT DO NOTHING", [randomUUID()]);
		}).immediate();
		return connectMemory(db, clock);
	} catch (error) {
		db.close();
		throw error;
	}
}

function connectMemory(db: Database, clock: () => number): CoachMemory {
	const memory = db.query<{ generation: string; pinned_rule: string | null }, []>(
		"SELECT generation, pinned_rule FROM memory WHERE singleton = 1",
	);
	function readMemory() {
		const row = memory.get();
		if (!row) throw new Error("Coach memory is missing its generation");
		return row;
	}
	const addCheck = db.query<unknown, [string, number]>("INSERT INTO checks (id, at) VALUES (?, ?) ON CONFLICT DO NOTHING");
	const addFix = db.query<unknown, [string, RecordedCoachRule, string | null, string | null]>(
		"INSERT INTO fixes (check_id, rule, original, replacement) VALUES (?, ?, ?, ?)",
	);
	const cueRank = db.query<{ rule: string; count: number }, [string, number, number, number]>(`
		SELECT f.rule, COUNT(DISTINCT f.check_id) AS count
		  FROM checks c CROSS JOIN fixes f ON f.check_id = c.id
		 WHERE f.rejected = 0 AND f.rule <> 'unclassified' AND c.at > ?2 AND c.at <= ?3
		   AND f.rule IN (SELECT rule FROM fixes WHERE check_id = ?1)
		   AND NOT EXISTS (SELECT 1 FROM cues WHERE rule = f.rule AND at >= ?4)
		 GROUP BY f.rule HAVING count >= 3 ORDER BY count DESC, f.rule LIMIT 1
	`);
	const claimCue = db.query<unknown, [CoachRuleId, number]>(`
		INSERT INTO cues (rule, at) VALUES (?1, ?2)
		ON CONFLICT(rule) DO UPDATE SET at = excluded.at
	`);
	const rollingSample = db.query<{ count: number }, [number, number]>("SELECT COUNT(*) AS count FROM checks WHERE at > ? AND at <= ?");

	const recordCheck = db.transaction(({ generation, id, at, fixes }: CoachCheck): { cue?: string } => {
		if (generation !== readMemory().generation) return {};
		const key = createHash("sha256").update(id).digest("hex");
		if (!addCheck.run(key, at).changes) return {};
		for (const { rule, example } of fixes) {
			addFix.run(key, classifyCoachRule(rule), example?.before ?? null, example?.after ?? null);
		}
		if (fixes.length === 0) return {};
		const since = at - week;
		const now = clock();
		const midnight = new Date(now).setHours(0, 0, 0, 0);
		const ranked = cueRank.get(key, since, at, midnight);
		if (!ranked) return {};
		const rule = classifyCoachRule(ranked.rule);
		if (rule === unclassified) return {};
		claimCue.run(rule, now);
		const sample = rollingSample.get(since, at)?.count ?? 0;
		return { cue: `${coachRuleLabel(rule)} in ${ranked.count} of ${sample} checked English prompts in the past 7 days. See /english-coach.` };
	});

	const samplesQuery = db.query<{ prompts: number } & WeekCounts, [number, number, number]>(`
		SELECT COUNT(*) AS prompts,
		       COUNT(*) FILTER (WHERE at >= ?1 AND at < ?2) AS latest,
		       COUNT(*) FILTER (WHERE at >= ?3 AND at < ?1) AS previous
		  FROM checks
	`);
	const rankQuery = db.query<{ rule: string; occurrences: number; affectedPrompts: number } & WeekCounts, [number, number, number]>(`
		SELECT f.rule, COUNT(*) AS occurrences, COUNT(DISTINCT f.check_id) AS affectedPrompts,
		       COUNT(DISTINCT f.check_id) FILTER (WHERE c.at >= ?1 AND c.at < ?2) AS latest,
		       COUNT(DISTINCT f.check_id) FILTER (WHERE c.at >= ?3 AND c.at < ?1) AS previous
		  FROM fixes f JOIN checks c ON c.id = f.check_id WHERE f.rejected = 0
		 GROUP BY f.rule ORDER BY affectedPrompts DESC, occurrences DESC, f.rule
	`);
	const affectedQuery = db.query<WeekCounts, [number, number, number]>(`
		SELECT COUNT(*) FILTER (WHERE at >= ?1) AS latest,
		       COUNT(*) FILTER (WHERE at < ?1) AS previous
		  FROM checks c WHERE at >= ?3 AND at < ?2
		   AND EXISTS (SELECT 1 FROM fixes f WHERE f.check_id = c.id AND f.rejected = 0)
	`);

	const snapshot = db.transaction((at: number): CoachSnapshot => {
		const { generation, pinned_rule } = readMemory();
		const { latest, end, previous } = completeWeeks(at);
		const samples = samplesQuery.get(latest, end, previous);
		const affected = affectedQuery.get(latest, end, previous);
		if (!samples || !affected) throw new Error("Coach memory counts are unavailable");
		const rules: CoachRuleStats[] = [];
		let mostFrequent: CoachRuleId | undefined;
		let highestWeekCount = 0;
		let focus: CoachFocus | undefined;
		const pinned = classifyCoachRule(pinned_rule ?? undefined);
		if (pinned !== unclassified) focus = { rule: pinned, reason: "You pinned this rule.", pinned: true };
		for (const row of rankQuery.all(latest, end, previous)) {
			const rule = classifyCoachRule(row.rule);
			rules.push({ rule, affectedPrompts: row.affectedPrompts, occurrences: row.occurrences, ...periods(row, samples) });
			if (rule === unclassified) continue;
			focus ??= { rule, reason: `Most frequent classified rule: ${row.affectedPrompts} of ${samples.prompts} checked English prompts.`, pinned: false };
			if (row.latest > highestWeekCount || (row.latest === highestWeekCount && mostFrequent && rule < mostFrequent)) {
				mostFrequent = rule;
				highestWeekCount = row.latest;
			}
		}
		return { generation, prompts: samples.prompts, focus, rules, digest: { from: latest, until: end, mostFrequent, ...periods(affected, samples) } };
	});

	type FixRow = { id: number; at: number; original: string | null; replacement: string | null };
	const findExample = (comparison: "<" | ">", order: "ASC" | "DESC") => db.query<FixRow, [RecordedCoachRule, number]>(`
		SELECT f.id, c.at, f.original, f.replacement FROM fixes f JOIN checks c ON c.id = f.check_id
		 WHERE f.rule = ? AND f.id ${comparison} ? AND f.rejected = 0 ORDER BY f.id ${order} LIMIT 1
	`);
	const olderExample = findExample("<", "DESC");
	const newerExample = findExample(">", "ASC");
	const adjacentExamples = db.query<{ newer: 0 | 1; older: 0 | 1 }, [RecordedCoachRule, number]>(`
		SELECT EXISTS (SELECT 1 FROM fixes WHERE rule = ?1 AND id > ?2 AND rejected = 0) AS newer,
		       EXISTS (SELECT 1 FROM fixes WHERE rule = ?1 AND id < ?2 AND rejected = 0) AS older
	`);
	const practiceState = db.query<{ attempts: number; streak: number; due_at: number }, [CoachRuleId]>(
		"SELECT attempts, streak, due_at FROM practice WHERE rule = ?",
	);
	const savePractice = db.query<unknown, [CoachRuleId, number, number, number]>(`
		INSERT INTO practice (rule, attempts, streak, due_at) VALUES (?, ?, ?, ?)
		ON CONFLICT(rule) DO UPDATE SET attempts = excluded.attempts, streak = excluded.streak, due_at = excluded.due_at
	`);
	function exerciseFor(rule: CoachRuleId, attempts: number) {
		const exercises = coachRule(rule).exercises;
		return exercises[attempts % exercises.length];
	}

	const ruleDetail = db.transaction((rule: RecordedCoachRule, cursor?: ExampleCursor): CoachRuleDetail => {
		const { generation, pinned_rule } = readMemory();
		const row = cursor && "after" in cursor
			? newerExample.get(rule, cursor.after)
			: olderExample.get(rule, cursor?.before ?? Number.MAX_SAFE_INTEGER);
		const adjacent = row && adjacentExamples.get(rule, row.id);
		let practice: CoachPracticeTask | undefined;
		if (rule !== unclassified) {
			const state = practiceState.get(rule);
			const attempts = state?.attempts ?? 0;
			const { prompt, choices } = exerciseFor(rule, attempts);
			practice = { rule, generation, attempts, dueAt: state?.due_at ?? 0, prompt, choices };
		}
		return {
			generation,
			example: row ? {
				id: row.id, at: row.at,
				words: row.original !== null && row.replacement !== null ? { before: row.original, after: row.replacement } : undefined,
			} : undefined,
			canGoOlder: adjacent?.older === 1,
			canGoNewer: adjacent?.newer === 1,
			pinned: pinned_rule === rule,
			practice,
		};
	});

	const rejectFix = db.query<unknown, [number]>("UPDATE fixes SET rejected = 1 WHERE id = ? AND rejected = 0");
	const pin = db.query<unknown, [CoachRuleId | null]>("UPDATE memory SET pinned_rule = ? WHERE singleton = 1");
	const update = db.transaction((generation: string, action: () => boolean): boolean => {
		return readMemory().generation === generation && action();
	});
	const answerPractice = db.transaction((task: CoachPracticeTask, choice: 0 | 1): CoachPracticeResult | undefined => {
		if (task.generation !== readMemory().generation) return undefined;
		const state = practiceState.get(task.rule);
		const now = clock();
		const attempts = state?.attempts ?? 0;
		if (task.attempts !== attempts || (state && now < state.due_at)) return undefined;
		const exercise = exerciseFor(task.rule, attempts);
		const correct = choice === exercise.answer;
		const streak = correct ? Math.min((state?.streak ?? 0) + 1, 4) : 0;
		const dueAt = now + (correct ? 2 ** (streak + 1) : 1) * day;
		savePractice.run(task.rule, attempts + 1, streak, dueAt);
		return { correct, answer: exercise.choices[exercise.answer], explanation: exercise.explanation, dueAt };
	});

	return {
		beginCheck: () => readMemory().generation,
		recordCheck: check => recordCheck.immediate(check),
		snapshot: (at = clock()) => snapshot(at),
		ruleDetail: (rule, cursor) => ruleDetail(rule, cursor),
		markNotMistake: (id, generation) => update.immediate(generation, () => rejectFix.run(id).changes !== 0),
		setPinnedFocus: (rule, generation) => update.immediate(generation, () => pin.run(rule ?? null).changes !== 0),
		answerPractice: (task, choice) => answerPractice.immediate(task, choice),
		reset: generation => update.immediate(generation, () => {
			db.run("DELETE FROM checks");
			db.run("DELETE FROM cues");
			db.run("DELETE FROM practice");
			db.run("UPDATE memory SET generation = ?, pinned_rule = NULL WHERE singleton = 1", [randomUUID()]);
			return true;
		}),
		close: () => db.close(),
	};
}
