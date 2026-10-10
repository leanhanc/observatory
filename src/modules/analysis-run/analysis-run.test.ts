import { describe, expect, test } from 'bun:test';

import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';
import { RELEVANT_FACTS_URL } from '#modules/corporate-action-watch/index.ts';
import { dollarizeBarHistory } from '#modules/dollarized-series/index.ts';
import { createInstrumentCatalog } from '#modules/instrument-catalog/instrument-catalog.ts';
import { calculateInstrumentStates } from '#modules/instrument-state/index.ts';
import { loadGgalFixture } from '#modules/technical-analysis/tests/support/index.ts';

import { createAnalysisRunner } from './analysis-run.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { CorporateAction } from '#modules/corporate-actions/index.ts';
import type { InstrumentCatalog } from '#modules/instrument-catalog/index.ts';
import type {
	AnalysisRunProgress,
	AnalysisRunResult,
	AnalysisSnapshot,
	AnalysisSnapshotStorage,
	AnalyzedLine,
} from './analysis-run.types.ts';

const REQUESTED_THROUGH_SESSION = '2026-09-30';
// Noon in Buenos Aires on 2026-10-01, so 2026-09-30 is the latest completed session.
const RAN_AT = '2026-10-01T15:00:00Z';
const RETRY_CUTOFF_MS = 25 * 60_000;

// The fixture is read as dollar prices. The MEP Rate steps through powers of two, so peso prices
// (dollar × rate) dollarize back to the fixture exactly, while the peso series carries currency
// jumps that change its States: an analysis of peso bars would not match.
const ggalDollarBars = await loadGgalFixture();
const sessionDates = ggalDollarBars.map((bar) => bar.sessionDate);
const ggalPesoBars = convertDollarBarsToPeso(ggalDollarBars);
const al30Bars = sessionDates.map((sessionDate) =>
	createFlatBar(sessionDate, selectMepRate(sessionDate)),
);
const al30dBars = sessionDates.map((sessionDate) => createFlatBar(sessionDate, 1));
// A steady rise has no confirmed swing highs, so Structure stays unavailable while RSI and the
// EMA distance warm up within 120 sessions and Regime's EMA200 does not. Trading on 120 of the last
// 125 sessions at USD 100k or more a day, the line is liquidity-eligible.
const shortHistoryDollarBars = sessionDates.slice(-120).map((sessionDate, index) => ({
	sessionDate,
	open: 100 + index,
	high: 101 + index,
	low: 99 + index,
	close: 100 + index,
	volume: 1_000,
}));

const catalog = createTestCatalog();

