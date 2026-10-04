/* oxlint-disable no-console -- This operational command reports a concise run summary. */
import { parseArgs } from 'node:util';

import { checkIfIsoDateIsValid } from '#lib/utils/validation.ts';
import {
	createAnalysisRunner,
	createAnalysisSnapshotStorage,
} from '#modules/analysis-run/index.ts';

import { resolveBarHistoryStorageConfiguration } from './bar-history-storage-configuration.ts';

import type { AnalysisSnapshot, AnalysisSnapshotStorage } from '#modules/analysis-run/index.ts';

const PROVIDER_REQUEST_TIMEOUT_MS = 20_000;

type AnalysisRunInvocation = Readonly<{
	requestedThroughSession: string;
	snapshotStorage: AnalysisSnapshotStorage;
}>;

/**
 * Resolves `--through-session YYYY-MM-DD` and where the snapshot goes: the bucket by default, or
 * a local file with `--output <path>` as a dry run that needs no storage credentials.
 */
export function resolveAnalysisRunInvocation(
	args: readonly string[],
	environment: Readonly<Record<string, string | undefined>>,
): AnalysisRunInvocation {
	const { values } = parseArgs({
		args: [...args],
		options: {
			'through-session': { type: 'string' },
			output: { type: 'string' },
		},
		strict: true,
	});
	const requestedThroughSession = values['through-session'];
	const outputPath = values.output;

	if (!requestedThroughSession || !checkIfIsoDateIsValid(requestedThroughSession)) {
		throw new Error('--through-session must be a real YYYY-MM-DD date.');
	}

	if (outputPath !== undefined && !outputPath.trim()) {
		throw new Error('--output must be a file path.');
	}

	if (outputPath !== undefined) {
		return { requestedThroughSession, snapshotStorage: createLocalFileStorage(outputPath) };
	}

	const configuration = resolveBarHistoryStorageConfiguration(environment);
	return {
		requestedThroughSession,
		snapshotStorage: createAnalysisSnapshotStorage(configuration),
	};
}

function createLocalFileStorage(outputPath: string): AnalysisSnapshotStorage {
	return {
		write: async (snapshot) => {
			try {
				await Bun.write(outputPath, JSON.stringify(snapshot, null, '\t'));
				return { ok: true, locations: [outputPath] };
			} catch {
				return {
					ok: false,
					message: `The snapshot could not be written to ${outputPath}.`,
				};
			}
		},
	};
}

async function startAnalysisRun(): Promise<void> {
	const invocation = resolveAnalysisRunInvocation(Bun.argv.slice(2), Bun.env);
	const runner = createAnalysisRunner(invocation.snapshotStorage, {
		fetchFromProvider: fetchOpenBymadataWithTimeout,
	});
	const result = await runner.run({
		requestedThroughSession: invocation.requestedThroughSession,
	});

	if (!result.ok) {
		throw new Error(`${result.reason}: ${result.message}`);
	}

	printSummary(result.snapshot, result.locations);
}

async function fetchOpenBymadataWithTimeout(
	input: string | URL | Request,
	init?: RequestInit,
): Promise<Response> {
	return fetch(input, {
		...init,
		signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
	});
}

function printSummary(snapshot: AnalysisSnapshot, locations: readonly string[]): void {
	console.log(
		`Analysis Run through ${snapshot.requestedThroughSession} at ${snapshot.ranAt}, configuration v${snapshot.analysisConfigurationVersion}.`,
	);
	console.log(`Latest MEP Rate session: ${snapshot.mepRateSource.latestRateSessionDate}.`);

	for (const line of snapshot.analyzedLines) {
		if (line.status === 'unavailable') {
			console.log(`${line.tradingLineId}: unavailable (${line.reason}): ${line.message}`);
			continue;
		}

		const { latestState, window } = line;
		console.log(
			`${line.tradingLineId}: ${window.barCount} bars ${window.firstSessionDate} to ${window.lastSessionDate}, ${line.events.length} events; latest ${latestState.sessionDate} regime=${latestState.regime} structure=${latestState.structure} rsi=${latestState.rsi} emaDistanceAtr=${latestState.priceRelativeToEmaInAtr}.`,
		);
	}

	console.log(`Written to ${locations.join(', ')}.`);
}

if (import.meta.main) {
	try {
		await startAnalysisRun();
	} catch (error) {
		console.error(
			`Analysis Run failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exitCode = 1;
	}
}
