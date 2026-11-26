interface CoachExercise {
	prompt: string;
	choices: readonly [string, string];
	answer: 0 | 1;
	explanation: string;
}

interface CoachRule {
	label: string;
	explanation: string;
	exercises: readonly [CoachExercise, ...CoachExercise[]];
}

const rules = {
	articles: {
		label: "Articles",
		explanation: "Use a or an with a singular count noun when you introduce one of many. Use the when the reader knows which one you mean. Use a before a consonant sound and an before a vowel sound.",
		exercises: [
			{
				prompt: 'Which fits the first mention? "I opened ___ issue this morning."',
				choices: ["a", "an"], answer: 1,
				explanation: '"Issue" starts with a vowel sound, so use an.',
			},
			{
				prompt: 'We already know which file. "Please reopen ___ file I just closed."',
				choices: ["the", "a"], answer: 0,
				explanation: '"I just closed" identifies the file, so use the.',
			},
		],
	},
	"subject-verb-agreement": {
		label: "Subject–verb agreement",
		explanation: "Match the verb to the subject, not to a nearby noun. In the present tense, a singular third-person subject usually takes a verb ending in -s.",
		exercises: [
			{
				prompt: '"The list of files ___ empty."', choices: ["are", "is"], answer: 1,
				explanation: 'The subject is the singular "list", not "files".',
			},
			{
				prompt: '"Both reports ___ the same error."', choices: ["show", "shows"], answer: 0,
				explanation: 'The subject is plural: "both reports".',
			},
		],
	},
	"verb-tense": {
		label: "Verb tense",
		explanation: "Use the simple past for a completed action at a finished time. Use the present perfect for a past action when the period continues or the present result matters, without naming a finished time.",
		exercises: [
			{
				prompt: '"The build ___ yesterday at noon."', choices: ["failed", "has failed"], answer: 0,
				explanation: '"Yesterday at noon" is a finished time, so use the simple past.',
			},
			{
				prompt: 'This is your first visit. "I ___ here before."', choices: ["never came yesterday", "have never been"], answer: 1,
				explanation: 'Your experience up to now calls for the present perfect.',
			},
		],
	},
	"verb-form": {
		label: "Verb form",
		explanation: "Use the base form after a modal like can or should. Use a past participle after have in a perfect tense. Some verbs and prepositions require an -ing form.",
		exercises: [
			{
				prompt: '"We should ___ the timeout."', choices: ["raise", "raised"], answer: 0,
				explanation: 'A modal like "should" takes the base form of the next verb.',
			},
			{
				prompt: '"I have ___ the notes already."', choices: ["wrote", "written"], answer: 1,
				explanation: 'After "have", use the past participle "written", not the simple past "wrote".',
			},
		],
	},
	"noun-number": {
		label: "Noun number",
		explanation: "Use the plural for more than one countable thing. Mass nouns like information and advice do not normally take a plural ending. To count them, add a unit such as a piece of.",
		exercises: [
			{
				prompt: '"I found two useful ___."', choices: ["examples", "example"], answer: 0,
				explanation: 'Two requires the plural of a count noun.',
			},
			{
				prompt: '"Where can I find more ___ about this setting?"', choices: ["informations", "information"], answer: 1,
				explanation: '"Information" is usually a mass noun. Add "pieces of" if you need to count it.',
			},
		],
	},
	prepositions: {
		label: "Prepositions",
		explanation: "Learn which preposition goes with a particular noun, verb, or adjective. For times, use at for a clock time, on for a day, and in for a month, year, or longer period.",
		exercises: [
			{
				prompt: '"The call starts ___ 9 a.m."', choices: ["on", "at"], answer: 1,
				explanation: 'Use at with a clock time.',
			},
			{
				prompt: '"The answer depends ___ the operating system."', choices: ["on", "of"], answer: 0,
				explanation: '"Depend on" is the standard pairing.',
			},
		],
	},
	"word-order": {
		label: "Word order",
		explanation: "A direct question often puts an auxiliary before the subject. A question embedded in a larger sentence keeps statement order. Put an adjective before the noun it modifies or after a linking verb.",
		exercises: [
			{
				prompt: '"Do you know ___?"', choices: ["where the file is", "where is the file"], answer: 0,
				explanation: 'An embedded question keeps the subject "the file" before "is".',
			},
			{
				prompt: 'Ask a direct question about the file.', choices: ["Where the file is?", "Where is the file?"], answer: 1,
				explanation: 'In this direct question, "is" comes before the subject.',
			},
		],
	},
	pronouns: {
		label: "Pronouns",
		explanation: "Use subject forms like I and we before a verb they govern. Use object forms like me and us after a verb or preposition. Make sure the reader knows what a pronoun refers to.",
		exercises: [
			{
				prompt: '"Please send the output to Sam and ___."', choices: ["I", "me"], answer: 1,
				explanation: 'After "to", use the object form "me". Try the sentence without "Sam and".',
			},
			{
				prompt: '"Sam and ___ finished the review."', choices: ["I", "me"], answer: 0,
				explanation: 'Here the pronoun is part of the subject, so use "I".',
			},
		],
	},
	"word-choice": {
		label: "Word choice and collocations",
		explanation: "Choose the word that expresses the intended meaning and pairs naturally with the surrounding words. Learn frequent combinations, such as make a change and run a test, together.",
		exercises: [
			{
				prompt: '"The patch will ___ startup time."', choices: ["effect", "affect"], answer: 1,
				explanation: 'As a verb, "affect" means influence. "Effect" as a verb means bring about.',
			},
			{
				prompt: '"Can you ___ a quick test before merging?"', choices: ["run", "make"], answer: 0,
				explanation: 'To execute a test, say "run a test". Writing a new test would be a different action.',
			},
		],
	},
	"sentence-structure": {
		label: "Sentence structure",
		explanation: "A dependent clause needs a main clause. When two clauses can stand alone, join them with a conjunction or separate them with a period or semicolon, not a comma alone.",
		exercises: [
			{
				prompt: 'Which is a complete sentence?',
				choices: ["Because the request timed out.", "The job stopped because the request timed out."], answer: 1,
				explanation: 'The clause starting with "because" explains why the job stopped. It cannot stand alone as a full sentence.',
			},
			{
				prompt: 'Which joins two complete clauses correctly?',
				choices: ["The tests passed, so I merged the change.", "The tests passed, I merged the change."], answer: 0,
				explanation: 'The conjunction "so" can join two complete clauses after a comma.',
			},
		],
	},
	punctuation: {
		label: "Punctuation",
		explanation: "Use punctuation to show how a sentence fits together. An apostrophe can mark a contraction or possession, but does not form an ordinary plural.",
		exercises: [
			{
				prompt: '"The server lost ___ connection."', choices: ["its", "it's"], answer: 0,
				explanation: '"Its" is possessive. "It\'s" means "it is" or "it has".',
			},
			{
				prompt: '"I opened three ___."', choices: ["ticket's", "tickets"], answer: 1,
				explanation: 'An ordinary plural does not need an apostrophe.',
			},
		],
	},
	spelling: {
		label: "Spelling",
		explanation: "Check the spelling of ordinary English words separately from names or code. Valid regional spellings, such as colour and color, do not need correction.",
		exercises: [
			{
				prompt: '"We received a ___ error."', choices: ["seperate", "separate"], answer: 1,
				explanation: 'The standard spelling is "separate", with an "a" in the middle.',
			},
			{
				prompt: '"Check the project ___."', choices: ["environment", "enviroment"], answer: 0,
				explanation: 'Spell "environment" with the "n" before "ment".',
			},
		],
	},
} satisfies Record<string, CoachRule>;

export type CoachRuleId = keyof typeof rules;
export const unclassified = "unclassified";
export type RecordedCoachRule = CoachRuleId | typeof unclassified;
export const coachRuleIds: readonly string[] = Object.keys(rules);

function isCoachRuleId(id: string): id is CoachRuleId {
	return Object.hasOwn(rules, id);
}

export function classifyCoachRule(value: string | undefined): RecordedCoachRule {
	const id = value?.trim().toLowerCase();
	return id && isCoachRuleId(id) ? id : unclassified;
}

export function coachRule(id: CoachRuleId): CoachRule {
	return rules[id];
}

export function coachRuleLabel(id: RecordedCoachRule): string {
	return id === unclassified ? "Unclassified" : coachRule(id).label;
}