describe('createAnalysisRunner', () => {
	test('records the latest State of the final dollarized session', async () => {
		const { result } = await runWithProvider(createHealthyProvider());
		const ggal = selectAvailableLine(result, 'galicia-stock-byma-ars');
		const mepRates = sessionDates.map((sessionDate) => ({
			sessionDate,
			mepRate: selectMepRate(sessionDate),
		}));
		const dollarizedBars = dollarizeBarHistory(ggalPesoBars, mepRates).bars;
		const expectedLatestState = calculateInstrumentStates(dollarizedBars).at(-1);
		const pesoLatestState = calculateInstrumentStates(ggalPesoBars).at(-1);

		expect(ggal.latestState).toEqual(expectedLatestState!);
		expect(ggal.latestState).not.toEqual(pesoLatestState!);
		expect(ggal.latestState.sessionDate).toBe('2026-09-30');
		expect(ggal.window).toEqual({
			firstSessionDate: sessionDates[0]!,
			lastSessionDate: '2026-09-30',
			barCount: ggalDollarBars.length,
		});
	});

	test('includes Events from all three detectors with their session dates', async () => {
		const { result } = await runWithProvider(createHealthyProvider());
		const ggal = selectAvailableLine(result, 'galicia-stock-byma-ars');
		const sessionsByKind = (kind: string) =>
			ggal.events
				.filter(({ event }) => event.type === kind)
				.map((entry) => entry.sessionDate);

		expect(sessionsByKind('regime-transition')).toEqual([
			'2026-02-18',
			'2026-03-27',
			'2026-04-06',
			'2026-04-28',
			'2026-05-28',
			'2026-06-09',
			'2026-08-13',
			'2026-09-29',
		]);
		expect(sessionsByKind('structure-break')).toEqual([
			'2025-03-14',
			'2025-04-04',
			'2025-05-19',
			'2025-07-24',
			'2025-08-14',
			'2025-11-13',
			'2026-04-30',
			'2026-05-26',
			'2026-09-14',
		]);
		expect(sessionsByKind('volatility-expansion')).toHaveLength(16);
	});

	test('orders Events by session, then by kind within a session', async () => {
		const { result } = await runWithProvider(createHealthyProvider());
		const ggal = selectAvailableLine(result, 'galicia-stock-byma-ars');
		const eventDates = ggal.events.map((entry) => entry.sessionDate);
		const sameSessionKinds = ggal.events
			.filter((entry) => entry.sessionDate === '2025-04-04')
			.map(({ event }) => event.type);

		expect(eventDates).toEqual(eventDates.toSorted());
		expect(sameSessionKinds).toEqual(['structure-break', 'volatility-expansion']);
	});

	test('analyzes dollarized prices rather than peso prices', async () => {
		const { result } = await runWithProvider(createHealthyProvider());
		const ggal = selectAvailableLine(result, 'galicia-stock-byma-ars');
		const structureBreak = ggal.events.findLast(
			({ event }) => event.type === 'structure-break',
		);
		const findClose = (bars: readonly DailyBar[]) =>
			bars.find((bar) => bar.sessionDate === structureBreak?.sessionDate)?.close;

		expect(structureBreak?.event).toMatchObject({ closePrice: findClose(ggalDollarBars)! });
		expect(findClose(ggalPesoBars)).not.toBe(findClose(ggalDollarBars));
	});

	test('gives a short history a State with unavailable parts as null', async () => {
		const { result } = await runWithProvider(createHealthyProvider());
		const shortLine = selectAvailableLine(result, 'new-stock-byma-ars');

		expect(shortLine.window.barCount).toBe(120);
		expect(shortLine.latestState.regime).toBeNull();
		expect(shortLine.latestState.structure).toBeNull();
		expect(shortLine.latestState.rsi).toBeNumber();
		expect(shortLine.latestState.priceRelativeToEmaInAtr).toBeNumber();
	});

	test('records run-level facts and the Analysis Configuration version', async () => {
		const { result } = await runWithProvider(createHealthyProvider());

		expect(result.ok && result.snapshot).toMatchObject({
			schemaVersion: 4,
			ranAt: RAN_AT,
			requestedThroughSession: REQUESTED_THROUGH_SESSION,
			analysisConfigurationVersion: ANALYSIS_CONFIGURATION.version,
			mepRateSource: {
				pesoBondTradingLineId: 'al30-bond-byma-ars',
				dollarBondTradingLineId: 'al30-bond-byma-usd-mep',
				latestRateSessionDate: '2026-09-30',
				acceptedZeroOpens: [],
				rangeRepairs: [],
			},
		});
	});

	test('analyzes only BYMA peso lines of stocks and CEDEARs', async () => {
		const { result, requestedSymbols } = await runWithProvider(createHealthyProvider());
		const analyzedLineIds = result.ok
			? result.snapshot.analyzedLines.map((line) => line.tradingLineId)
			: [];

		expect(analyzedLineIds).toEqual([
			'galicia-stock-byma-ars',
			'apple-cedear-byma-ars',
			'new-stock-byma-ars',
		]);
		expect(requestedSymbols).not.toContain('AAPL-NASDAQ');
		expect(requestedSymbols).not.toContain('GGALD');
	});

	test('records a failing line as unavailable and still analyzes the others', async () => {
		const provider = { ...createHealthyProvider(), AAPL: 'http-error' as const };
		const { result, writes } = await runWithProvider(provider);
		const apple = selectLine(result, 'apple-cedear-byma-ars');

		expect(apple).toEqual({
			status: 'unavailable',
			instrumentId: 'apple-cedear',
			tradingLineId: 'apple-cedear-byma-ars',
			reason: 'fetch-failed',
			message: 'Open BYMADATA returned HTTP 500.',
		});
		expect(selectLine(result, 'galicia-stock-byma-ars').status).toBe('available');
		expect(writes).toHaveLength(1);
	});

	test('drops a bar whose close is outside its range and keeps the line', async () => {
		const droppedSession = '2025-06-02';
		const pesoBar = ggalPesoBars.find((bar) => bar.sessionDate === droppedSession)!;
		// 1.2% below the low: beyond the adapter's 1% repair tolerance.
		const provider = {
			...createHealthyProvider(),
			AAPL: replaceBar(ggalPesoBars, droppedSession, { close: pesoBar.low * 0.988 }),
		};
		const { result } = await runWithProvider(provider);
		const apple = selectAvailableLine(result, 'apple-cedear-byma-ars');
		const eventSessions = apple.events.map((entry) => entry.sessionDate);
		const largeMoveSessions = apple.largeMoves.map((move) => move.sessionDate);

		expect(apple.droppedBarSessions).toEqual([droppedSession]);
		expect(apple.window.barCount).toBe(ggalDollarBars.length - 1);
		expect(eventSessions).not.toContain(droppedSession);
		expect(largeMoveSessions).not.toContain(droppedSession);
		expect(selectAvailableLine(result, 'galicia-stock-byma-ars').droppedBarSessions).toEqual(
			[],
		);
	});

	test('drops placeholder bars before a line traded and analyzes from its first valid bar', async () => {
		const placeholderBars = ggalPesoBars.slice(0, 10).map((bar) => ({
			sessionDate: bar.sessionDate,
			open: 0,
			high: 0,
			low: 0,
			close: 0,
			volume: 0,
		}));
		const provider = {
			...createHealthyProvider(),
			AAPL: [...placeholderBars, ...ggalPesoBars.slice(10)],
		};
		const { result } = await runWithProvider(provider);
		const apple = selectAvailableLine(result, 'apple-cedear-byma-ars');

		expect(apple.droppedBarSessions).toEqual(sessionDates.slice(0, 10));
		expect(apple.window.firstSessionDate).toBe(sessionDates[10]!);
	});

	test('counts a dropped session as not traded for liquidity', async () => {
		const thinDollarBars = sessionDates.map((sessionDate) => ({
			...createFlatBar(sessionDate, 100),
			volume: 200,
		}));
		const thinPesoBars = convertDollarBarsToPeso(thinDollarBars);
		const droppedSession = sessionDates.at(-5)!;
		const provider = {
			...createHealthyProvider(),
			NEW: replaceBar(thinPesoBars, droppedSession, { close: 0 }),
		};
		const { result } = await runWithProvider(provider);

		expect(selectLine(result, 'new-stock-byma-ars')).toMatchObject({
			reason: 'insufficient-liquidity',
			liquidity: { participation: 124 / 125 },
			droppedBarSessions: [droppedSession],
		});
	});

	test('records the dropped bars of a line they pushed below the participation floor', async () => {
		// Thirteen dropped sessions leave 112 of 125 traded, below the 90% participation floor.
		const droppedSessions = sessionDates.slice(-13);
		const provider = {
			...createHealthyProvider(),
			AAPL: ggalPesoBars.map((bar) =>
				droppedSessions.includes(bar.sessionDate) ? { ...bar, close: 0 } : bar,
			),
		};
		const { result } = await runWithProvider(provider);

		expect(selectLine(result, 'apple-cedear-byma-ars')).toMatchObject({
			status: 'unavailable',
			reason: 'insufficient-liquidity',
			liquidity: { participation: 112 / 125 },
			droppedBarSessions: droppedSessions,
		});
		expect(selectLine(result, 'galicia-stock-byma-ars').status).toBe('available');
	});

	test('records a line whose kept bars are not a history as unavailable', async () => {
		const duplicatedBar = ggalPesoBars.at(-1)!;
		const provider = {
			...createHealthyProvider(),
			AAPL: [...ggalPesoBars, duplicatedBar],
		};
		const { result } = await runWithProvider(provider);

		expect(selectLine(result, 'apple-cedear-byma-ars')).toMatchObject({
			status: 'unavailable',
			reason: 'invalid-bars',
		});
	});

	test('records a line whose every bar is invalid as invalid-bars, not as missing', async () => {
		const provider = {
			...createHealthyProvider(),
			AAPL: ggalPesoBars.map((bar) => ({ ...bar, close: 0 })),
		};
		const { result } = await runWithProvider(provider);

		expect(selectLine(result, 'apple-cedear-byma-ars')).toMatchObject({
			status: 'unavailable',
			reason: 'invalid-bars',
		});
	});

	test('records a line with no MEP-rated session as unavailable', async () => {
		const unratedBars = [{ ...ggalPesoBars[0]!, sessionDate: '2024-01-02' }];
		const provider = { ...createHealthyProvider(), NEW: unratedBars };
		const { result } = await runWithProvider(provider);

		expect(selectLine(result, 'new-stock-byma-ars')).toMatchObject({
			status: 'unavailable',
			reason: 'no-dollarized-bars',
		});
	});

	test('lists peso sessions without a MEP Rate instead of filling them', async () => {
		const missingSession = '2026-09-29';
		const provider = {
			...createHealthyProvider(),
			AL30D: al30dBars.filter((bar) => bar.sessionDate !== missingSession),
		};
		const { result } = await runWithProvider(provider);
		const ggal = selectAvailableLine(result, 'galicia-stock-byma-ars');

		expect(ggal.sessionsWithoutMepRate).toEqual([missingSession]);
		expect(ggal.window.barCount).toBe(ggalDollarBars.length - 1);
	});

	test('fails without writing when the MEP rate source cannot be fetched', async () => {
		const provider = { ...createHealthyProvider(), AL30D: 'http-error' as const };
		const { result, writes, requestedSymbols } = await runWithProvider(provider);

		expect(result).toEqual({
			ok: false,
			reason: 'mep-rate-source-unavailable',
			message: 'al30-bond-byma-usd-mep: Open BYMADATA returned HTTP 500.',
		});
		expect(writes).toEqual([]);
		// An HTTP 500 is an outage, so AL30D is retried once; no analyzed line is fetched.
		expect(requestedSymbols).toEqual(['AL30', 'AL30D', 'AL30D']);
	});

	test('accepts a zero open on a MEP rate source bar and records it', async () => {
		const zeroOpenSession = '2026-09-29';
		const provider = {
			...createHealthyProvider(),
			AL30: replaceBar(al30Bars, zeroOpenSession, { open: 0 }),
		};
		const { result } = await runWithProvider(provider);
		const ggal = selectAvailableLine(result, 'galicia-stock-byma-ars');

		expect(result.ok && result.snapshot.mepRateSource.acceptedZeroOpens).toEqual([
			{ tradingLineId: 'al30-bond-byma-ars', sessionDate: zeroOpenSession },
		]);
		expect(ggal.sessionsWithoutMepRate).toEqual([]);
		expect(ggal.window.barCount).toBe(ggalDollarBars.length);
	});

	test('records a zero open on the dollar leg under its own Trading Line', async () => {
		const provider = {
			...createHealthyProvider(),
			AL30D: replaceBar(al30dBars, '2026-09-29', { open: 0 }),
		};
		const { result } = await runWithProvider(provider);

		expect(result.ok && result.snapshot.mepRateSource.acceptedZeroOpens).toEqual([
			{ tradingLineId: 'al30-bond-byma-usd-mep', sessionDate: '2026-09-29' },
		]);
	});

	test('fails the MEP rate source when a zero-open bar has a low above its high', async () => {
		const provider = {
			...createHealthyProvider(),
			AL30D: replaceBar(al30dBars, '2026-09-29', { open: 0, low: 2, high: 0.5 }),
		};
		const { result, writes } = await runWithProvider(provider);

		expect(result).toMatchObject({ ok: false, reason: 'mep-rate-source-unavailable' });
		expect(writes).toEqual([]);
	});

	test('still fails the MEP rate source when a zero-open bar has another invalid field', async () => {
		const provider = {
			...createHealthyProvider(),
			AL30D: replaceBar(al30dBars, '2026-09-29', { open: 0, close: 5 }),
		};
		const { result, writes } = await runWithProvider(provider);

		expect(result).toMatchObject({ ok: false, reason: 'mep-rate-source-unavailable' });
		expect(writes).toEqual([]);
	});

	test('drops an analyzed bar with a zero open instead of accepting it', async () => {
		const provider = {
			...createHealthyProvider(),
			AAPL: replaceBar(ggalPesoBars, '2026-09-29', { open: 0 }),
		};
		const { result } = await runWithProvider(provider);
		const apple = selectAvailableLine(result, 'apple-cedear-byma-ars');

		expect(apple.droppedBarSessions).toEqual(['2026-09-29']);
		expect(result.ok && result.snapshot.mepRateSource.acceptedZeroOpens).toEqual([]);
	});

	test('drops no bar of the MEP rate source', async () => {
		const provider = {
			...createHealthyProvider(),
			AL30D: replaceBar(al30dBars, '2026-09-29', { close: 5 }),
		};
		const { result, writes } = await runWithProvider(provider);

		expect(result).toMatchObject({ ok: false, reason: 'mep-rate-source-unavailable' });
		expect(writes).toEqual([]);
	});

	test('fails without writing when the MEP rate source yields no rate', async () => {
		const untradedAl30d = al30dBars.map((bar) => ({ ...bar, volume: 0 }));
		const provider = { ...createHealthyProvider(), AL30D: untradedAl30d };
		const { result, writes } = await runWithProvider(provider);

		expect(result).toMatchObject({ ok: false, reason: 'mep-rate-source-unavailable' });
		expect(writes).toEqual([]);
	});

	test('fails without writing when no analyzed line is available', async () => {
		const provider = {
			...createHealthyProvider(),
			GGAL: 'http-error' as const,
			AAPL: 'http-error' as const,
			NEW: 'http-error' as const,
		};
		const { result, writes } = await runWithProvider(provider);

		expect(result).toMatchObject({ ok: false, reason: 'no-analyzed-lines' });
		expect(writes).toEqual([]);
	});

	test.each([
		['an impossible date', '2026-02-30'],
		["today's market date", '2026-10-01'],
		['a future date', '2030-01-01'],
	])('rejects %s as the Requested-Through Session before fetching', async (_, session) => {
		const { result, requestedSymbols, writes } = await runWithProvider(
			createHealthyProvider(),
			session,
		);

		expect(result).toMatchObject({ ok: false, reason: 'invalid-request' });
		expect(requestedSymbols).toEqual([]);
		expect(writes).toEqual([]);
	});

	test('ignores provider bars after the Requested-Through Session', async () => {
		const nextSession = '2026-10-01';
		const lastPesoBar = ggalPesoBars.at(-1)!;
		// A tripled close would be a Volatility Expansion if this bar were analyzed.
		const spikeBar = {
			...lastPesoBar,
			sessionDate: nextSession,
			high: lastPesoBar.close * 3,
			close: lastPesoBar.close * 3,
		};
		const nextRate = selectMepRate(REQUESTED_THROUGH_SESSION);
		const provider = {
			...createHealthyProvider(),
			GGAL: [...ggalPesoBars, spikeBar],
			AL30: [...al30Bars, createFlatBar(nextSession, nextRate)],
			AL30D: [...al30dBars, createFlatBar(nextSession, 1)],
		};
		const { result } = await runWithProvider(provider);
		const ggal = selectAvailableLine(result, 'galicia-stock-byma-ars');
		const eventSessions = ggal.events.map((entry) => entry.sessionDate);

		expect(ggal.window.lastSessionDate).toBe(REQUESTED_THROUGH_SESSION);
		expect(ggal.window.barCount).toBe(ggalDollarBars.length);
		expect(ggal.latestState.sessionDate).toBe(REQUESTED_THROUGH_SESSION);
		expect(eventSessions).not.toContain(nextSession);
		expect(result.ok && result.snapshot.mepRateSource.latestRateSessionDate).toBe(
			REQUESTED_THROUGH_SESSION,
		);
	});

	test('distinguishes a provider with no bars from a missing MEP Rate', async () => {
		const provider = { ...createHealthyProvider(), NEW: 'no-data' as const };
		const { result } = await runWithProvider(provider);

		expect(selectLine(result, 'new-stock-byma-ars')).toMatchObject({
			status: 'unavailable',
			reason: 'no-provider-bars',
		});
	});

	test('records an illiquid line as unavailable with both liquidity measures', async () => {
		// USD 100 × 200 = USD 20,000 a day on every session, below the USD 50,000 floor.
		const thinDollarBars = sessionDates.map((sessionDate) => ({
			...createFlatBar(sessionDate, 100),
			volume: 200,
		}));
		const provider = {
			...createHealthyProvider(),
			NEW: convertDollarBarsToPeso(thinDollarBars),
		};
		const { result } = await runWithProvider(provider);

		expect(selectLine(result, 'new-stock-byma-ars')).toEqual({
			status: 'unavailable',
			instrumentId: 'new-stock',
			tradingLineId: 'new-stock-byma-ars',
			reason: 'insufficient-liquidity',
			message:
				'The line did not trade regularly or heavily enough over the liquidity window.',
			liquidity: { participation: 1, medianDailyTradedValueUsd: 20_000 },
			rangeRepairSessions: [],
			droppedBarSessions: [],
		});
		expect(selectLine(result, 'galicia-stock-byma-ars').status).toBe('available');
	});

	test('does not analyze a line listed within the liquidity window', async () => {
		const recentDollarBars = shortHistoryDollarBars.slice(-30);
		const provider = {
			...createHealthyProvider(),
			NEW: convertDollarBarsToPeso(recentDollarBars),
		};
		const { result } = await runWithProvider(provider);

		expect(selectLine(result, 'new-stock-byma-ars')).toMatchObject({
			reason: 'insufficient-liquidity',
			liquidity: { participation: 30 / 125 },
		});
	});

	test('fails before fetching analyzed lines when the liquidity window cannot be filled', async () => {
		const provider = {
			...createHealthyProvider(),
			AL30: al30Bars.slice(-124),
		};
		const { result, writes, requestedSymbols } = await runWithProvider(provider);

		expect(result).toMatchObject({ ok: false, reason: 'insufficient-market-sessions' });
		expect(writes).toEqual([]);
		expect(requestedSymbols).toEqual(['AL30', 'AL30D']);
	});

	test('records the sessions whose range the adapter repaired', async () => {
		const repairedSession = '2026-09-29';
		const pesoBar = ggalPesoBars.find((bar) => bar.sessionDate === repairedSession)!;
		const mepRate = selectMepRate(repairedSession);
		// Each close sits 0.5% above its high: within the adapter's repair tolerance.
		const pesoHigh = pesoBar.close / 1.005;
		const al30High = mepRate / 1.005;
		const provider = {
			...createHealthyProvider(),
			AAPL: replaceBar(ggalPesoBars, repairedSession, {
				open: Math.min(pesoBar.open, pesoHigh),
				high: pesoHigh,
				low: Math.min(pesoBar.low, pesoHigh),
			}),
			AL30: replaceBar(al30Bars, repairedSession, {
				open: al30High,
				high: al30High,
				low: al30High,
			}),
		};
		const { result } = await runWithProvider(provider);
		const apple = selectAvailableLine(result, 'apple-cedear-byma-ars');
		const ggal = selectAvailableLine(result, 'galicia-stock-byma-ars');

		expect(apple.rangeRepairSessions).toEqual([repairedSession]);
		expect(apple.droppedBarSessions).toEqual([]);
		expect(apple.window.barCount).toBe(ggal.window.barCount);
		expect(ggal.rangeRepairSessions).toEqual([]);
		expect(result.ok && result.snapshot.mepRateSource.rangeRepairs).toEqual([
			{ tradingLineId: 'al30-bond-byma-ars', sessionDate: repairedSession },
		]);
	});

	test('analyzes through the last session before a Requested-Through Session with no session', async () => {
		// The fixture's last session is 2026-09-30; 2026-10-01 is treated as a holiday.
		const writes: AnalysisSnapshot[] = [];
		const storage: AnalysisSnapshotStorage = {
			write: (snapshot) => {
				writes.push(snapshot);
				return Promise.resolve({ ok: true, locations: ['memory'] });
			},
		};
		const runner = createAnalysisRunner(storage, {
			...createRunnerOptions(createHealthyProvider()),
			getCurrentInstant: () => '2026-10-02T15:00:00Z',
		});

		const result = await runner.run({ requestedThroughSession: '2026-10-01' });
		const ggal = selectAvailableLine(result, 'galicia-stock-byma-ars');

		expect(result.ok && result.snapshot.requestedThroughSession).toBe('2026-10-01');
		expect(result.ok && result.snapshot.mepRateSource.latestRateSessionDate).toBe('2026-09-30');
		expect(ggal.latestState.sessionDate).toBe('2026-09-30');
		expect(writes).toHaveLength(1);
	});

	test('reports a failed snapshot write', async () => {
		const failingStorage: AnalysisSnapshotStorage = {
			write: () => Promise.resolve({ ok: false, message: 'bucket unavailable' }),
		};
		const runner = createAnalysisRunner(
			failingStorage,
			createRunnerOptions(createHealthyProvider()),
		);

		const result = await runner.run({ requestedThroughSession: REQUESTED_THROUGH_SESSION });

		expect(result).toEqual({
			ok: false,
			reason: 'snapshot-write-failed',
			message: 'bucket unavailable',
		});
	});
});

