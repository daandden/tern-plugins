export async function seedOmp(run: string, config: string): Promise<void> {
	await Bun.write(`${run}/data/agent/config.yml`, `setupVersion: 3\n${config}`);
}

if (import.meta.main) {
	const run = process.argv[2];
	if (!run) throw new Error("Usage: bun seed-omp.ts RUN < config.yml");
	await seedOmp(run, await Bun.stdin.text());
}
