import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';
import { checkIfIsoDateIsValid } from '#lib/utils/validation.ts';
import {
	HISTORICAL_REQUEST_PAUSE_MS,
	createOpenBymadataAdapter,
	createOpenBymadataBarHistoryAcquirer,
	validateDailyBars,
} from '#modules/bar-history/index.ts';
import { watchCorporateActions, watchRules } from '#modules/corporate-action-watch/index.ts';
import {
	applyCorporateActions,
	corporateActions as committedCorporateActions,
} from '#modules/corporate-actions/index.ts';
import {
	MEP_RATE_SOURCE,
	calculateMepRates,
	dollarizeBarHistory,
	validateMepRateSourceBars,
} from '#modules/dollarized-series/index.ts';
import { instrumentCatalog } from '#modules/instrument-catalog/index.ts';
import { calculateInstrumentStates } from '#modules/instrument-state/index.ts';
import {
	evaluateLiquidityEligibility,
	selectLiquidityWindow,
} from '#modules/liquidity-eligibility/index.ts';
import {
	detectLargeOneSessionMoves,
	detectRegimeTransitionEvents,
	detectStructureBreakEvents,
	detectVolatilityExpansionEvents,
} from '#modules/technical-analysis/index.ts';

import type {
	BarHistoryAcquirer,
	BarHistoryAcquisitionLineResult,
	BarHistoryPause,
	DailyBar,
	OpenBymadataTradingLineDescriptor,
	ValidationIssue,
} from '#modules/bar-history/index.ts';
import type {
	CorporateActionWatch,
	RelevantFactsFetch,
} from '#modules/corporate-action-watch/index.ts';
import type { CorporateAction } from '#modules/corporate-actions/index.ts';
import type { MepRateSession } from '#modules/dollarized-series/index.ts';
import type { InstrumentCatalog } from '#modules/instrument-catalog/index.ts';
import type { LiquidityWindow } from '#modules/liquidity-eligibility/index.ts';
import type { LargeOneSessionMove } from '#modules/technical-analysis/index.ts';
import type {
	AnalysisEvent,
	AnalysisRunProgress,
	AnalysisRunRequest,
	AnalysisRunResult,
	AnalysisRunner,
	AnalysisRunnerOptions,
	AnalysisSnapshotEvent,
	AnalysisSnapshotStorage,
	AnalyzedLine,
	AnalyzedLineFailureReason,
	TradingLineSession,
} from './analysis-run.types.ts';

type AnalyzedTradingLine = Readonly<{
	instrumentId: string;
	instrumentType: 'stock' | 'cedear';
	tradingLine: OpenBymadataTradingLineDescriptor;
}>;

type FetchedLine =
	| Readonly<{
			ok: true;
			bars: readonly DailyBar[];
			zeroOpenSessions: readonly string[];
			rangeRepairSessions: readonly string[];
			droppedBarSessions: readonly string[];
	  }>
	| FetchFailure;

type FetchFailure = Readonly<{
	ok: false;
	reason: Extract<AnalyzedLineFailureReason, 'fetch-failed' | 'invalid-bars'>;
	message: string;
	/** The provider may answer if asked again. Only an incomplete request or an outage is. */
	isTransient: boolean;
}>;

type PositionedLine = Readonly<{ position: number; analyzedLine: AnalyzedLine }>;

/** An analyzed line whose main-pass fetch failed transiently, waiting for the retry pass. */
type PendingLine = Readonly<{
	position: number;
	line: AnalyzedTradingLine;
	failure: FetchFailure;
}>;

type LineAnalysisContext = Readonly<{
	requestedThroughSession: string;
	ranAt: string;
	analyzedLineCount: number;
	mepRates: readonly MepRateSession[];
	liquidityWindow: LiquidityWindow;
}>;

type MepRatesResult =
	| Readonly<{
			ok: true;
			rates: readonly MepRateSession[];
			latestRateSessionDate: string;
			acceptedZeroOpens: readonly TradingLineSession[];
			rangeRepairs: readonly TradingLineSession[];
	  }>
	| Readonly<{ ok: false; message: string }>;