describe('Analysis Run corporate actions and large moves', () => {
	// A session in the middle of a single MEP Rate period on which GGAL has no Event.
	const exDate = '2025-06-02';
	const shareDistribution: CorporateAction = {
		tradingLineId: 'apple-cedear-byma-ars',
		exDate,
		priceFactor: 0.5,
		kind: 'share-distribution',
		sourceUrl: 'https://example.com/notice',
	};
	// The provider leaves a 1:1 share distribution unadjusted: prices before the ex-date are twice
	// the post-distribution scale, and volume is half the post-distribution share count.
	const unadjustedPesoBars = ggalPesoBars.map((bar) =>
		bar.sessionDate < exDate ? { ...scaleBarPrices(bar, 2), volume: bar.volume / 2 } : bar,
	);

	test('flags an unadjusted share distribution and marks the Events on it', async () => {
		const provider = { ...createHealthyProvider(), AAPL: unadjustedPesoBars };
		const { result } = await runWithProvider(provider);
		const apple = selectAvailableLine(result, 'apple-cedear-byma-ars');
		const exDateEvents = apple.events.filter((entry) => entry.sessionDate === exDate);
		const otherEvents = apple.events.filter((entry) => entry.sessionDate !== exDate);

		expect(apple.largeMoves.map((move) => move.sessionDate)).toContain(exDate);
		expect(exDateEvents.map(({ event }) => event.type)).toContain('volatility-expansion');
		expect(exDateEvents.every((entry) => entry.coincidesWithLargeMove)).toBe(true);
		expect(otherEvents.some((entry) => entry.coincidesWithLargeMove)).toBe(false);
		expect(apple.corporateActions).toEqual([]);
	});

	test('corrects a listed share distribution the provider did not adjust', async () => {
		const provider = { ...createHealthyProvider(), AAPL: unadjustedPesoBars };
		const { result } = await runWithProvider(provider, REQUESTED_THROUGH_SESSION, [
			shareDistribution,
		]);
		const apple = selectAvailableLine(result, 'apple-cedear-byma-ars');
		const ggal = selectAvailableLine(result, 'galicia-stock-byma-ars');
		const exDateEventTypes = apple.events
			.filter((entry) => entry.sessionDate === exDate)
			.map(({ event }) => event.type);

		expect(apple.corporateActions).toEqual([
			{
				...shareDistribution,
				status: 'applied',
				observedCloseRatio: expect.closeTo(0.5 * measureFixtureCloseRatio(exDate), 12),
			},
		]);
		expect(exDateEventTypes).not.toContain('structure-break');
		expect(exDateEventTypes).not.toContain('volatility-expansion');
		expect(apple.largeMoves).toEqual(ggal.largeMoves);
		expect(apple.largeMoves.map((move) => move.sessionDate)).not.toContain(exDate);
		expect(apple.events).toEqual(ggal.events);
		expect(apple.latestState).toEqual(ggal.latestState);
	});

	test('does not apply a listed action whose step is not in the history', async () => {
		const { result } = await runWithProvider(
			createHealthyProvider(),
			REQUESTED_THROUGH_SESSION,
			[shareDistribution],
		);
		const apple = selectAvailableLine(result, 'apple-cedear-byma-ars');
		const ggal = selectAvailableLine(result, 'galicia-stock-byma-ars');

		expect(apple.corporateActions).toEqual([
			{
				...shareDistribution,
				status: 'step-not-observed',
				observedCloseRatio: expect.closeTo(measureFixtureCloseRatio(exDate), 12),
			},
		]);
		expect(apple.events).toEqual(ggal.events);
		expect(apple.largeMoves).toEqual(ggal.largeMoves);
	});

	test.each([
		['a MEP rate source line', 'al30-bond-byma-ars'],
		['a dollar line', 'galicia-stock-byma-usd-mep'],
		['a line missing from the catalog', 'missing-stock-byma-ars'],
	])('rejects a Corporate Action for %s', (_, tradingLineId) => {
		const storage: AnalysisSnapshotStorage = {
			write: () => Promise.resolve({ ok: true, locations: [] }),
		};
		const createRunner = () =>
			createAnalysisRunner(storage, {
				...createRunnerOptions(createHealthyProvider()),
				corporateActions: [{ ...shareDistribution, tradingLineId }],
			});

		expect(createRunner).toThrow(tradingLineId);
	});

	test('accepts the committed Corporate Actions with the committed catalog', () => {
		const storage: AnalysisSnapshotStorage = {
			write: () => Promise.resolve({ ok: true, locations: [] }),
		};

		expect(() => createAnalysisRunner(storage)).not.toThrow();
	});

	test('applies only the actions listed for the line', async () => {
		const provider = { ...createHealthyProvider(), AAPL: unadjustedPesoBars };
		const { result } = await runWithProvider(provider, REQUESTED_THROUGH_SESSION, [
			shareDistribution,
		]);

		expect(selectAvailableLine(result, 'galicia-stock-byma-ars').corporateActions).toEqual([]);
	});

	test('flags a move made by the MEP Rate alone, using each session own rate', async () => {
		const halvedRateSession = '2025-06-03';
		const halvedRate = selectMepRate(halvedRateSession) / 2;
		const provider = {
			...createHealthyProvider(),
			AL30: replaceBar(al30Bars, halvedRateSession, {
				open: halvedRate,
				high: halvedRate,
				low: halvedRate,
				close: halvedRate,
			}),
		};
		const { result } = await runWithProvider(provider);
		const ggal = selectAvailableLine(result, 'galicia-stock-byma-ars');
		const expectedCloseRatio = 2 * measureFixtureCloseRatio(halvedRateSession);

		expect(expectedCloseRatio).toBeGreaterThanOrEqual(1.8);
		expect(ggal.largeMoves).toContainEqual({
			sessionDate: halvedRateSession,
			closeRatio: expect.closeTo(expectedCloseRatio, 12),
		});
	});
});

