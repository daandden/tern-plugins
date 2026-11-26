import { coachProtectedText, type PreparedCoachPrompt } from "./english-coach-prompt";

/**
 * One run of a correction line: kept text, removed or added words,
 * punctuation that replaced other punctuation, or protected text. The parts
 * of one change (and the space between a removal and its replacement) share
 * `change`, and carry the indices of the reported mistakes that explain it.
 */
export interface CoachSegment {
	kind: "same" | "del" | "ins" | "punct" | "protected";
	text: string;
	change?: number;
	mistakes?: number[];
}

export interface CoachMistake {
	original: string;
	corrected: string;
	pattern: string;
}

export interface GroundedCoachFix {
	mistake: number;
	example?: { before: string; after: string };
}

export interface CoachCorrection {
	/** The prompt as the user wrote it, changed words marked in place, split at line breaks. */
	lines: CoachSegment[][];
	/** Each reported mistake, in reply order, with placeholders shown as their protected text. */
	mistakes: CoachMistake[];
	fixes: GroundedCoachFix[];
}

/** Product of the two token counts above which the changed middle shows as one removal and one addition. */
const MAX_DIFF_CELLS = 4_000_000;
const TOKEN = /[\p{L}\p{N}_'’]+|\s+|[^\s\p{L}\p{N}_'’]/gu;
const PLACEHOLDER = /^\[\[COACH_+\d+\]\]$/;
/** Splits a text into prose and the placeholders between it (odd indices). */
const SPLIT = /(\[\[COACH_+\d+\]\])/;
const WORD = /[\p{L}\p{N}]/u;

function tokens(text: string): string[] {
	return text.match(TOKEN) ?? [];
}

/**
 * Whitespace of any kind matches: the rewrite is one line, the prompt may not
 * be. Case never counts: the coach does not correct capitalization, so a
 * word that differs only in case is kept as the user wrote it.
 */
function same(a: string, b: string): boolean {
	return a === b || a.toLowerCase() === b.toLowerCase() || (/^\s+$/.test(a) && /^\s+$/.test(b));
}

type Op = { kind: "same"; a: string; b: string } | { kind: "del"; a: string } | { kind: "ins"; b: string };

/** Token edit script from `a` to `b`: common ends trimmed, then a longest common subsequence. */
function diff(a: string[], b: string[]): Op[] {
	let start = 0;
	while (start < a.length && start < b.length && same(a[start]!, b[start]!)) start++;
	let endA = a.length;
	let endB = b.length;
	while (endA > start && endB > start && same(a[endA - 1]!, b[endB - 1]!)) {
		endA--;
		endB--;
	}
	const head: Op[] = a.slice(0, start).map((token, index) => ({ kind: "same", a: token, b: b[index]! }));
	const tail: Op[] = a.slice(endA).map((token, index) => ({ kind: "same", a: token, b: b[endB + index]! }));
	const midA = a.slice(start, endA);
	const midB = b.slice(start, endB);
	const n = midA.length;
	const m = midB.length;
	if (n * m > MAX_DIFF_CELLS) {
		return [...head, ...midA.map(token => ({ kind: "del", a: token }) as Op), ...midB.map(token => ({ kind: "ins", b: token }) as Op), ...tail];
	}
	// lengths[i * (m + 1) + j]: the LCS length of midA[i..] and midB[j..].
	const lengths = new Uint32Array((n + 1) * (m + 1));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lengths[i * (m + 1) + j] = same(midA[i]!, midB[j]!)
				? lengths[(i + 1) * (m + 1) + j + 1]! + 1
				: Math.max(lengths[(i + 1) * (m + 1) + j]!, lengths[i * (m + 1) + j + 1]!);
		}
	}
	const middle: Op[] = [];
	let i = 0;
	let j = 0;
	while (i < n || j < m) {
		if (i < n && j < m && same(midA[i]!, midB[j]!)) middle.push({ kind: "same", a: midA[i++]!, b: midB[j++]! });
		else if (j < m && (i === n || lengths[i * (m + 1) + j + 1]! >= lengths[(i + 1) * (m + 1) + j]!)) middle.push({ kind: "ins", b: midB[j++]! });
		else middle.push({ kind: "del", a: midA[i++]! });
	}
	return [...head, ...middle, ...tail];
}