type AnalysisRunDependencies = Readonly<{
	fetchFromProvider: RelevantFactsFetch;
	acquirer: BarHistoryAcquirer;
	pause: BarHistoryPause;
	catalog: InstrumentCatalog;
	corporateActions: readonly CorporateAction[];
	snapshotStorage: AnalysisSnapshotStorage;
	getCurrentInstant: () => string;
	reportProgress: (progress: AnalysisRunProgress) => void;
	retryCutoffMs: number;
}>;

const MARKET_TIME_ZONE = 'America/Argentina/Buenos_Aires';

// Retry policy: the MEP rate source and the analyzed lines each get one retry. Provider failures
// come in clusters, so a retry first waits for the provider to recover. Between retried requests
// the usual HISTORICAL_REQUEST_PAUSE_MS still applies. The cut-off for analyzed lines comes from
// the runner options, because it depends on the caller's deadline.
const MEP_RATE_SOURCE_RETRY_COOL_DOWN_MS = 30_000;
const ANALYZED_LINE_RETRY_COOL_DOWN_MS = 30_000;

/**
 * Creates the Analysis Run: a fresh provider fetch of the MEP rate source and every analyzed
 * Trading Line, correction of confirmed Corporate Actions, dollarization, a liquidity-eligibility
 * gate, analysis with Large One-Session Move flags, a watch for Corporate Action Notices, and one
 * persisted Analysis Snapshot.
 *
 * Stored Bar Histories are neither read nor written; a single fetch keeps every bar on the
 * provider's current price scale. A line that cannot be analyzed, including one that is not
 * liquidity-eligible, is recorded as unavailable. The run writes nothing when the MEP rate source
 * fails or has too few market sessions for the liquidity window, or when no line could be analyzed.
 */
export function createAnalysisRunner(
	snapshotStorage: AnalysisSnapshotStorage,
	options: AnalysisRunnerOptions = {},
): AnalysisRunner {
	const fetchFromProvider = options.fetchFromProvider ?? fetch;
	const adapter = createOpenBymadataAdapter(fetchFromProvider);
	const pause = options.pause ?? Bun.sleep;
	const catalog = options.catalog ?? instrumentCatalog;
	const corporateActions = options.corporateActions ?? committedCorporateActions;
	assertCorporateActionsTargetAnalyzedLines(corporateActions, catalog);

	const dependencies: AnalysisRunDependencies = {
		fetchFromProvider,
		acquirer: createOpenBymadataBarHistoryAcquirer(adapter, pause),
		pause,
		catalog,
		corporateActions,
		snapshotStorage,
		getCurrentInstant: options.getCurrentInstant ?? getCurrentUtcInstant,
		reportProgress: options.reportProgress ?? (() => {}),
		retryCutoffMs: options.retryCutoffMs ?? Number.POSITIVE_INFINITY,
	};

	return {
		run: (request) => runAnalysis(dependencies, request),
	};
}