describe('Analysis Run corporate-action watch', () => {
	// NOW's split notice (483240) with the test catalog's CEDEAR ticker.
	const appleSplitNotice: RelevantFactsRow = {
		especie: 'BCOM',
		fecha: '2026-09-28 13:27:09.0',
		tipoArchivo: 'pdf',
		descarga: 483240,
		referencia: 'Hecho Relevante de Cedear - AAPL - APPLE INC. - Anuncia Stock Split',
		emisor: 'BANCO COMAFI S.A.',
	};
	const appleSplit: CorporateAction = {
		tradingLineId: 'apple-cedear-byma-ars',
		exDate: '2026-10-05',
		priceFactor: 0.25,
		kind: 'split',
		sourceUrl: 'https://example.com/notice',
	};

	test('records the notices for analyzed lines over the week through the session', async () => {
		const { result } = await runWithProvider(
			createHealthyProvider(),
			REQUESTED_THROUGH_SESSION,
			[],
			[appleSplitNotice],
		);

		expect(result.ok && result.snapshot.corporateActionWatch).toEqual({
			status: 'available',
			publishedFrom: '2026-09-24',
			publishedThrough: '2026-09-30',
			candidates: [
				{
					tradingLineId: 'apple-cedear-byma-ars',
					isListed: false,
					notices: [
						{
							documentId: 483240,
							publishedAt: '2026-09-28T13:27:09',
							title: appleSplitNotice.referencia,
							pdfUrl: 'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/483240',
						},
					],
				},
			],
		});
	});

	test("marks a candidate listed from the run's Corporate Action list", async () => {
		const { result } = await runWithProvider(
			createHealthyProvider(),
			REQUESTED_THROUGH_SESSION,
			[appleSplit],
			[appleSplitNotice],
		);
		const watch = result.ok ? result.snapshot.corporateActionWatch : null;

		expect(watch?.status === 'available' && watch.candidates[0]!.isListed).toBe(true);
	});

	test('writes the snapshot unchanged otherwise when the feed fails', async () => {
		const healthyRun = await runWithProvider(createHealthyProvider());
		const failedFeedRun = await runWithProvider(
			createHealthyProvider(),
			REQUESTED_THROUGH_SESSION,
			[],
			'http-error',
		);

		expect(failedFeedRun.writes).toHaveLength(1);
		expect(failedFeedRun.result.ok && failedFeedRun.result.snapshot).toMatchObject({
			analyzedLines: healthyRun.result.ok ? healthyRun.result.snapshot.analyzedLines : [],
			corporateActionWatch: {
				status: 'unavailable',
				message: 'The relevant-facts feed returned HTTP 500.',
			},
		});
	});

	test('does not request the feed when no snapshot can be written', async () => {
		const provider = {
			...createHealthyProvider(),
			GGAL: 'no-data' as const,
			AAPL: 'no-data' as const,
			NEW: 'no-data' as const,
		};
		const { result, requestedSymbols } = await runWithProvider(provider);

		expect(result).toMatchObject({ ok: false, reason: 'no-analyzed-lines' });
		expect(requestedSymbols).not.toContain('relevant-facts');
	});
});

