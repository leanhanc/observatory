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
	AnalyzedLine,
} from '#modules/analysis-run/index.ts';

const PROVIDER_REQUEST_TIMEOUT_MS = 20_000;
// Railway skips a cron run while the previous one is still running, so a hung request (the
// snapshot write has no timeout) must not outlive the next schedule. A full run takes minutes.
const RUN_DEADLINE_MS = 30 * 60_000;

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
	/** How long the run may take before it is logged as failed; 30 minutes by default. */
	deadlineMs?: number;
}>;

/**
 * `deadline-exceeded` leaves the run's pending work behind, which can keep the process alive, so
 * the caller must exit explicitly.
 */
export type AnalysisRunCommandOutcome = 'snapshot-written' | 'failed' | 'deadline-exceeded';

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
 * as soon as it is analyzed, and the outcome. Every failure, including an invalid invocation and a
 * run that misses its deadline, is logged as one error entry starting with `Analysis Run failed:`.
 *
 * Logs carry dates, Trading Line IDs, outcomes and snapshot keys only, never the storage
 * configuration.
 */
export async function runAnalysisCommand(
	command: AnalysisRunCommand,
): Promise<AnalysisRunCommandOutcome> {
	const { log, deadlineMs = RUN_DEADLINE_MS } = command;
	const startedAt = performance.now();
	const measureDurationSeconds = () => Math.round((performance.now() - startedAt) / 1_000);
	const deadline = startDeadline(deadlineMs);

	try {
		return await Promise.race([
			runAndLogAnalysis(command, measureDurationSeconds),
			deadline.expiry.then(() => {
				log.error(
					{
						event: 'run-failed',
						reason: 'deadline-exceeded',
						durationSeconds: measureDurationSeconds(),
					},
					`Analysis Run failed: deadline-exceeded: the run did not finish within ${deadlineMs} ms.`,
				);
				return 'deadline-exceeded' as const;
			}),
		]);
	} finally {
		deadline.clear();
	}
}

async function runAndLogAnalysis(
	command: AnalysisRunCommand,
	measureDurationSeconds: () => number,
): Promise<Exclude<AnalysisRunCommandOutcome, 'deadline-exceeded'>> {
	const { args, environment, log, getCurrentInstant, runnerOptions } = command;

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
			return 'failed';
		}

		logCompletion(log, result.snapshot, result.locations, durationSeconds);
		return 'snapshot-written';
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log.error(
			{ event: 'run-failed', durationSeconds: measureDurationSeconds() },
			`Analysis Run failed: ${message}`,
		);
		return 'failed';
	}
}

function startDeadline(milliseconds: number): Readonly<{ expiry: Promise<void>; clear(): void }> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const expiry = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, milliseconds);
	});

	return { expiry, clear: () => clearTimeout(timer) };
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
		const { requestedThroughSession, latestRateSessionDate } = progress;
		const fields = { event: progress.type, requestedThroughSession, latestRateSessionDate };
		// A holiday and a provider that has not published the session yet look the same here.
		const hasRateForRequestedSession = latestRateSessionDate === requestedThroughSession;

		if (!hasRateForRequestedSession) {
			log.warn(
				fields,
				`No MEP Rate session on ${requestedThroughSession}; analyzing through ${latestRateSessionDate}.`,
			);
			return;
		}

		log.info(fields, `MEP rate source fetched; latest rate session ${latestRateSessionDate}.`);
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
	const { line, position, analyzedLineCount } = progress;
	const { tradingLineId, status } = line;
	const positionLabel = `[${position}/${analyzedLineCount}]`;
	const fields = {
		event: progress.type,
		position,
		analyzedLineCount,
		tradingLineId,
		status,
	};

	if (line.status === 'available') {
		logAvailableLine(log, line, fields, positionLabel);
		return;
	}

	if (line.reason === 'insufficient-liquidity') {
		const { participation, medianDailyTradedValueUsd } = line.liquidity;
		const median = formatUsdThousands(medianDailyTradedValueUsd);
		log.info(
			{ ...fields, reason: line.reason, participation, medianDailyTradedValueUsd },
			`${positionLabel} ${tradingLineId}: unavailable: ${line.reason} (participation ${participation.toFixed(2)}, median ${median})`,
		);
		return;
	}

	log.warn(
		{ ...fields, reason: line.reason },
		`${positionLabel} ${tradingLineId}: unavailable: ${line.reason} (${line.message})`,
	);
}

/**
 * Dropped bars are a data problem, and a Corporate Action the provider already adjusted is a stale
 * list entry, so either makes the line log as a warning.
 */
function logAvailableLine(
	log: AnalysisRunLog,
	line: Extract<AnalyzedLine, { status: 'available' }>,
	fields: object,
	positionLabel: string,
): void {
	const { tradingLineId, window, events, largeMoves, droppedBarSessions } = line;
	const lastSessionDate = window.lastSessionDate;
	const eventCount = events.length;
	const largeMoveCount = largeMoves.length;
	const droppedBarCount = droppedBarSessions.length;
	const corporateActions = line.corporateActions.map(({ exDate, status }) => ({
		exDate,
		status,
	}));
	const corporateActionSummary = corporateActions
		.map(({ exDate, status }) => `; corporate action ${exDate}: ${status}`)
		.join('');
	const droppedBarSummary = droppedBarCount > 0 ? `; ${droppedBarCount} dropped bars` : '';
	const hasAlreadyAdjustedAction = corporateActions.some(
		({ status }) => status === 'already-adjusted',
	);
	const shouldWarn = hasAlreadyAdjustedAction || droppedBarCount > 0;
	const lineFields = {
		...fields,
		lastSessionDate,
		eventCount,
		largeMoveCount,
		corporateActions,
		droppedBarSessions,
	};
	const message = `${positionLabel} ${tradingLineId}: available (last session ${lastSessionDate}, ${eventCount} events, ${largeMoveCount} large moves${corporateActionSummary}${droppedBarSummary})`;

	if (shouldWarn) {
		log.warn(lineFields, message);
		return;
	}

	log.info(lineFields, message);
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
	const { latestRateSessionDate } = snapshot.mepRateSource;
	const availableLines = snapshot.analyzedLines.flatMap((line) =>
		line.status === 'available' ? [line] : [],
	);
	const availableLineCount = availableLines.length;
	const unavailableLineCount = snapshot.analyzedLines.length - availableLineCount;
	// Lines that did not trade on the latest market session; many at once suggests a provider lag.
	const lateLineCount = availableLines.filter(
		(line) => line.window.lastSessionDate < latestRateSessionDate,
	).length;

	log.info(
		{
			event: 'run-completed',
			requestedThroughSession: snapshot.requestedThroughSession,
			ranAt: snapshot.ranAt,
			analysisConfigurationVersion: snapshot.analysisConfigurationVersion,
			latestRateSessionDate,
			availableLineCount,
			lateLineCount,
			unavailableLineCount,
			locations,
			durationSeconds,
		},
		`Analysis Run through ${snapshot.requestedThroughSession} completed in ${durationSeconds} s: ${availableLineCount} available (${lateLineCount} ending before ${latestRateSessionDate}), ${unavailableLineCount} unavailable; written to ${locations.join(', ')}.`,
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
	const outcome = await runAnalysisCommand({
		args: Bun.argv.slice(2),
		environment: Bun.env,
		log: createLogger({ name: 'ANALYSIS-RUN' }),
		getCurrentInstant: () => Temporal.Now.instant().toString(),
	});

	if (outcome === 'deadline-exceeded') {
		process.exit(1);
	}

	process.exitCode = outcome === 'snapshot-written' ? 0 : 1;
}
