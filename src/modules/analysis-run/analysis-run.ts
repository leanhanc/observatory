import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';
import { checkIfIsoDateIsValid } from '#lib/utils/validation.ts';
import {
	HISTORICAL_REQUEST_PAUSE_MS,
	createOpenBymadataAdapter,
	createOpenBymadataBarHistoryAcquirer,
	validateDailyBars,
} from '#modules/bar-history/index.ts';
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
} from '#modules/bar-history/index.ts';
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
	tradingLine: OpenBymadataTradingLineDescriptor;
}>;

type FetchedLine =
	| Readonly<{
			ok: true;
			bars: readonly DailyBar[];
			zeroOpenSessions: readonly string[];
			rangeRepairSessions: readonly string[];
	  }>
	| Readonly<{
			ok: false;
			reason: Extract<AnalyzedLineFailureReason, 'fetch-failed' | 'invalid-bars'>;
			message: string;
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
	acquirer: BarHistoryAcquirer;
	pause: BarHistoryPause;
	catalog: InstrumentCatalog;
	corporateActions: readonly CorporateAction[];
	snapshotStorage: AnalysisSnapshotStorage;
	getCurrentInstant: () => string;
	reportProgress: (progress: AnalysisRunProgress) => void;
}>;

const ANALYZED_INSTRUMENT_TYPES = new Set(['stock', 'cedear']);
const MARKET_TIME_ZONE = 'America/Argentina/Buenos_Aires';

/**
 * Creates the Analysis Run: a fresh provider fetch of the MEP rate source and every analyzed
 * Trading Line, correction of confirmed Corporate Actions, dollarization, a liquidity-eligibility
 * gate, analysis with Large One-Session Move flags, and one persisted Analysis Snapshot.
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
	const adapter = createOpenBymadataAdapter(options.fetchFromProvider ?? fetch);
	const pause = options.pause ?? Bun.sleep;
	const dependencies: AnalysisRunDependencies = {
		acquirer: createOpenBymadataBarHistoryAcquirer(adapter, pause),
		pause,
		catalog: options.catalog ?? instrumentCatalog,
		corporateActions: options.corporateActions ?? committedCorporateActions,
		snapshotStorage,
		getCurrentInstant: options.getCurrentInstant ?? getCurrentUtcInstant,
		reportProgress: options.reportProgress ?? (() => {}),
	};

	return {
		run: (request) => runAnalysis(dependencies, request),
	};
}

async function runAnalysis(
	dependencies: AnalysisRunDependencies,
	request: AnalysisRunRequest,
): Promise<AnalysisRunResult> {
	const { acquirer, catalog, snapshotStorage, getCurrentInstant, reportProgress } = dependencies;
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
	const mepRateSourceFetch = await fetchTradingLines(
		acquirer,
		mepRateSourceLines,
		requestedThroughSession,
		true,
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

	const analyzedLineResults = await analyzeTradingLines(
		dependencies,
		analyzedLines,
		requestedThroughSession,
		mepRates.rates,
		liquidityWindowSelection.window,
	);
	const hasAvailableLine = analyzedLineResults.some((line) => line.status === 'available');

	if (!hasAvailableLine) {
		return createRunFailure(
			'no-analyzed-lines',
			'No analyzed Trading Line could be analyzed; no snapshot was written.',
		);
	}

	const snapshot = {
		schemaVersion: 3,
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
		.filter((instrument) => ANALYZED_INSTRUMENT_TYPES.has(instrument.type));

	return analyzedInstruments.flatMap((instrument) =>
		instrument.tradingLines
			.filter(
				(tradingLine) => tradingLine.exchange === 'BYMA' && tradingLine.currency === 'ARS',
			)
			.map((tradingLine) => ({
				instrumentId: instrument.id,
				tradingLine: { tradingLineId: tradingLine.id, symbol: tradingLine.symbol },
			})),
	);
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
	acceptsZeroOpen: boolean,
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
			validateAcquiredLine(line, acceptsZeroOpen),
		]),
	);
}

function validateAcquiredLine(
	result: BarHistoryAcquisitionLineResult,
	acceptsZeroOpen: boolean,
): FetchedLine {
	if (result.status === 'not-required') {
		throw new Error(`The acquisition skipped ${result.tradingLineId} during a full fetch.`);
	}

	if (result.status === 'failed') {
		return { ok: false, reason: 'fetch-failed', message: result.message };
	}

	// Dollarization and analysis assume validated, chronological bars and do not check them.
	const { issues, zeroOpenSessions } = acceptsZeroOpen
		? validateMepRateSourceBars(result.bars)
		: { issues: validateDailyBars(result.bars, true, 'bars').issues, zeroOpenSessions: [] };

	if (issues.length > 0) {
		const firstIssue = issues[0];
		const message = `${issues.length} invalid Daily Bar issue(s); first: ${firstIssue?.path}: ${firstIssue?.message}`;
		return { ok: false, reason: 'invalid-bars', message };
	}

	return {
		ok: true,
		bars: result.bars,
		zeroOpenSessions,
		rangeRepairSessions: result.repairs.map((repair) => repair.sessionDate),
	};
}

function calculateRunMepRates(fetchedLines: ReadonlyMap<string, FetchedLine>): MepRatesResult {
	const { pesoBondTradingLineId, dollarBondTradingLineId } = MEP_RATE_SOURCE;
	const pesoBond = getRequiredFetchedLine(fetchedLines, pesoBondTradingLineId);
	const dollarBond = getRequiredFetchedLine(fetchedLines, dollarBondTradingLineId);

	if (!pesoBond.ok) {
		return { ok: false, message: `${pesoBondTradingLineId}: ${pesoBond.message}` };
	}

	if (!dollarBond.ok) {
		return { ok: false, message: `${dollarBondTradingLineId}: ${dollarBond.message}` };
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
 * Fetches and analyzes the lines one at a time, reporting each as soon as it is analyzed. The
 * acquirer paces requests only within one acquisition, so the pause keeps that pace between these
 * single-line acquisitions and after the MEP rate source's.
 */
async function analyzeTradingLines(
	dependencies: AnalysisRunDependencies,
	lines: readonly AnalyzedTradingLine[],
	requestedThroughSession: string,
	mepRates: readonly MepRateSession[],
	liquidityWindow: LiquidityWindow,
): Promise<readonly AnalyzedLine[]> {
	const { acquirer, pause, corporateActions, reportProgress } = dependencies;
	const analyzedLines: AnalyzedLine[] = [];

	for (const [index, line] of lines.entries()) {
		// oxlint-disable-next-line no-await-in-loop -- Provider requests are paced, one at a time.
		await pause(HISTORICAL_REQUEST_PAUSE_MS);
		const { tradingLineId } = line.tradingLine;
		// oxlint-disable-next-line no-await-in-loop -- Provider requests are paced, one at a time.
		const fetchedLines = await fetchTradingLines(
			acquirer,
			[line.tradingLine],
			requestedThroughSession,
			false,
		);
		const lineCorporateActions = corporateActions.filter(
			(action) => action.tradingLineId === tradingLineId,
		);
		const analyzedLine = analyzeTradingLine(
			line,
			getRequiredFetchedLine(fetchedLines, tradingLineId),
			lineCorporateActions,
			mepRates,
			liquidityWindow,
		);

		analyzedLines.push(analyzedLine);
		reportProgress({
			type: 'line-analyzed',
			position: index + 1,
			analyzedLineCount: lines.length,
			line: analyzedLine,
		});
	}

	return analyzedLines;
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
		rangeRepairSessions: fetchedLine.rangeRepairSessions,
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