describe('Analysis Run progress', () => {
	test('reports each analyzed line once, in order, as soon as it is analyzed', async () => {
		const provider = { ...createHealthyProvider(), AAPL: 'http-not-found' as const };
		const timeline = await recordRunTimeline(provider);

		// Exactly one historical request pause separates every pair of provider requests, including
		// the MEP rate source's last request and the first analyzed line's.
		expect(timeline).toEqual([
			'run-started 2026-09-30 lines=3 configuration=' + ANALYSIS_CONFIGURATION.version,
			'request AL30',
			'pause 2000',
			'request AL30D',
			'mep-rate-source-fetched 2026-09-30',
			'pause 2000',
			'request GGAL',
			'line 1/3 galicia-stock-byma-ars available',
			'pause 2000',
			'request AAPL',
			'line 2/3 apple-cedear-byma-ars unavailable fetch-failed',
			'pause 2000',
			'request NEW',
			'line 3/3 new-stock-byma-ars available',
			'pause 2000',
			'request relevant-facts',
			'corporate-action-watch available: ',
		]);
	});

	test('reports no MEP rate or line when the MEP rate source fails', async () => {
		const provider = { ...createHealthyProvider(), AL30D: 'http-error' as const };
		const timeline = await recordRunTimeline(provider);

		expect(timeline).toEqual([
			'run-started 2026-09-30 lines=3 configuration=' + ANALYSIS_CONFIGURATION.version,
			'request AL30',
			'pause 2000',
			'request AL30D',
			'retry mep-rate-source 1/1 cool-down 30000: al30-bond-byma-usd-mep',
			'pause 30000',
			'request AL30D',
		]);
	});

	test('reports nothing for an invalid request', async () => {
		const timeline = await recordRunTimeline(createHealthyProvider(), {
			requestedThroughSession: '2026-10-01',
		});

		expect(timeline).toEqual([]);
	});
});