async function runAnalysis(
	dependencies: AnalysisRunDependencies,
	request: AnalysisRunRequest,
): Promise<AnalysisRunResult> {
	const { catalog, snapshotStorage, getCurrentInstant, reportProgress } = dependencies;
	const { requestedThroughSession } = request;
	const ranAt = getCurrentInstant();

	if (!checkIfIsoDateIsValid(requestedThroughSession)) {
		return createRunFailure(
			'invalid-request',
			'The Requested-Through Session must be a real YYYY-MM-DD date.',
		);
	}

	const marketToday = convertInstantToMarketDate(ranAt);
	const isCompletedSession = requestedThroughSession < marketToday;

	if (!isCompletedSession) {
		return createRunFailure(
			'invalid-request',
			`The Requested-Through Session must be before today's market date, ${marketToday}.`,
		);
	}

	const analyzedLines = selectAnalyzedTradingLines(catalog);
	reportProgress({
		type: 'run-started',
		requestedThroughSession,
		analyzedLineCount: analyzedLines.length,
		analysisConfigurationVersion: ANALYSIS_CONFIGURATION.version,
	});

	const mepRateSourceLines = resolveMepRateSourceLines(catalog);
	const mepRateSourceFetch = await fetchMepRateSource(
		dependencies,
		mepRateSourceLines,
		requestedThroughSession,
	);
	const mepRates = calculateRunMepRates(mepRateSourceFetch);

	if (!mepRates.ok) {
		return createRunFailure('mep-rate-source-unavailable', mepRates.message);
	}

	reportProgress({
		type: 'mep-rate-source-fetched',
		requestedThroughSession,
		latestRateSessionDate: mepRates.latestRateSessionDate,
	});

	// Eligibility is evaluated once, at the run's last market session, over a window every line
	// shares.
	const liquidityWindowSelection = selectLiquidityWindow(
		mepRates.rates,
		mepRates.latestRateSessionDate,
	);

	if (!liquidityWindowSelection.ok) {
		return createRunFailure(
			'insufficient-market-sessions',
			`The MEP rate source has ${liquidityWindowSelection.marketSessionCount} market sessions through ${mepRates.latestRateSessionDate}, fewer than the liquidity window needs.`,
		);
	}

	const analyzedLineResults = await analyzeTradingLines(dependencies, analyzedLines, {
		requestedThroughSession,
		ranAt,
		analyzedLineCount: analyzedLines.length,
		mepRates: mepRates.rates,
		liquidityWindow: liquidityWindowSelection.window,
	});
	const hasAvailableLine = analyzedLineResults.some((line) => line.status === 'available');

	if (!hasAvailableLine) {
		return createRunFailure(
			'no-analyzed-lines',
			'No analyzed Trading Line could be analyzed; no snapshot was written.',
		);
	}

	const corporateActionWatch = await watchAnalyzedLines(
		dependencies,
		analyzedLines,
		requestedThroughSession,
	);

	const snapshot = {
		schemaVersion: 4,
		ranAt,
		requestedThroughSession,
		analysisConfigurationVersion: ANALYSIS_CONFIGURATION.version,
		mepRateSource: {
			pesoBondTradingLineId: MEP_RATE_SOURCE.pesoBondTradingLineId,
			dollarBondTradingLineId: MEP_RATE_SOURCE.dollarBondTradingLineId,
			latestRateSessionDate: mepRates.latestRateSessionDate,
			acceptedZeroOpens: mepRates.acceptedZeroOpens,
			rangeRepairs: mepRates.rangeRepairs,
		},
		analyzedLines: analyzedLineResults,
		corporateActionWatch,
	} as const;
	const writeResult = await snapshotStorage.write(snapshot);

	if (!writeResult.ok) {
		return createRunFailure('snapshot-write-failed', writeResult.message);
	}

	return { ok: true, snapshot, locations: writeResult.locations };
}

/**
 * Resolves the calendar date before `instant`'s date in Buenos Aires. When a session traded on it,
 * that session has closed. Weekends and holidays are not skipped.
 */
export function resolvePreviousMarketDate(instant: string): string {
	return Temporal.PlainDate.from(convertInstantToMarketDate(instant))
		.subtract({ days: 1 })
		.toString();
}

/**
 * The market date in Buenos Aires when the run starts. That day's session may still be trading,
 * so only earlier sessions count as completed.
 */
function convertInstantToMarketDate(instant: string): string {
	return Temporal.Instant.from(instant)
		.toZonedDateTimeISO(MARKET_TIME_ZONE)
		.toPlainDate()
		.toString();
}

/** The BYMA peso lines of stocks and CEDEARs, per ADRs 0004 and 0005. */
function selectAnalyzedTradingLines(catalog: InstrumentCatalog): readonly AnalyzedTradingLine[] {
	const analyzedInstruments = catalog
		.getInstruments()
		.flatMap((instrument) =>
			instrument.type === 'stock' || instrument.type === 'cedear' ? [instrument] : [],
		);

	return analyzedInstruments.flatMap((instrument) =>
		instrument.tradingLines
			.filter(
				(tradingLine) => tradingLine.exchange === 'BYMA' && tradingLine.currency === 'ARS',
			)
			.map((tradingLine) => ({
				instrumentId: instrument.id,
				instrumentType: instrument.type,
				tradingLine: { tradingLineId: tradingLine.id, symbol: tradingLine.symbol },
			})),
	);
}

/**
 * A Corporate Action for any other line, such as a dollar line or a MEP rate source line, would
 * never be applied and never be reported, so it is rejected before the run starts.
 *
 * @throws {Error} when an action names a Trading Line the run does not analyze.
 */
