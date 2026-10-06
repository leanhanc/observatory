import { parseArgs } from 'node:util';

import { checkIfIsoDateIsValid } from '#lib/utils/validation.ts';
import {
	createAnalysisRunner,
	createAnalysisSnapshotStorage,
	resolvePreviousMarketDate,
} from '#modules/analysis-run/index.ts';
import { createLogger } from '#modules/logger/index.ts';

import { resolveBarHistoryStorageConfiguration } from './bar-history-storage-configuration.ts';

import type {
	AnalysisRunProgress,
	AnalysisRunnerOptions,
	AnalysisSnapshot,
	AnalysisSnapshotStorage,
} from '#modules/analysis-run/index.ts';

const PROVIDER_REQUEST_TIMEOUT_MS = 20_000;

type AnalysisRunInvocation = Readonly<{
	requestedThroughSession: string;
	snapshotStorage: AnalysisSnapshotStorage;
}>;

/** The logger methods the command uses; pino's logger satisfies it. */
export type AnalysisRunLog = Readonly<{
	info(fields: object, message: string): void;
	warn(fields: object, message: string): void;
	error(fields: object, message: string): void;
}>;

export type AnalysisRunCommand = Readonly<{
	args: readonly string[];
	environment: Readonly<Record<string, string | undefined>>;
	log: AnalysisRunLog;
	getCurrentInstant: () => string;
	/** Provider, pacing and Catalog overrides; the defaults fetch Open BYMADATA. */
	runnerOptions?: Omit<AnalysisRunnerOptions, 'getCurrentInstant' | 'reportProgress'>;
}>;

/**
 * Resolves the Requested-Through Session and where the snapshot goes.
 *
 * The session is `--through-session YYYY-MM-DD`, or by default the date before `currentInstant`'s
 * date in Buenos Aires, so a scheduled morning run analyzes the previous day. The snapshot goes to
 * the bucket, or to a local file with `--output <path>` as a dry run that needs no storage
 * credentials.
 */