describe('Analysis Run fetch retries', () => {
	const RUN_STARTED =
		'run-started 2026-09-30 lines=3 configuration=' + ANALYSIS_CONFIGURATION.version;
	const MEP_RATE_SOURCE_FETCH = [
		'request AL30',
		'pause 2000',
		'request AL30D',
		'mep-rate-source-fetched 2026-09-30',
	];
	const newPesoBars = convertDollarBarsToPeso(shortHistoryDollarBars);
	const WATCH = ['pause 2000', 'request relevant-facts', 'corporate-action-watch available: '];

	test('analyzes a line that fails transiently once and succeeds on retry', async () => {
		const provider = {
			...createHealthyProvider(),
			AAPL: { sequence: ['http-error', ggalPesoBars] as const },
		};
		const { result, requestedSymbols } = await runWithProvider(provider);
		const apple = selectAvailableLine(result, 'apple-cedear-byma-ars');
		const galicia = selectAvailableLine(result, 'galicia-stock-byma-ars');

		// Both lines served the same bars, so the retried line's analysis matches the other's.
		expect(apple.latestState).toEqual(galicia.latestState);
		expect(apple.events).toEqual(galicia.events);
		expect(requestedSymbols.filter((symbol) => symbol === 'AAPL')).toHaveLength(2);
	});

	test('records a line that fails transiently twice as fetch-failed', async () => {
		const provider = {
			...createHealthyProvider(),
			AAPL: { sequence: ['http-error', 'http-error', ggalPesoBars] as const },
		};
		const { result, requestedSymbols } = await runWithProvider(provider);

		expect(selectLine(result, 'apple-cedear-byma-ars')).toMatchObject({
			status: 'unavailable',
			reason: 'fetch-failed',
			message: 'Open BYMADATA returned HTTP 500.',
		});
		expect(requestedSymbols.filter((symbol) => symbol === 'AAPL')).toHaveLength(2);
	});

	test('takes the retry outcome when the retry gets a different answer', async () => {
		const provider = {
			...createHealthyProvider(),
			AAPL: { sequence: ['http-error', 'no-data'] as const },
		};
		const { result } = await runWithProvider(provider);

		expect(selectLine(result, 'apple-cedear-byma-ars')).toMatchObject({
			status: 'unavailable',
			reason: 'no-provider-bars',
		});
	});

	test.each([
		['no data', 'no-data', 'no-provider-bars'],
		['an HTTP 404', 'http-not-found', 'fetch-failed'],
		['a body that is not JSON', 'not-json', 'fetch-failed'],
		['a provider error status', 'provider-error', 'fetch-failed'],
		['a malformed history', 'malformed-history', 'fetch-failed'],
	] as const)('never retries %s', async (_label, response, reason) => {
		const provider = {
			...createHealthyProvider(),
			AAPL: { sequence: [response, ggalPesoBars] },
		};
		const { result, requestedSymbols } = await runWithProvider(provider);

		expect(selectLine(result, 'apple-cedear-byma-ars')).toMatchObject({
			status: 'unavailable',
			reason,
		});
		expect(requestedSymbols).toEqual([
			'AL30',
			'AL30D',
			'GGAL',
			'AAPL',
			'NEW',
			'relevant-facts',
		]);
	});

	test('never retries a line whose bars fail validation', async () => {
		const provider = {
			...createHealthyProvider(),
			AAPL: { sequence: [[...ggalPesoBars, ggalPesoBars.at(-1)!], ggalPesoBars] },
		};
		const { result, requestedSymbols } = await runWithProvider(provider);

		expect(selectLine(result, 'apple-cedear-byma-ars')).toMatchObject({
			reason: 'invalid-bars',
		});
		expect(requestedSymbols).toEqual([
			'AL30',
			'AL30D',
			'GGAL',
			'AAPL',
			'NEW',
			'relevant-facts',
		]);
	});

	test('retries after the main pass, in Catalog order, reporting each line once', async () => {
		const provider = {
			...createHealthyProvider(),
			GGAL: { sequence: ['http-error', ggalPesoBars] as const },
			NEW: { sequence: ['http-error', newPesoBars] as const },
		};
		const timeline = await recordRunTimeline(provider);

		expect(timeline).toEqual([
			RUN_STARTED,
			...MEP_RATE_SOURCE_FETCH,
			'pause 2000',
			'request GGAL',
			'pause 2000',
			'request AAPL',
			'line 2/3 apple-cedear-byma-ars available',
			'pause 2000',
			'request NEW',
			'retry analyzed-lines 1/1 cool-down 30000: galicia-stock-byma-ars, new-stock-byma-ars',
			'pause 30000',
			'request GGAL',
			'line 1/3 galicia-stock-byma-ars available',
			'pause 2000',
			'request NEW',
			'line 3/3 new-stock-byma-ars available',
			...WATCH,
		]);
	});

	test('keeps the snapshot in Catalog order after a retry', async () => {
		const provider = {
			...createHealthyProvider(),
			GGAL: { sequence: ['http-error', ggalPesoBars] as const },
		};
		const { result } = await runWithProvider(provider);

		expect(
			result.ok && result.snapshot.analyzedLines.map((line) => line.tradingLineId),
		).toEqual(['galicia-stock-byma-ars', 'apple-cedear-byma-ars', 'new-stock-byma-ars']);
	});

	test('retries the MEP rate source and succeeds when it recovers', async () => {
		const provider = {
			...createHealthyProvider(),
			AL30D: { sequence: ['http-error', al30dBars] as const },
		};
		const timeline = await recordRunTimeline(provider);
		const { result, writes } = await runWithProvider(provider);

		expect(timeline.slice(0, 8)).toEqual([
			RUN_STARTED,
			'request AL30',
			'pause 2000',
			'request AL30D',
			'retry mep-rate-source 1/1 cool-down 30000: al30-bond-byma-usd-mep',
			'pause 30000',
			'request AL30D',
			'mep-rate-source-fetched 2026-09-30',
		]);
		expect(result.ok).toBe(true);
		expect(writes).toHaveLength(1);
	});

	test('retries both MEP rate source legs with the usual pause between them', async () => {
		const provider = {
			...createHealthyProvider(),
			AL30: { sequence: ['http-error', al30Bars] as const },
			AL30D: { sequence: ['http-error', al30dBars] as const },
		};
		const timeline = await recordRunTimeline(provider);

		expect(timeline.slice(0, 10)).toEqual([
			RUN_STARTED,
			'request AL30',
			'pause 2000',
			'request AL30D',
			'retry mep-rate-source 1/1 cool-down 30000: al30-bond-byma-ars, al30-bond-byma-usd-mep',
			'pause 30000',
			'request AL30',
			'pause 2000',
			'request AL30D',
			'mep-rate-source-fetched 2026-09-30',
		]);
	});

	test('never retries a MEP rate source leg that fails finally', async () => {
		const provider = {
			...createHealthyProvider(),
			AL30D: { sequence: ['provider-error', al30dBars] as const },
		};
		const { result, writes, requestedSymbols } = await runWithProvider(provider);

		expect(result).toEqual({
			ok: false,
			reason: 'mep-rate-source-unavailable',
			message: 'al30-bond-byma-usd-mep: Open BYMADATA rejected the history request.',
		});
		expect(writes).toEqual([]);
		expect(requestedSymbols).toEqual(['AL30', 'AL30D']);
	});

	test('does not retry the other leg when one fails finally, and names the final failure', async () => {
		const provider = {
			...createHealthyProvider(),
			AL30: 'http-error' as const,
			AL30D: replaceBar(al30dBars, '2026-09-29', { low: 2, high: 0.5 }),
		};
		const { result, writes, requestedSymbols } = await runWithProvider(provider);

		expect(result).toMatchObject({
			ok: false,
			reason: 'mep-rate-source-unavailable',
			message: expect.stringMatching(/^al30-bond-byma-usd-mep: /),
		});
		expect(writes).toEqual([]);
		expect(requestedSymbols).toEqual(['AL30', 'AL30D']);
	});

	test('does not retry the MEP rate source when the other leg has no bars', async () => {
		const provider = {
			...createHealthyProvider(),
			AL30: 'no-data' as const,
			AL30D: { sequence: ['http-error', al30dBars] as const },
		};
		const { result, requestedSymbols } = await runWithProvider(provider);

		expect(result).toMatchObject({ ok: false, reason: 'mep-rate-source-unavailable' });
		expect(requestedSymbols).toEqual(['AL30', 'AL30D']);
	});

	test('does not start a retry pass whose cool-down would reach the cut-off', async () => {
		const provider = { ...createHealthyProvider(), AAPL: 'http-error' as const };
		// The main pass ends at 24:30 of run time; the 30 s cool-down would end at the cut-off.
		const timeline = await recordRunTimeline(provider, {
			retryCutoffMs: RETRY_CUTOFF_MS,
			readClock: (events) =>
				events.includes('request NEW') ? '2026-10-01T15:24:30Z' : RAN_AT,
		});

		expect(timeline.slice(-7)).toEqual([
			'request NEW',
			'line 3/3 new-stock-byma-ars available',
			'retry stopped: apple-cedear-byma-ars',
			'line 2/3 apple-cedear-byma-ars unavailable fetch-failed',
			...WATCH,
		]);
		expect(timeline.filter((event) => event === 'request AAPL')).toHaveLength(1);
	});

	test('retries just before the cut-off', async () => {
		const provider = {
			...createHealthyProvider(),
			AAPL: { sequence: ['http-error', ggalPesoBars] as const },
		};
		// The 30 s cool-down ends one second before the cut-off.
		const timeline = await recordRunTimeline(provider, {
			retryCutoffMs: RETRY_CUTOFF_MS,
			readClock: (events) =>
				events.includes('request NEW') ? '2026-10-01T15:24:29Z' : RAN_AT,
		});

		expect(timeline.slice(-5)).toEqual([
			'request AAPL',
			'line 2/3 apple-cedear-byma-ars available',
			...WATCH,
		]);
	});

	test('stops a retry pass at the cut-off and keeps the rest failed', async () => {
		const provider = {
			...createHealthyProvider(),
			GGAL: { sequence: ['http-error', ggalPesoBars] as const },
			AAPL: { sequence: ['http-error', ggalPesoBars] as const },
		};
		// GGAL's retry ends at 24:58 of run time; the 2 s pause before AAPL would end at the cut-off.
		const timeline = await recordRunTimeline(provider, {
			retryCutoffMs: RETRY_CUTOFF_MS,
			readClock: (events) => {
				const ggalRequestCount = events.filter((event) => event === 'request GGAL').length;
				return ggalRequestCount === 2 ? '2026-10-01T15:24:58Z' : RAN_AT;
			},
		});

		expect(timeline.slice(-8)).toEqual([
			'pause 30000',
			'request GGAL',
			'line 1/3 galicia-stock-byma-ars available',
			'retry stopped: apple-cedear-byma-ars',
			'line 2/3 apple-cedear-byma-ars unavailable fetch-failed',
			...WATCH,
		]);
		expect(timeline.filter((event) => event === 'request AAPL')).toHaveLength(1);
	});
});