function assertCorporateActionsTargetAnalyzedLines(
	corporateActions: readonly CorporateAction[],
	catalog: InstrumentCatalog,
): void {
	const analyzedLineIds = new Set(
		selectAnalyzedTradingLines(catalog).map((line) => line.tradingLine.tradingLineId),
	);
	const strayActions = corporateActions.filter(
		(action) => !analyzedLineIds.has(action.tradingLineId),
	);

	if (strayActions.length > 0) {
		const strayLabels = strayActions.map(
			(action) => `${action.tradingLineId}@${action.exDate}`,
		);
		throw new Error(
			`Corporate Actions must name analyzed Trading Lines; not analyzed: ${strayLabels.join(', ')}.`,
		);
	}
}

function resolveMepRateSourceLines(
	catalog: InstrumentCatalog,
): readonly OpenBymadataTradingLineDescriptor[] {
	const result = catalog.getTradingLinesByIds([
		MEP_RATE_SOURCE.pesoBondTradingLineId,
		MEP_RATE_SOURCE.dollarBondTradingLineId,
	]);

	if (!result.ok) {
		throw new Error('The Instrument Catalog cannot resolve the MEP rate source Trading Lines.');
	}

	return result.tradingLines.map((tradingLine) => ({
		tradingLineId: tradingLine.id,
		symbol: tradingLine.symbol,
	}));
}

/**
 * Fetches the provider's full available window for each line in one paced acquisition.
 * An initial backfill with no stored history is the acquisition that requests the full window;
 * nothing is stored afterwards.
 */
async function fetchTradingLines(
	acquirer: BarHistoryAcquirer,
	tradingLines: readonly OpenBymadataTradingLineDescriptor[],
	requestedThroughSession: string,
	isMepRateSource: boolean,
): Promise<ReadonlyMap<string, FetchedLine>> {
	const acquisition = await acquirer.acquire({
		requestedThroughSession,
		lines: tradingLines.map((tradingLine) => ({
			tradingLine,
			existingHistory: null,
			mode: 'initial-backfill',
		})),
	});

	if (!acquisition.ok) {
		throw new Error(
			`The Analysis Run acquisition request was rejected: ${acquisition.message}`,
		);
	}

	return new Map(
		acquisition.lines.map((line) => [
			line.tradingLineId,
			validateAcquiredLine(line, isMepRateSource),
		]),
	);
}

/**
 * Fetches both legs, then, after a cool-down, fetches the legs that failed transiently once more.
 * There is no retry when it could not yield MEP Rates: when a leg failed finally, or when a leg
 * answered with no bars.
 */
async function fetchMepRateSource(
	dependencies: AnalysisRunDependencies,
	tradingLines: readonly OpenBymadataTradingLineDescriptor[],
	requestedThroughSession: string,
): Promise<ReadonlyMap<string, FetchedLine>> {
	const { acquirer, pause, reportProgress } = dependencies;
	const fetchedLines = await fetchTradingLines(
		acquirer,
		tradingLines,
		requestedThroughSession,
		true,
	);
	const legs = tradingLines.map((tradingLine) => ({
		tradingLine,
		fetchedLine: getRequiredFetchedLine(fetchedLines, tradingLine.tradingLineId),
	}));
	const failedLegs = legs.flatMap(({ tradingLine, fetchedLine }) =>
		fetchedLine.ok ? [] : [{ tradingLine, failure: fetchedLine }],
	);
	const hasFinalFailure = failedLegs.some(({ failure }) => !failure.isTransient);
	const hasLegWithoutBars = legs.some(
		({ fetchedLine }) => fetchedLine.ok && fetchedLine.bars.length === 0,
	);

	if (failedLegs.length === 0 || hasFinalFailure || hasLegWithoutBars) {
		return fetchedLines;
	}

	reportProgress({
		type: 'fetch-retry-started',
		scope: 'mep-rate-source',
		retry: 1,
		retryCount: 1,
		coolDownMs: MEP_RATE_SOURCE_RETRY_COOL_DOWN_MS,
		failures: failedLegs.map(({ tradingLine, failure }) => ({
			tradingLineId: tradingLine.tradingLineId,
			message: failure.message,
		})),
	});
	await pause(MEP_RATE_SOURCE_RETRY_COOL_DOWN_MS);
	const retriedLines = await fetchTradingLines(
		acquirer,
		failedLegs.map(({ tradingLine }) => tradingLine),
		requestedThroughSession,
		true,
	);

	return new Map([...fetchedLines, ...retriedLines]);
}