export function resolveAnalysisRunInvocation(
	args: readonly string[],
	environment: Readonly<Record<string, string | undefined>>,
	currentInstant: string,
): AnalysisRunInvocation {
	const { values } = parseArgs({
		args: [...args],
		options: {
			'through-session': { type: 'string' },
			output: { type: 'string' },
		},
		strict: true,
	});
	const requestedThroughSession =
		values['through-session'] ?? resolvePreviousMarketDate(currentInstant);
	const outputPath = values.output;

	if (!checkIfIsoDateIsValid(requestedThroughSession)) {
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

/**
 * Runs the Analysis Run and logs its progress: the start, the MEP rate source, each analyzed line
 * as soon as it is analyzed, and the outcome. Every failure, including an invalid invocation, is
 * logged as one error entry starting with `Analysis Run failed:`.
 *
 * Logs carry dates, Trading Line IDs, outcomes and snapshot keys only, never the storage
 * configuration.
 *
 * @returns whether a snapshot was written.
 */
export async function runAnalysisCommand(command: AnalysisRunCommand): Promise<boolean> {
	const { args, environment, log, getCurrentInstant, runnerOptions } = command;
	const startedAt = performance.now();
	const measureDurationSeconds = () => Math.round((performance.now() - startedAt) / 1_000);

	try {
		const invocation = resolveAnalysisRunInvocation(args, environment, getCurrentInstant());
		const runner = createAnalysisRunner(invocation.snapshotStorage, {
			fetchFromProvider: fetchOpenBymadataWithTimeout,
			...runnerOptions,
			getCurrentInstant,
			reportProgress: (progress) => logProgress(log, progress),
		});
		const result = await runner.run({
			requestedThroughSession: invocation.requestedThroughSession,
		});
		const durationSeconds = measureDurationSeconds();

		if (!result.ok) {
			log.error(
				{ event: 'run-failed', reason: result.reason, durationSeconds },
				`Analysis Run failed: ${result.reason}: ${result.message}`,
			);
			return false;
		}

		logCompletion(log, result.snapshot, result.locations, durationSeconds);
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log.error(
			{ event: 'run-failed', durationSeconds: measureDurationSeconds() },
			`Analysis Run failed: ${message}`,
		);
		return false;
	}
}

function logProgress(log: AnalysisRunLog, progress: AnalysisRunProgress): void {
	if (progress.type === 'run-started') {
		const { requestedThroughSession, analyzedLineCount, analysisConfigurationVersion } =
			progress;
		log.info(
			{
				event: progress.type,
				requestedThroughSession,
				analyzedLineCount,
				analysisConfigurationVersion,
			},
			`Analysis Run through ${requestedThroughSession}: ${analyzedLineCount} lines, configuration v${analysisConfigurationVersion}.`,
		);
		return;
	}

	if (progress.type === 'mep-rate-source-fetched') {
		const { latestRateSessionDate } = progress;
		log.info(
			{ event: progress.type, latestRateSessionDate },
			`MEP rate source fetched; latest rate session ${latestRateSessionDate}.`,
		);
		return;
	}

	logAnalyzedLine(log, progress);
}

/**
 * A line the liquidity gate excluded is an expected outcome and logs at info; the other unavailable
 * reasons are data problems and log as warnings.
 */
function logAnalyzedLine(
	log: AnalysisRunLog,
	progress: Extract<AnalysisRunProgress, { type: 'line-analyzed' }>,
): void {
	const { line, position: linePosition, analyzedLineCount } = progress;
	const { tradingLineId, status } = line;
	const position = `[${linePosition}/${analyzedLineCount}]`;
	const fields = {
		event: progress.type,
		position: linePosition,
		analyzedLineCount,
		tradingLineId,
		status,
	};

	if (line.status === 'available') {
		const lastSessionDate = line.window.lastSessionDate;
		const eventCount = line.events.length;
		log.info(
			{ ...fields, lastSessionDate, eventCount },
			`${position} ${tradingLineId}: available (last session ${lastSessionDate}, ${eventCount} events)`,
		);
		return;
	}

	if (line.reason === 'insufficient-liquidity') {
		const { participation, medianDailyTradedValueUsd } = line.liquidity;
		const median = formatUsdThousands(medianDailyTradedValueUsd);
		log.info(
			{ ...fields, reason: line.reason, participation, medianDailyTradedValueUsd },
			`${position} ${tradingLineId}: unavailable: ${line.reason} (participation ${participation.toFixed(2)}, median ${median})`,
		);
		return;
	}

	log.warn(
		{ ...fields, reason: line.reason },
		`${position} ${tradingLineId}: unavailable: ${line.reason} (${line.message})`,
	);
}

function formatUsdThousands(value: number | null): string {
	if (value === null) {
		return 'none traded';
	}

	return `USD ${Math.round(value / 1_000)}k`;
}

function logCompletion(
	log: AnalysisRunLog,
	snapshot: AnalysisSnapshot,
	locations: readonly string[],
	durationSeconds: number,
): void {
	const availableLineCount = snapshot.analyzedLines.filter(
		(line) => line.status === 'available',
	).length;
	const unavailableLineCount = snapshot.analyzedLines.length - availableLineCount;

	log.info(
		{
			event: 'run-completed',
			requestedThroughSession: snapshot.requestedThroughSession,
			ranAt: snapshot.ranAt,
			analysisConfigurationVersion: snapshot.analysisConfigurationVersion,
			availableLineCount,
			unavailableLineCount,
			locations,
			durationSeconds,
		},
		`Analysis Run through ${snapshot.requestedThroughSession} completed in ${durationSeconds} s: ${availableLineCount} available, ${unavailableLineCount} unavailable; written to ${locations.join(', ')}.`,
	);
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

if (import.meta.main) {
	const isSnapshotWritten = await runAnalysisCommand({
		args: Bun.argv.slice(2),
		environment: Bun.env,
		log: createLogger({ name: 'ANALYSIS-RUN' }),
		getCurrentInstant: () => Temporal.Now.instant().toString(),
	});
	process.exitCode = isSnapshotWritten ? 0 : 1;
}