/**
 * Provider requests, pauses and progress reports, interleaved in the order they happened. The run's
 * clock can be derived from that timeline, to place a step at a given run time.
 */
async function recordRunTimeline(
	provider: FakeProvider,
	options: Readonly<{
		requestedThroughSession?: string;
		retryCutoffMs?: number;
		readClock?: (timeline: readonly string[]) => string;
	}> = {},
): Promise<readonly string[]> {
	const {
		requestedThroughSession = REQUESTED_THROUGH_SESSION,
		retryCutoffMs = Number.POSITIVE_INFINITY,
		readClock = () => RAN_AT,
	} = options;
	const timeline: string[] = [];
	const storage: AnalysisSnapshotStorage = {
		write: () => Promise.resolve({ ok: true, locations: ['memory'] }),
	};
	const runner = createAnalysisRunner(storage, {
		...createRunnerOptions(provider, (symbol) => timeline.push(`request ${symbol}`)),
		pause: (milliseconds) => {
			timeline.push(`pause ${milliseconds}`);
			return Promise.resolve();
		},
		getCurrentInstant: () => readClock(timeline),
		retryCutoffMs,
		reportProgress: (progress) => timeline.push(describeProgress(progress)),
	});

	await runner.run({ requestedThroughSession });

	return timeline;
}

function describeProgress(progress: AnalysisRunProgress): string {
	if (progress.type === 'run-started') {
		return `run-started ${progress.requestedThroughSession} lines=${progress.analyzedLineCount} configuration=${progress.analysisConfigurationVersion}`;
	}

	if (progress.type === 'mep-rate-source-fetched') {
		return `mep-rate-source-fetched ${progress.latestRateSessionDate}`;
	}

	if (progress.type === 'fetch-retry-started') {
		const { scope, retry, retryCount, coolDownMs, failures } = progress;
		const lineIds = failures.map((failure) => failure.tradingLineId).join(', ');
		return `retry ${scope} ${retry}/${retryCount} cool-down ${coolDownMs}: ${lineIds}`;
	}

	if (progress.type === 'fetch-retry-stopped') {
		return `retry stopped: ${progress.tradingLineIds.join(', ')}`;
	}

	if (progress.type === 'corporate-action-watch-checked') {
		const { watch } = progress;
		const candidateLineIds =
			watch.status === 'available'
				? watch.candidates.map((candidate) => candidate.tradingLineId)
				: [];
		return `corporate-action-watch ${watch.status}: ${candidateLineIds.join(', ')}`;
	}

	const { line, position, analyzedLineCount } = progress;
	const outcome = line.status === 'available' ? 'available' : `unavailable ${line.reason}`;
	return `line ${position}/${analyzedLineCount} ${line.tradingLineId} ${outcome}`;
}

type ProviderResponse =
	| readonly DailyBar[]
	| 'http-error'
	| 'http-not-found'
	| 'not-json'
	| 'provider-error'
	| 'malformed-history'
	| 'no-data';
/** Answers each request for a symbol with the next response; the last one repeats. */
type ProviderSequence = Readonly<{ sequence: readonly ProviderResponse[] }>;
type FakeProvider = Readonly<Record<string, ProviderResponse | ProviderSequence>>;
type RelevantFactsRow = Readonly<{
	especie: string;
	fecha: string;
	tipoArchivo: 'pdf';
	descarga: number;
	referencia: string;
	emisor: string;
}>;
type FakeRelevantFacts = readonly RelevantFactsRow[] | 'http-error';

function createHealthyProvider(): FakeProvider {
	return {
		GGAL: ggalPesoBars,
		AAPL: ggalPesoBars,
		NEW: convertDollarBarsToPeso(shortHistoryDollarBars),
		AL30: al30Bars,
		AL30D: al30dBars,
	};
}

async function runWithProvider(
	provider: FakeProvider,
	requestedThroughSession = REQUESTED_THROUGH_SESSION,
	corporateActions: readonly CorporateAction[] = [],
	relevantFacts: FakeRelevantFacts = [],
): Promise<
	Readonly<{
		result: AnalysisRunResult;
		writes: readonly AnalysisSnapshot[];
		requestedSymbols: readonly string[];
	}>