function validateAcquiredLine(
	result: BarHistoryAcquisitionLineResult,
	isMepRateSource: boolean,
): FetchedLine {
	if (result.status === 'not-required') {
		throw new Error(`The acquisition skipped ${result.tradingLineId} during a full fetch.`);
	}

	if (result.status === 'failed') {
		const isTransient = result.reason === 'request-failed';
		return { ok: false, reason: 'fetch-failed', message: result.message, isTransient };
	}

	const rangeRepairSessions = result.repairs.map((repair) => repair.sessionDate);

	if (isMepRateSource) {
		return validateMepRateSourceLine(result.bars, rangeRepairSessions);
	}

	return validateAnalyzedLine(result.bars, rangeRepairSessions);
}

/**
 * A wrong MEP Rate would mis-dollarize every line on its session, so the MEP rate source drops no
 * bar: any invalid bar other than an accepted zero open fails the line.
 */
function validateMepRateSourceLine(
	bars: readonly DailyBar[],
	rangeRepairSessions: readonly string[],
): FetchedLine {
	const { issues, zeroOpenSessions } = validateMepRateSourceBars(bars);

	if (issues.length > 0) {
		return createInvalidBarsFailure(issues);
	}

	return { ok: true, bars, zeroOpenSessions, rangeRepairSessions, droppedBarSessions: [] };
}

/**
 * Drops each bar that is not a valid Daily Bar on its own, so one wrong bar does not hide the whole
 * line, and then requires the kept bars to be a chronological history. A dropped session is treated
 * like a session the line did not trade.
 */
function validateAnalyzedLine(
	bars: readonly DailyBar[],
	rangeRepairSessions: readonly string[],
): FetchedLine {
	const keptBars = bars.filter(checkIfBarIsValid);
	const droppedBarSessions = bars
		.filter((bar) => !checkIfBarIsValid(bar))
		.map((bar) => bar.sessionDate);
	const isEveryBarDropped = bars.length > 0 && keptBars.length === 0;

	if (isEveryBarDropped) {
		return {
			ok: false,
			reason: 'invalid-bars',
			message: `All ${bars.length} Daily Bars are invalid.`,
			isTransient: false,
		};
	}

	// Dollarization and analysis assume validated, chronological bars and do not check them.
	const { issues } = validateDailyBars(keptBars, true, 'bars');

	if (issues.length > 0) {
		return createInvalidBarsFailure(issues);
	}

	return {
		ok: true,
		bars: keptBars,
		zeroOpenSessions: [],
		rangeRepairSessions,
		droppedBarSessions,
	};
}

function checkIfBarIsValid(bar: DailyBar): boolean {
	return validateDailyBars([bar], false, 'bar').isValid;
}

function createInvalidBarsFailure(issues: readonly ValidationIssue[]): FetchedLine {
	const firstIssue = issues[0];
	const message = `${issues.length} invalid Daily Bar issue(s); first: ${firstIssue?.path}: ${firstIssue?.message}`;
	return { ok: false, reason: 'invalid-bars', message, isTransient: false };
}