type Range = { start: number; end: number };

type Change = { id: number; before: Range; after: Range; mistakes: number[] };

function quotedRanges(text: string, quote: string): Range[] {
	const parts = quote.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return [];
	const literal = parts.map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
	const word = "[\\p{L}\\p{N}_'’]";
	const start = /^[\p{L}\p{N}_'’]/u.test(parts[0]!) ? `(?<!${word})` : "";
	const end = /[\p{L}\p{N}_'’]$/u.test(parts.at(-1)!) ? `(?!${word})` : "";
	// The lookahead also finds overlapping occurrences.
	return Array.from(text.matchAll(new RegExp(`(?=(${start}${literal}${end}))`, "giu")), match => ({
		start: match.index!,
		end: match.index! + match[1]!.length,
	}));
}

function editRange(offset: number, text: string): Range {
	const start = offset + text.length - text.trimStart().length;
	const end = offset + text.trimEnd().length;
	return end <= start ? { start: offset, end: offset } : { start, end };
}

function overlaps(a: Range, b: Range): boolean {
	return a.start < b.end && b.start < a.end;
}

function quoteAt(ranges: readonly Range[], edit: Range): Range | false | undefined {
	let found: Range | undefined;
	for (const range of ranges) {
		if (range.start > edit.end) break;
		const touches = edit.start === edit.end
			? range.start <= edit.start && edit.start <= range.end
			: overlaps(range, edit);
		if (!touches) continue;
		if (found) return false;
		found = range;
	}
	return found;
}

function groundFixes(
	before: string,
	after: string,
	mistakes: readonly CoachMistake[],
	changes: readonly Change[],
): GroundedCoachFix[] {
	const protectedBefore = [...coachProtectedText(before)];
	const protectedAfter = [...coachProtectedText(after)];
	const fullBefore = before.trim();
	const fullAfter = after.trim();
	const fixes: GroundedCoachFix[] = [];
	const seen = new Set<string>();
	for (const [mistake, { original, corrected }] of mistakes.entries()) {
		const originals = quotedRanges(before, original);
		const corrections = quotedRanges(after, corrected);
		let pair: { before: Range; after: Range } | undefined;
		const related: Change[] = [];
		for (const change of changes) {
			const left = quoteAt(originals, change.before);
			if (left === undefined) continue;
			const right = quoteAt(corrections, change.after);
			if (right === undefined) continue;
			if (!left || !right || (pair && (pair.before !== left || pair.after !== right))) {
				pair = undefined;
				break;
			}
			pair ??= { before: left, after: right };
			related.push(change);
		}
		// A quote must identify one pair of spans, even if it explains more than one change.
		if (!pair) continue;
		const { before: a, after: b } = pair;
		for (const change of related) change.mistakes.push(mistake);
		const key = `${a.start}:${a.end}:${b.start}:${b.end}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const exampleBefore = before.slice(a.start, a.end);
		const exampleAfter = after.slice(b.start, b.end);
		const canKeep = exampleBefore !== fullBefore && exampleAfter !== fullAfter &&
			!protectedBefore.some(range => overlaps(a, range)) && !protectedAfter.some(range => overlaps(b, range)) &&
			shortExample(exampleBefore, exampleAfter);
		fixes.push({ mistake, example: canKeep ? { before: exampleBefore, after: exampleAfter } : undefined });
	}
	return fixes;
}

function shortExample(before: string, after: string): boolean {
	const a = before.match(/[\p{L}\p{N}_'’]+/gu) ?? [];
	const b = after.match(/[\p{L}\p{N}_'’]+/gu) ?? [];
	let head = 0;
	while (head < a.length && head < b.length && same(a[head]!, b[head]!)) head++;
	let tail = 0;
	while (
		tail < a.length - head && tail < b.length - head &&
		same(a[a.length - tail - 1]!, b[b.length - tail - 1]!)
	) tail++;
	return head <= 1 && tail <= 1 && before.length <= 160 && after.length <= 160;
}

/**
 * The correction as the prompt the user wrote with the rewrite's changes
 * marked word by word, plus the reported mistakes with placeholders shown as
 * their protected text. The prose between placeholders is diffed piece by
 * piece, so each placeholder shows its protected text once; line breaks come
 * from the prompt. Throws unless both texts hold the same placeholders in the
 * same order.
 */
export function coachCorrection(prompt: PreparedCoachPrompt, rewrite: string, mistakes: readonly CoachMistake[]): CoachCorrection {
	const shown = new Map(prompt.placeholders.map(item => [item.token, item.display.trim()]));
	const display = (text: string) => text.replace(/\[\[COACH_+\d+\]\]/g, token => shown.get(token) ?? token);
	const before = prompt.text.split(SPLIT);
	const after = rewrite.split(SPLIT);
	if (before.length !== after.length || before.some((part, index) => index % 2 === 1 && part !== after[index])) {
		throw new Error("unreadable reply");
	}
	const ops = before.flatMap((part, index): Op[] =>
		index % 2 === 1 ? [{ kind: "same", a: part, b: part }] : diff(tokens(part), tokens(after[index]!)));
	const segments: CoachSegment[] = [];
	const push = (kind: CoachSegment["kind"], text: string, change?: Change) => {
		if (!text) return;
		const last = segments.at(-1);
		if (last?.kind === kind && last.change === change?.id) last.text += text;
		else segments.push(change === undefined ? { kind, text } : { kind, text, change: change.id, mistakes: change.mistakes });
	};
	const changes: Change[] = [];
	let at = 0;
	let rewrittenAt = 0;
	for (let index = 0; index < ops.length;) {
		const op = ops[index]!;
		if (op.kind === "same") {
			if (PLACEHOLDER.test(op.a)) push("protected", shown.get(op.a) ?? op.a);
			else push("same", op.a);
			at += op.a.length;
			rewrittenAt += op.b.length;
			index++;
			continue;
		}
		// One changed run: word changes joined across the whitespace between them; a punctuation change stands alone.
		let removed = "";
		let added = "";
		let end = index;
		for (; end < ops.length; end++) {
			const next = ops[end]!;
			if (next.kind === "del") removed += next.a;
			else if (next.kind === "ins") added += next.b;
			else if (/^\s+$/.test(next.a) && ops[end + 1] !== undefined && ops[end + 1]!.kind !== "same" && WORD.test(removed + added)) {
				removed += next.a;
				added += next.b;
			} else break;
		}
		index = end;
		const originalRange = editRange(at, removed);
		const correctedRange = editRange(rewrittenAt, added);
		at += removed.length;
		rewrittenAt += added.length;
		const del = removed.trim();
		const ins = added.trim();
		if (!del && !ins) {
			push("same", removed || added);
			continue;
		}
		const outer = del ? removed : added;
		push("same", outer.match(/^\s*/)![0]);
		const change: Change = { id: changes.length, before: originalRange, after: correctedRange, mistakes: [] };
		changes.push(change);
		if (del && ins && !WORD.test(del + ins)) {
			// Punctuation swapped for punctuation reads best as the new mark alone.
			push("punct", ins, change);
		} else {
			push("del", del, change);
			// A space keeps replaced words apart.
			if (del && ins) push("same", " ", change);
			push("ins", ins, change);
		}
		push("same", outer.match(/\s*$/)![0]);
	}
	const fixes = groundFixes(prompt.text, rewrite, mistakes, changes);
	const lines: CoachSegment[][] = [[]];
	for (const segment of segments) {
		segment.text.split(/\r?\n/).forEach((part, index) => {
			if (index > 0) lines.push([]);
			if (part) lines.at(-1)!.push({ ...segment, text: part });
		});
	}
	return {
		lines: lines.filter(line => line.some(part => part.text.trim())),
		fixes,
		mistakes: mistakes.map(mistake => ({
			original: display(mistake.original),
			corrected: display(mistake.corrected),
			pattern: display(mistake.pattern),
		})),
	};
}
