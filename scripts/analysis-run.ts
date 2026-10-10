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
import type {
	CorporateActionCandidate,
	CorporateActionWatch,
} from '#modules/corporate-action-watch/index.ts';
import type { CorporateActionStatus } from '#modules/corporate-actions/index.ts';

const PROVIDER_REQUEST_TIMEOUT_MS = 20_000;
// Railway skips a cron run while the previous one is still running, so a hung request (the
// snapshot write has no timeout) must not outlive the next schedule. A full run takes minutes.
const RUN_DEADLINE_MS = 30 * 60_000;
// No analyzed line is retried later than this before the deadline. The last retry, bounded by the
// request timeout, then ends well inside it: missing the deadline would discard the whole snapshot
// to save one line.
const RETRY_DEADLINE_MARGIN_MS = 5 * 60_000;

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
	runnerOptions?: Omit<
		AnalysisRunnerOptions,
		'getCurrentInstant' | 'reportProgress' | 'retryCutoffMs'
	>;
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
	const { deadlineMs = RUN_DEADLINE_MS } = command;

	try {
		const invocation = resolveAnalysisRunInvocation(args, environment, getCurrentInstant());
		const runner = createAnalysisRunner(invocation.snapshotStorage, {
			fetchFromProvider: fetchOpenBymadataWithTimeout,
			...runnerOptions,
			getCurrentInstant,
			reportProgress: (progress) => logProgress(log, progress),
			retryCutoffMs: Math.max(deadlineMs - RETRY_DEADLINE_MARGIN_MS, 0),
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

	if (progress.type === 'fetch-retry-started') {
		logFetchRetry(log, progress);
		return;
	}

	if (progress.type === 'fetch-retry-stopped') {
		const { tradingLineIds } = progress;
		const lineNoun = tradingLineIds.length === 1 ? 'line' : 'lines';
		log.warn(
			{ event: progress.type, tradingLineIds },
			`Retry cut-off reached; ${tradingLineIds.length} ${lineNoun} not retried: ${tradingLineIds.join(', ')}.`,
		);
		return;
	}

	if (progress.type === 'corporate-action-watch-checked') {
		logCorporateActionWatch(log, progress.watch);
		return;
	}

	logAnalyzedLine(log, progress);
}

/**
 * An unlisted notice needs a person to read it and decide whether the committed list needs an
 * entry, so a candidate with one is a warning; a candidate whose notices are all listed is already
 * handled.
 */
function logCorporateActionWatch(log: AnalysisRunLog, watch: CorporateActionWatch): void {
	const { publishedFrom, publishedThrough } = watch;
	const fields = { event: 'corporate-action-watch-checked', publishedFrom, publishedThrough };

	if (watch.status === 'unavailable') {
		log.warn(
			{ ...fields, status: watch.status, message: watch.message },
			`Corporate-action watch unavailable: ${watch.message}`,
		);
		return;
	}

	if (watch.candidates.length === 0) {
		log.info(
			{ ...fields, status: watch.status, candidateCount: 0 },
			`Corporate-action watch: no notices for analyzed lines published ${publishedFrom} to ${publishedThrough}.`,
		);
		return;
	}

	for (const candidate of watch.candidates) {
		logCorporateActionCandidate(log, fields, candidate);
	}
}

function logCorporateActionCandidate(
	log: AnalysisRunLog,
	fields: object,
	candidate: CorporateActionCandidate,
): void {
	const { tradingLineId, notices } = candidate;
	const unlistedNoticeCount = notices.filter((notice) => !notice.isListed).length;
	const noticeSummary = notices
		.map(({ publishedAt, title, pdfUrl, isListed }) => {
			const listing = isListed ? 'listed' : 'unlisted';
			return `${publishedAt.slice(0, 10)} (${listing}) ${title} <${pdfUrl}>`;
		})
		.join('; ');
	const candidateFields = { ...fields, tradingLineId, unlistedNoticeCount, notices };

	if (unlistedNoticeCount === 0) {
		log.info(
			candidateFields,
			`Listed corporate-action notices for ${tradingLineId}: ${noticeSummary}`,
		);
		return;
	}

	log.warn(
		candidateFields,
		`Unlisted corporate-action notices for ${tradingLineId}; read them before adding a list entry: ${noticeSummary}`,
	);
}

function logFetchRetry(
	log: AnalysisRunLog,
	progress: Extract<AnalysisRunProgress, { type: 'fetch-retry-started' }>,
): void {
	const { scope, retry, retryCount, coolDownMs, failures } = progress;
	const coolDownSeconds = coolDownMs / 1_000;
	const failureSummary = failures
		.map(({ tradingLineId, message }) => `${tradingLineId} (${message})`)
		.join('; ');
	const fields = {
		event: progress.type,
		scope,
		retry,
		retryCount,
		coolDownMs,
		lineCount: failures.length,
		failures,
	};

	if (scope === 'mep-rate-source') {
		log.info(
			fields,
			`Retrying the MEP rate source (retry ${retry} of ${retryCount}) in ${coolDownSeconds} s after transient fetch failures: ${failureSummary}.`,
		);
		return;
	}

	const lineNoun = failures.length === 1 ? 'line' : 'lines';
	log.info(
		fields,
		`Retrying ${failures.length} analyzed ${lineNoun} in ${coolDownSeconds} s after transient fetch failures: ${failureSummary}.`,
	);
}

/**
 * A line the liquidity gate excluded is an expected outcome and logs at info, unless dropped bars
 * lowered its participation; the other unavailable reasons are data problems and log as warnings.
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
		const { droppedBarSessions } = line;
		const median = formatUsdThousands(medianDailyTradedValueUsd);
		const droppedBarSummary = formatDroppedBarSummary(droppedBarSessions);
		const hasDroppedBars = droppedBarSessions.length > 0;
		const lineFields = {
			...fields,
			reason: line.reason,
			participation,
			medianDailyTradedValueUsd,
			droppedBarSessions,
		};
		const message = `${positionLabel} ${tradingLineId}: unavailable: ${line.reason} (participation ${participation.toFixed(2)}, median ${median}${droppedBarSummary})`;

		if (hasDroppedBars) {
			log.warn(lineFields, message);
			return;
		}

		log.info(lineFields, message);
		return;
	}

	log.warn(
		{ ...fields, reason: line.reason },
		`${positionLabel} ${tradingLineId}: unavailable: ${line.reason} (${line.message})`,
	);
}

/**
 * Dropped bars are a data problem; a Large One-Session Move may be an unlisted Corporate Action; and
 * a listed Corporate Action whose step was not observed is either an entry the provider no longer
 * needs or a step a real move hid. Each needs a person to look, so each makes the line a warning.
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
	const corporateActions = line.corporateActions.map(
		({ exDate, status, observedCloseRatio }) => ({ exDate, status, observedCloseRatio }),
	);
	const largeMoveSummary = largeMoves
		.map(
			({ sessionDate, closeRatio }) =>
				`; large move ${sessionDate} ×${closeRatio.toFixed(3)}`,
		)
		.join('');
	const corporateActionSummary = corporateActions
		.map(({ exDate, status, observedCloseRatio }) =>
			formatCorporateActionSummary(exDate, status, observedCloseRatio),
		)
		.join('');
	const droppedBarSummary = formatDroppedBarSummary(droppedBarSessions);
	const hasUnobservedStep = corporateActions.some(({ status }) => status === 'step-not-observed');
	const shouldWarn = hasUnobservedStep || largeMoveCount > 0 || droppedBarSessions.length > 0;
	const lineFields = {
		...fields,
		lastSessionDate,
		eventCount,
		largeMoveCount,
		largeMoves,
		corporateActions,
		droppedBarSessions,
	};
	const message = `${positionLabel} ${tradingLineId}: available (last session ${lastSessionDate}, ${eventCount} events, ${largeMoveCount} large moves${largeMoveSummary}${corporateActionSummary}${droppedBarSummary})`;

	if (shouldWarn) {
		log.warn(lineFields, message);
		return;
	}

	log.info(lineFields, message);
}

function formatCorporateActionSummary(
	exDate: string,
	status: CorporateActionStatus,
	observedCloseRatio: number | null,
): string {
	if (status !== 'step-not-observed' || observedCloseRatio === null) {
		return `; corporate action ${exDate}: ${status}`;
	}

	return `; corporate action ${exDate}: ${status} (observed ×${observedCloseRatio.toFixed(3)}; check the history before removing the entry)`;
}

function formatDroppedBarSummary(droppedBarSessions: readonly string[]): string {
	const droppedBarCount = droppedBarSessions.length;

	if (droppedBarCount === 0) {
		return '';
	}

	const noun = droppedBarCount === 1 ? 'bar' : 'bars';
	return `; ${droppedBarCount} dropped ${noun}`;
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