function calculateRunMepRates(fetchedLines: ReadonlyMap<string, FetchedLine>): MepRatesResult {
	const { pesoBondTradingLineId, dollarBondTradingLineId } = MEP_RATE_SOURCE;
	const pesoBond = getRequiredFetchedLine(fetchedLines, pesoBondTradingLineId);
	const dollarBond = getRequiredFetchedLine(fetchedLines, dollarBondTradingLineId);

	if (!pesoBond.ok || !dollarBond.ok) {
		const failedLegs = [
			{ tradingLineId: pesoBondTradingLineId, fetchedLine: pesoBond },
			{ tradingLineId: dollarBondTradingLineId, fetchedLine: dollarBond },
		].flatMap(({ tradingLineId, fetchedLine }) =>
			fetchedLine.ok ? [] : [{ tradingLineId, failure: fetchedLine }],
		);
		// A final failure is what prevented a retry, so it is named before a transient one.
		const reportedLeg =
			failedLegs.find(({ failure }) => !failure.isTransient) ?? failedLegs[0]!;
		return {
			ok: false,
			message: `${reportedLeg.tradingLineId}: ${reportedLeg.failure.message}`,
		};
	}

	const rates = calculateMepRates(pesoBond.bars, dollarBond.bars);
	const latestRate = rates.at(-1);

	if (!latestRate) {
		return {
			ok: false,
			message: 'The MEP rate source has no session in which both legs traded.',
		};
	}

	return {
		ok: true,
		rates,
		latestRateSessionDate: latestRate.sessionDate,
		acceptedZeroOpens: [
			...labelSessions(pesoBondTradingLineId, pesoBond.zeroOpenSessions),
			...labelSessions(dollarBondTradingLineId, dollarBond.zeroOpenSessions),
		],
		rangeRepairs: [
			...labelSessions(pesoBondTradingLineId, pesoBond.rangeRepairSessions),
			...labelSessions(dollarBondTradingLineId, dollarBond.rangeRepairSessions),
		],
	};
}

function labelSessions(
	tradingLineId: string,
	sessionDates: readonly string[],
): readonly TradingLineSession[] {
	return sessionDates.map((sessionDate) => ({ tradingLineId, sessionDate }));
}

/**
 * Fetches and analyzes the lines one at a time, reporting each as soon as it is analyzed. A line
 * that fails transiently is held back and fetched once more after the main pass, so that it is
 * reported once, with its final outcome. The acquirer paces requests only within one acquisition,
 * so the pause keeps that pace between these single-line acquisitions and after the MEP rate
 * source's.
 */
async function analyzeTradingLines(
	dependencies: AnalysisRunDependencies,
	lines: readonly AnalyzedTradingLine[],
	context: LineAnalysisContext,
): Promise<readonly AnalyzedLine[]> {
	const { acquirer, pause } = dependencies;
	const mainPassLines: PositionedLine[] = [];
	const pendingLines: PendingLine[] = [];

	for (const [index, line] of lines.entries()) {
		const position = index + 1;
		// oxlint-disable-next-line no-await-in-loop -- Provider requests are paced, one at a time.
		await pause(HISTORICAL_REQUEST_PAUSE_MS);
		// oxlint-disable-next-line no-await-in-loop -- Provider requests are paced, one at a time.
		const fetchedLine = await fetchAnalyzedLine(acquirer, line, context);

		if (!fetchedLine.ok && fetchedLine.isTransient) {
			pendingLines.push({ position, line, failure: fetchedLine });
			continue;
		}

		mainPassLines.push(completeLine(dependencies, context, position, line, fetchedLine));
	}

	const retriedLines = await retryPendingLines(dependencies, pendingLines, context);
	const catalogOrderLines = [...mainPassLines, ...retriedLines].toSorted(
		(left, right) => left.position - right.position,
	);

	return catalogOrderLines.map(({ analyzedLine }) => analyzedLine);
}

/**
 * Waits one cool-down, then fetches each pending line once more, in Catalog order and with the
 * usual pause between requests. A retry whose pause would end at or after the retry cut-off is not
 * made: that line and the ones after it keep their main-pass failure.
 */
async function retryPendingLines(
	dependencies: AnalysisRunDependencies,
	pendingLines: readonly PendingLine[],
	context: LineAnalysisContext,
): Promise<readonly PositionedLine[]> {
	const { acquirer, pause, reportProgress } = dependencies;
	const retriedLines: PositionedLine[] = [];

	if (pendingLines.length === 0) {
		return retriedLines;
	}

	if (checkIfPauseReachesRetryCutoff(dependencies, context, ANALYZED_LINE_RETRY_COOL_DOWN_MS)) {
		return stopRetries(dependencies, context, pendingLines);
	}

	reportProgress({
		type: 'fetch-retry-started',
		scope: 'analyzed-lines',
		retry: 1,
		retryCount: 1,
		coolDownMs: ANALYZED_LINE_RETRY_COOL_DOWN_MS,
		failures: pendingLines.map(({ line, failure }) => ({
			tradingLineId: line.tradingLine.tradingLineId,
			message: failure.message,
		})),
	});

	for (const [retryIndex, pendingLine] of pendingLines.entries()) {
		const { position, line } = pendingLine;
		const pauseMs =
			retryIndex === 0 ? ANALYZED_LINE_RETRY_COOL_DOWN_MS : HISTORICAL_REQUEST_PAUSE_MS;

		if (checkIfPauseReachesRetryCutoff(dependencies, context, pauseMs)) {
			const unretriedLines = pendingLines.slice(retryIndex);
			return [...retriedLines, ...stopRetries(dependencies, context, unretriedLines)];
		}

		// oxlint-disable-next-line no-await-in-loop -- Provider requests are paced, one at a time.
		await pause(pauseMs);
		// oxlint-disable-next-line no-await-in-loop -- Provider requests are paced, one at a time.
		const fetchedLine = await fetchAnalyzedLine(acquirer, line, context);
		retriedLines.push(completeLine(dependencies, context, position, line, fetchedLine));
	}

	return retriedLines;
}