> {
	const writes: AnalysisSnapshot[] = [];
	const requestedSymbols: string[] = [];
	const storage: AnalysisSnapshotStorage = {
		write: (snapshot) => {
			writes.push(snapshot);
			return Promise.resolve({ ok: true, locations: ['memory'] });
		},
	};
	const runner = createAnalysisRunner(storage, {
		...createRunnerOptions(provider, (symbol) => requestedSymbols.push(symbol), relevantFacts),
		corporateActions,
	});
	const result = await runner.run({ requestedThroughSession });

	return { result, writes, requestedSymbols };
}

function createRunnerOptions(
	provider: FakeProvider,
	recordRequest: (symbol: string) => void = () => {},
	relevantFacts: FakeRelevantFacts = [],
) {
	const requestCounts = new Map<string, number>();

	return {
		fetchFromProvider: (input: string | URL | Request) => {
			const url = new URL(input instanceof Request ? input.url : input);

			if (url.href === RELEVANT_FACTS_URL) {
				recordRequest('relevant-facts');
				return Promise.resolve(createRelevantFactsResponse(relevantFacts));
			}

			const symbol = url.searchParams.get('symbol')!.replace(' 24HS', '');
			const requestIndex = requestCounts.get(symbol) ?? 0;
			requestCounts.set(symbol, requestIndex + 1);
			recordRequest(symbol);
			return Promise.resolve(
				createProviderResponse(selectProviderResponse(provider[symbol], requestIndex)),
			);
		},
		pause: () => Promise.resolve(),
		getCurrentInstant: () => RAN_AT,
		catalog,
		corporateActions: [] as readonly CorporateAction[],
	};
}

function createRelevantFactsResponse(relevantFacts: FakeRelevantFacts): Response {
	if (relevantFacts === 'http-error') {
		return new Response(null, { status: 500 });
	}

	return Response.json({
		content: { total_elements_count: relevantFacts.length },
		data: relevantFacts,
	});
}

function selectProviderResponse(
	entry: ProviderResponse | ProviderSequence | undefined,
	requestIndex: number,
): ProviderResponse | undefined {
	const isSequence = typeof entry === 'object' && 'sequence' in entry;

	if (!isSequence) {
		return entry;
	}

	const lastIndex = entry.sequence.length - 1;
	return entry.sequence[Math.min(requestIndex, lastIndex)];
}

function createProviderResponse(response: ProviderResponse | undefined): Response {
	if (!response || response === 'http-error') {
		return new Response(null, { status: 500 });
	}

	if (response === 'http-not-found') {
		return new Response(null, { status: 404 });
	}

	if (response === 'not-json') {
		return new Response('<html>maintenance</html>');
	}

	if (response === 'provider-error') {
		return Response.json({ s: 'error', t: [], o: [], h: [], l: [], c: [], v: [] });
	}

	if (response === 'malformed-history') {
		return Response.json({ s: 'ok', t: [1_788_404_400] });
	}

	if (response === 'no-data') {
		return Response.json({ s: 'no_data', t: [], o: [], h: [], l: [], c: [], v: [] });
	}

	return Response.json({
		s: 'ok',
		t: response.map((bar) => convertSessionDateToEpochSeconds(bar.sessionDate)),
		o: response.map((bar) => bar.open),
		h: response.map((bar) => bar.high),
		l: response.map((bar) => bar.low),
		c: response.map((bar) => bar.close),
		v: response.map((bar) => bar.volume),
	});
}

function convertSessionDateToEpochSeconds(sessionDate: string): number {
	const zonedMidnight = Temporal.PlainDate.from(sessionDate).toZonedDateTime(
		'America/Argentina/Buenos_Aires',
	);
	return zonedMidnight.epochMilliseconds / 1_000;
}

function createTestCatalog(): InstrumentCatalog {
	const creation = createInstrumentCatalog({
		schemaVersion: 1,
		instruments: [
			createInstrument('galicia-stock', 'stock', [['galicia-stock-byma-ars', 'GGAL', 'ARS']]),
			{
				...createInstrument('apple-stock', 'stock', []),
				tradingLines: [
					{
						id: 'apple-stock-nasdaq-usd',
						symbol: 'AAPL-NASDAQ',
						exchange: 'NASDAQ',
						currency: 'USD',
					},
				],
			},
			{
				...createInstrument('apple-cedear', 'cedear', [
					['apple-cedear-byma-ars', 'AAPL', 'ARS'],
				]),
				underlying: { market: 'NASDAQ', ticker: 'AAPL' },
			},
			createInstrument('new-stock', 'stock', [['new-stock-byma-ars', 'NEW', 'ARS']]),
			createInstrument('galicia-dollar-line', 'stock', [
				['galicia-stock-byma-usd-mep', 'GGALD', 'USD'],
			]),
			createInstrument('al30-bond', 'bond', [
				['al30-bond-byma-ars', 'AL30', 'ARS'],
				['al30-bond-byma-usd-mep', 'AL30D', 'USD'],
			]),
		],
	});

	if (!creation.ok) {
		throw new Error('The test Instrument Catalog is invalid.');
	}

	return creation.catalog;
}

function createInstrument(
	id: string,
	type: 'stock' | 'cedear' | 'bond',
	tradingLines: readonly (readonly [string, string, 'ARS' | 'USD'])[],
) {
	return {
		id,
		type,
		tradingLines: tradingLines.map(([lineId, symbol, currency]) => ({
			id: lineId,
			symbol,
			exchange: 'BYMA',
			currency,
		})),
	};
}

function createFlatBar(sessionDate: string, price: number): DailyBar {
	return { sessionDate, open: price, high: price, low: price, close: price, volume: 1 };
}

function replaceBar(
	bars: readonly DailyBar[],
	sessionDate: string,
	changes: Partial<DailyBar>,
): readonly DailyBar[] {
	return bars.map((bar) => (bar.sessionDate === sessionDate ? { ...bar, ...changes } : bar));
}

function selectMepRate(sessionDate: string): number {
	if (sessionDate < '2026-01-01') {
		return 1024;
	}

	if (sessionDate < '2026-09-15') {
		return 2048;
	}

	return 4096;
}

/** The fixture's dollar close ratio from the previous session to `sessionDate`. */
function measureFixtureCloseRatio(sessionDate: string): number {
	const index = ggalDollarBars.findIndex((bar) => bar.sessionDate === sessionDate);
	return ggalDollarBars[index]!.close / ggalDollarBars[index - 1]!.close;
}

function convertDollarBarsToPeso(bars: readonly DailyBar[]): readonly DailyBar[] {
	return bars.map((bar) => scaleBarPrices(bar, selectMepRate(bar.sessionDate)));
}

function scaleBarPrices(bar: DailyBar, factor: number): DailyBar {
	return {
		...bar,
		open: bar.open * factor,
		high: bar.high * factor,
		low: bar.low * factor,
		close: bar.close * factor,
	};
}

function selectLine(result: AnalysisRunResult, tradingLineId: string): AnalyzedLine {
	if (!result.ok) {
		throw new Error(`Expected a successful run, got ${result.reason}: ${result.message}`);
	}

	const line = result.snapshot.analyzedLines.find(
		(candidate) => candidate.tradingLineId === tradingLineId,
	);

	if (!line) {
		throw new Error(`Expected ${tradingLineId} in the snapshot.`);
	}

	return line;
}

function selectAvailableLine(result: AnalysisRunResult, tradingLineId: string) {
	const line = selectLine(result, tradingLineId);

	if (line.status !== 'available') {
		throw new Error(`Expected ${tradingLineId} to be available, got ${line.reason}.`);
	}

	return line;
}
