import { describe, expect, test } from 'bun:test';

import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';
import { dollarizeBarHistory } from '#modules/dollarized-series/index.ts';
import { createInstrumentCatalog } from '#modules/instrument-catalog/instrument-catalog.ts';
import { calculateInstrumentStates } from '#modules/instrument-state/index.ts';
import { loadGgalFixture } from '#modules/technical-analysis/tests/support/index.ts';

import { createAnalysisRunner } from './analysis-run.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { InstrumentCatalog } from '#modules/instrument-catalog/index.ts';
import type {
	AnalysisRunResult,
	AnalysisSnapshot,
	AnalysisSnapshotStorage,
	AnalyzedLine,
} from './analysis-run.types.ts';

const REQUESTED_THROUGH_SESSION = '2026-09-30';
// Noon in Buenos Aires on 2026-10-01, so 2026-09-30 is the latest completed session.
const RAN_AT = '2026-10-01T15:00:00Z';

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
			schemaVersion: 2,
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

	test('records a line whose bars fail validation as unavailable', async () => {
		const lastBar = ggalPesoBars.at(-1)!;
		const provider = {
			...createHealthyProvider(),
			AAPL: replaceBar(ggalPesoBars, lastBar.sessionDate, { close: lastBar.high * 2 }),
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
		expect(requestedSymbols).toEqual(['AL30', 'AL30D']);
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

	test('gives analyzed lines no zero-open exception', async () => {
		const provider = {
			...createHealthyProvider(),
			AAPL: replaceBar(ggalPesoBars, '2026-09-29', { open: 0 }),
		};
		const { result } = await runWithProvider(provider);

		expect(selectLine(result, 'apple-cedear-byma-ars')).toMatchObject({
			status: 'unavailable',
			reason: 'invalid-bars',
		});
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
		expect(ggal.rangeRepairSessions).toEqual([]);
		expect(result.ok && result.snapshot.mepRateSource.rangeRepairs).toEqual([
			{ tradingLineId: 'al30-bond-byma-ars', sessionDate: repairedSession },
		]);
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

type ProviderResponse = readonly DailyBar[] | 'http-error' | 'no-data';
type FakeProvider = Readonly<Record<string, ProviderResponse>>;

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
	const runner = createAnalysisRunner(storage, createRunnerOptions(provider, requestedSymbols));
	const result = await runner.run({ requestedThroughSession });

	return { result, writes, requestedSymbols };
}

function createRunnerOptions(provider: FakeProvider, requestedSymbols: string[] = []) {
	return {
		fetchFromProvider: (input: string | URL | Request) => {
			const url = new URL(input instanceof Request ? input.url : input);
			const symbol = url.searchParams.get('symbol')!.replace(' 24HS', '');
			requestedSymbols.push(symbol);
			return Promise.resolve(createProviderResponse(provider[symbol]));
		},
		pause: () => Promise.resolve(),
		getCurrentInstant: () => RAN_AT,
		catalog,
	};
}

function createProviderResponse(response: ProviderResponse | undefined): Response {
	if (!response || response === 'http-error') {
		return new Response(null, { status: 500 });
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
				underlyingInstrumentId: 'apple-stock',
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