/** Reports the lines left at the retry cut-off, then records each with its main-pass failure. */
function stopRetries(
	dependencies: AnalysisRunDependencies,
	context: LineAnalysisContext,
	unretriedLines: readonly PendingLine[],
): readonly PositionedLine[] {
	dependencies.reportProgress({
		type: 'fetch-retry-stopped',
		tradingLineIds: unretriedLines.map(({ line }) => line.tradingLine.tradingLineId),
	});

	return unretriedLines.map(({ position, line, failure }) =>
		completeLine(dependencies, context, position, line, failure),
	);
}

function checkIfPauseReachesRetryCutoff(
	dependencies: AnalysisRunDependencies,
	context: LineAnalysisContext,
	pauseMs: number,
): boolean {
	const now = Temporal.Instant.from(dependencies.getCurrentInstant());
	const elapsedMs = now.since(Temporal.Instant.from(context.ranAt)).total('milliseconds');
	return elapsedMs + pauseMs >= dependencies.retryCutoffMs;
}

async function fetchAnalyzedLine(
	acquirer: BarHistoryAcquirer,
	line: AnalyzedTradingLine,
	context: LineAnalysisContext,
): Promise<FetchedLine> {
	const { tradingLineId } = line.tradingLine;
	const fetchedLines = await fetchTradingLines(
		acquirer,
		[line.tradingLine],
		context.requestedThroughSession,
		false,
	);
	return getRequiredFetchedLine(fetchedLines, tradingLineId);
}

/** Analyzes a line from its final fetch and reports it. */
function completeLine(
	dependencies: AnalysisRunDependencies,
	context: LineAnalysisContext,
	position: number,
	line: AnalyzedTradingLine,
	fetchedLine: FetchedLine,
): PositionedLine {
	const { corporateActions, reportProgress } = dependencies;
	const lineCorporateActions = corporateActions.filter(
		(action) => action.tradingLineId === line.tradingLine.tradingLineId,
	);
	const analyzedLine = analyzeTradingLine(
		line,
		fetchedLine,
		lineCorporateActions,
		context.mepRates,
		context.liquidityWindow,
	);

	reportProgress({
		type: 'line-analyzed',
		position,
		analyzedLineCount: context.analyzedLineCount,
		line: analyzedLine,
	});
	return { position, analyzedLine };
}

function analyzeTradingLine(
	line: AnalyzedTradingLine,
	fetchedLine: FetchedLine,
	lineCorporateActions: readonly CorporateAction[],
	mepRates: readonly MepRateSession[],
	liquidityWindow: LiquidityWindow,
): AnalyzedLine {
	const identity = {
		instrumentId: line.instrumentId,
		tradingLineId: line.tradingLine.tradingLineId,
	};

	if (!fetchedLine.ok) {
		return {
			status: 'unavailable',
			...identity,
			reason: fetchedLine.reason,
			message: fetchedLine.message,
		};
	}

	if (fetchedLine.bars.length === 0) {
		return {
			status: 'unavailable',
			...identity,
			reason: 'no-provider-bars',
			message: 'The provider returned no Daily Bars for this Trading Line.',
		};
	}

	const barRepairs = {
		rangeRepairSessions: fetchedLine.rangeRepairSessions,
		droppedBarSessions: fetchedLine.droppedBarSessions,
	};

	// Every later step reads the corrected peso bars. The MEP Rates are never corrected: a stock's
	// share count does not change a bond's price.
	const correction = applyCorporateActions(fetchedLine.bars, lineCorporateActions);
	const dollarizedSeries = dollarizeBarHistory(correction.bars, mepRates);
	const { bars } = dollarizedSeries;
	const firstBar = bars[0];
	const lastBar = bars.at(-1);

	if (!firstBar || !lastBar) {
		return {
			status: 'unavailable',
			...identity,
			reason: 'no-dollarized-bars',
			message: 'No session had both a peso-line bar and a MEP Rate.',
			...barRepairs,
		};
	}

	const liquidity = evaluateLiquidityEligibility(correction.bars, liquidityWindow);

	if (!liquidity.isEligible) {
		return {
			status: 'unavailable',
			...identity,
			reason: 'insufficient-liquidity',
			message:
				'The line did not trade regularly or heavily enough over the liquidity window.',
			liquidity: liquidity.measures,
			...barRepairs,
		};
	}

	const states = calculateInstrumentStates(bars);
	const largeMoves = detectLargeOneSessionMoves(bars);

	return {
		status: 'available',
		...identity,
		latestState: states.at(-1)!,
		events: collectEvents(bars, largeMoves),
		largeMoves,
		corporateActions: correction.outcomes,
		window: {
			firstSessionDate: firstBar.sessionDate,
			lastSessionDate: lastBar.sessionDate,
			barCount: bars.length,
		},
		sessionsWithoutMepRate: dollarizedSeries.sessionsWithoutMepRate,
		...barRepairs,
	};
}

/**
 * Orders Events by session; within a session, the sort is stable and keeps detector order. Each
 * Event is marked when its session is a Large One-Session Move.
 */
function collectEvents(
	bars: readonly DailyBar[],
	largeMoves: readonly LargeOneSessionMove[],
): readonly AnalysisSnapshotEvent[] {
	const largeMoveSessions = new Set(largeMoves.map((move) => move.sessionDate));
	const eventSessions: readonly Readonly<{ sessionDate: string; event: AnalysisEvent | null }>[] =
		[
			...detectRegimeTransitionEvents(bars),
			...detectStructureBreakEvents(bars),
			...detectVolatilityExpansionEvents(bars),
		];
	const events = eventSessions.flatMap(({ sessionDate, event }) =>
		event
			? [{ sessionDate, event, coincidesWithLargeMove: largeMoveSessions.has(sessionDate) }]
			: [],
	);

	return events.toSorted((left, right) => left.sessionDate.localeCompare(right.sessionDate));
}

/**
 * Looks for Corporate Action Notices about every analyzed line, whatever its outcome, after the
 * lines are analyzed so the feed cannot delay them. It is one request with the usual pause before
 * it, not retried: an unavailable watch is recorded, never a run failure.
 */
async function watchAnalyzedLines(
	dependencies: AnalysisRunDependencies,
	analyzedLines: readonly AnalyzedTradingLine[],
	requestedThroughSession: string,
): Promise<CorporateActionWatch> {
	const { fetchFromProvider, pause, corporateActions, reportProgress } = dependencies;
	const tradingLines = analyzedLines.map(({ instrumentType, tradingLine }) => ({
		...tradingLine,
		instrumentType,
	}));

	await pause(HISTORICAL_REQUEST_PAUSE_MS);
	const watch = await watchCorporateActions({
		fetchFromProvider,
		requestedThroughSession,
		tradingLines,
		corporateActions,
		rules: watchRules,
	});

	reportProgress({ type: 'corporate-action-watch-checked', watch });
	return watch;
}

function getRequiredFetchedLine(
	fetchedLines: ReadonlyMap<string, FetchedLine>,
	tradingLineId: string,
): FetchedLine {
	const fetchedLine = fetchedLines.get(tradingLineId);

	if (!fetchedLine) {
		throw new Error(`The acquisition returned no result for ${tradingLineId}.`);
	}

	return fetchedLine;
}

function createRunFailure(
	reason: Extract<AnalysisRunResult, { ok: false }>['reason'],
	message: string,
): AnalysisRunResult {
	return { ok: false, reason, message };
}

function getCurrentUtcInstant(): string {
	return Temporal.Now.instant().toString();
}
