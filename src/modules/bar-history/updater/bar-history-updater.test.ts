import { describe, expect, test } from 'bun:test';

import { createBarHistoryUpdater } from './bar-history-updater.ts';

import type { Logger } from '#modules/logger/index.ts';
import type { OpenBymadataPanel } from '../adapters/index.ts';
import type { BarHistory, DailyBar } from '../bar-history.types.ts';
import type {
	BarHistoryStorage,
	BarHistoryStorageFailure,
	BarHistoryStorageReadResult,
} from '../storage/index.ts';
import type { BarHistoryUpdateLogger, UpdateBarHistoryLine } from './bar-history-updater.types.ts';

const AAPL = createTradingLine('cedear-aapl-ars', 'AAPL', 'cedears');
const MSFT = createTradingLine('cedear-msft-ars', 'MSFT', 'cedears');
const NVDA = createTradingLine('cedear-nvda-ars', 'NVDA', 'cedears');
const GGAL = createTradingLine('equity-ggal-ars', 'GGAL', 'leading-equity');
const REQUESTED_THROUGH_SESSION = '2026-09-07';
const CHECKED_AT = '2026-09-07T21:10:00Z';

describe('createBarHistoryUpdater', () => {
	test('updates a mixed batch in request order while sharing panel fetches', async () => {
		const storage = createFakeStorage({
			[MSFT.tradingLineId]: createHistory(MSFT, '2026-09-06'),
			[NVDA.tradingLineId]: createHistory(NVDA, '2026-09-06'),
			[GGAL.tradingLineId]: createHistory(GGAL, REQUESTED_THROUGH_SESSION),
			'cedear-amzn-ars': createStorageFailure('unreadable', 'The bucket is unavailable.'),
		});
		const provider = createFakeProvider({
			histories: { 'AAPL 24HS': [createBar(REQUESTED_THROUGH_SESSION)] },
			panels: {
				cedears: [createPanelRow('MSFT', { close: 104, high: 105 })],
			},
		});
		const logger = createFakeLogger();
		const updater = createUpdater(storage, provider, logger);

		const result = await updater.update({
			requestedThroughSession: REQUESTED_THROUGH_SESSION,
			lines: [
				createUpdateLine(AAPL, 'initial-backfill'),
				createUpdateLine(
					createTradingLine('cedear-amzn-ars', 'AMZN', 'cedears'),
					'ordinary-refresh',
				),
				createUpdateLine(MSFT, 'ordinary-refresh'),
				createUpdateLine(NVDA, 'ordinary-refresh'),
				createUpdateLine(GGAL, 'catch-up'),
			],
		});

		expect(result).toMatchObject({
			ok: true,
			results: [
				{ tradingLineId: AAPL.tradingLineId, status: 'created' },
				{ tradingLineId: 'cedear-amzn-ars', status: 'failed', reason: 'unreadable' },
				{ tradingLineId: MSFT.tradingLineId, status: 'updated' },
				{
					tradingLineId: NVDA.tradingLineId,
					status: 'failed',
					reason: 'missing-provider-line',
				},
				{ tradingLineId: GGAL.tradingLineId, status: 'unchanged' },
			],
		});
		expect(provider.calls.filter((url) => url.endsWith('/cedears'))).toHaveLength(1);
		expect(provider.calls.filter((url) => url.includes('/history?'))).toHaveLength(1);
		expect(storage.writeCalls.map((history) => history.tradingLineId).toSorted()).toEqual(
			[AAPL.tradingLineId, MSFT.tradingLineId].toSorted(),
		);
	});

	test('rejects invalid and duplicate requests before performing work', async () => {
		const storage = createFakeStorage({});
		const provider = createFakeProvider({});
		const logger = createFakeLogger();
		let clockCalls = 0;
		const updater = createBarHistoryUpdater(storage, logger.logger, {
			fetchFromProvider: provider.fetch,
			pause: async () => {},
			getCurrentInstant: () => {
				clockCalls += 1;
				return CHECKED_AT;
			},
		});

		const invalidResult = await updater.update({
			requestedThroughSession: '2026-02-30',
			lines: [createUpdateLine(AAPL, 'initial-backfill')],
		});
		const duplicateResult = await updater.update({
			requestedThroughSession: REQUESTED_THROUGH_SESSION,
			lines: [
				createUpdateLine(AAPL, 'initial-backfill'),
				createUpdateLine(AAPL, 'initial-backfill'),
			],
		});
		const blankResult = await updater.update({
			requestedThroughSession: REQUESTED_THROUGH_SESSION,
			lines: [
				createUpdateLine(createTradingLine('   ', 'AAPL', 'cedears'), 'initial-backfill'),
			],
		});

		expect(invalidResult).toMatchObject({ ok: false, reason: 'invalid-request' });
		expect(duplicateResult).toMatchObject({ ok: false, reason: 'invalid-request' });
		expect(blankResult).toMatchObject({ ok: false, reason: 'invalid-request' });
		expect(storage.readCalls).toEqual([]);
		expect(storage.writeCalls).toEqual([]);
		expect(provider.calls).toEqual([]);
		expect(logger.calls).toEqual([]);
		expect(clockCalls).toBe(0);
	});

	test('accepts an empty batch without performing work', async () => {
		const storage = createFakeStorage({});
		const provider = createFakeProvider({});
		const logger = createFakeLogger();
		const updater = createUpdater(storage, provider, logger);

		const result = await updater.update({
			lines: [],
			requestedThroughSession: REQUESTED_THROUGH_SESSION,
		});

		expect(result).toEqual({ ok: true, results: [] });
		expect(storage.readCalls).toEqual([]);
		expect(storage.writeCalls).toEqual([]);
		expect(provider.calls).toEqual([]);
	});

	test('isolates mode conflicts while updating eligible lines', async () => {
		const sourceDriftHistory = {
			...createHistory(GGAL, '2026-09-06'),
			source: { provider: 'open-bymadata' as const, symbol: 'SOMEONE-ELSE 24HS' },
		};
		const storage = createFakeStorage({
			[AAPL.tradingLineId]: createHistory(AAPL, '2026-09-06'),
			[MSFT.tradingLineId]: createHistory(MSFT, '2026-09-06'),
			[GGAL.tradingLineId]: sourceDriftHistory,
		});
		const provider = createFakeProvider({
			panels: { cedears: [createPanelRow('MSFT')] },
		});
		const logger = createFakeLogger();
		const updater = createUpdater(storage, provider, logger);

		const result = await updater.update({
			requestedThroughSession: REQUESTED_THROUGH_SESSION,
			lines: [
				createUpdateLine(AAPL, 'initial-backfill'),
				createUpdateLine(NVDA, 'catch-up'),
				createUpdateLine(GGAL, 'ordinary-refresh'),
				createUpdateLine(MSFT, 'ordinary-refresh'),
			],
		});

		expect(result).toMatchObject({
			ok: true,
			results: [
				{ tradingLineId: AAPL.tradingLineId, status: 'failed', reason: 'mode-conflict' },
				{ tradingLineId: NVDA.tradingLineId, status: 'failed', reason: 'not-found' },
				{
					tradingLineId: GGAL.tradingLineId,
					status: 'failed',
					reason: 'source-mismatch',
				},
				{ tradingLineId: MSFT.tradingLineId, status: 'updated' },
			],
		});
		expect(provider.calls).toHaveLength(1);
		expect(storage.writeCalls).toHaveLength(1);
	});

	test('reports stale sessions as failures instead of normal no-ops', async () => {
		const staleHistorySession = '2026-09-08';
		const storage = createFakeStorage({
			[AAPL.tradingLineId]: createHistory(AAPL, staleHistorySession),
			[MSFT.tradingLineId]: createHistory(MSFT, staleHistorySession),
		});
		const provider = createFakeProvider({});
		const logger = createFakeLogger();
		const updater = createUpdater(storage, provider, logger);

		const result = await updater.update({
			requestedThroughSession: REQUESTED_THROUGH_SESSION,
			lines: [createUpdateLine(AAPL, 'catch-up'), createUpdateLine(MSFT, 'ordinary-refresh')],
		});

		expect(result).toMatchObject({
			ok: true,
			results: [
				{
					tradingLineId: AAPL.tradingLineId,
					status: 'failed',
					reason: 'check-progress-regression',
				},
				{
					tradingLineId: MSFT.tradingLineId,
					status: 'failed',
					reason: 'check-progress-regression',
				},
			],
		});
		expect(provider.calls).toEqual([]);
		expect(storage.writeCalls).toEqual([]);
	});

	test('advances progress for a no-trade session without inventing a bar', async () => {
		const existingHistory = createHistory(AAPL, '2026-09-06');
		const storage = createFakeStorage({ [AAPL.tradingLineId]: existingHistory });
		const provider = createFakeProvider({
			panels: {
				cedears: [
					createPanelRow('AAPL', {
						openingPrice: 0,
						tradingHighPrice: 0,
						tradingLowPrice: 0,
						closingPrice: 102,
						volume: 0,
					}),
				],
			},
		});
		const logger = createFakeLogger();
		const updater = createUpdater(storage, provider, logger);

		const result = await updater.update({
			requestedThroughSession: REQUESTED_THROUGH_SESSION,
			lines: [createUpdateLine(AAPL, 'ordinary-refresh')],
		});

		expect(result).toMatchObject({ ok: true, results: [{ status: 'updated' }] });
		expect(storage.writeCalls[0]).toMatchObject({
			checkedThroughSession: REQUESTED_THROUGH_SESSION,
			bars: existingHistory.bars,
		});
	});

	test('stores every catch-up bar and skips already-covered repeated work', async () => {
		const storage = createFakeStorage({
			[AAPL.tradingLineId]: createHistory(AAPL, '2026-09-05'),
			[MSFT.tradingLineId]: createHistory(MSFT, REQUESTED_THROUGH_SESSION),
		});
		const provider = createFakeProvider({
			histories: {
				'AAPL 24HS': [createBar('2026-09-06'), createBar(REQUESTED_THROUGH_SESSION)],
			},
		});
		const logger = createFakeLogger();
		const updater = createUpdater(storage, provider, logger);

		const result = await updater.update({
			requestedThroughSession: REQUESTED_THROUGH_SESSION,
			lines: [createUpdateLine(AAPL, 'catch-up'), createUpdateLine(MSFT, 'ordinary-refresh')],
		});

		expect(result).toMatchObject({
			ok: true,
			results: [{ status: 'updated' }, { status: 'unchanged' }],
		});
		expect(storage.writeCalls).toHaveLength(1);
		expect(storage.writeCalls[0]?.checkedThroughSession).toBe(REQUESTED_THROUGH_SESSION);
		expect(storage.writeCalls[0]?.bars.map((bar) => bar.sessionDate)).toEqual([
			'2026-09-05',
			'2026-09-06',
			REQUESTED_THROUGH_SESSION,
		]);
		expect(provider.calls).toHaveLength(1);
	});

	test('logs only corrections whose replacement was stored successfully', async () => {
		const aaplHistory = createHistory(AAPL, REQUESTED_THROUGH_SESSION, [
			createBar('2026-09-05'),
			createBar('2026-09-06'),
			createBar(REQUESTED_THROUGH_SESSION),
		]);
		const msftHistory = createHistory(MSFT, REQUESTED_THROUGH_SESSION, [
			createBar('2026-09-06'),
		]);
		const storage = createFakeStorage(
			{
				[AAPL.tradingLineId]: aaplHistory,
				[MSFT.tradingLineId]: msftHistory,
			},
			new Set([MSFT.tradingLineId]),
		);
		const correctedAaplBar = createBar('2026-09-06', { close: 104, high: 105 });
		const correctedMsftBar = createBar('2026-09-06', { close: 104, high: 105 });
		const provider = createFakeProvider({
			histories: {
				'AAPL 24HS': [
					createBar('2026-09-05'),
					correctedAaplBar,
					createBar(REQUESTED_THROUGH_SESSION),
				],
				'MSFT 24HS': [correctedMsftBar],
			},
		});
		const logger = createFakeLogger();
		const updater = createUpdater(storage, provider, logger);

		const result = await updater.update({
			requestedThroughSession: REQUESTED_THROUGH_SESSION,
			lines: [
				createUpdateLine(AAPL, 'reconciliation'),
				createUpdateLine(MSFT, 'reconciliation'),
			],
		});

		expect(result).toMatchObject({
			ok: true,
			results: [
				{ status: 'updated', corrections: [{ sessionDate: '2026-09-06' }] },
				{ status: 'failed', reason: 'write-failed' },
			],
		});
		expect(logger.calls).toEqual([
			[
				{
					event: 'market-history-correction',
					tradingLineId: AAPL.tradingLineId,
					sessionDate: '2026-09-06',
					previousBar: createBar('2026-09-06'),
					correctedBar: correctedAaplBar,
				},
				'Market history correction accepted.',
			],
		]);
	});

	test('does not write or log a correction when reconciliation fails', async () => {
		const existingHistory = createHistory(AAPL, REQUESTED_THROUGH_SESSION, [
			createBar('2026-09-05'),
			createBar('2026-09-06'),
			createBar(REQUESTED_THROUGH_SESSION),
		]);
		const storage = createFakeStorage({ [AAPL.tradingLineId]: existingHistory });
		const provider = createFakeProvider({
			histories: {
				'AAPL 24HS': [createBar('2026-09-05'), createBar(REQUESTED_THROUGH_SESSION)],
			},
		});
		const logger = createFakeLogger();
		const updater = createUpdater(storage, provider, logger);

		const result = await updater.update({
			requestedThroughSession: REQUESTED_THROUGH_SESSION,
			lines: [createUpdateLine(AAPL, 'reconciliation')],
		});

		expect(result).toMatchObject({
			ok: true,
			results: [{ status: 'failed', reason: 'history-shrinkage' }],
		});
		expect(storage.writeCalls).toEqual([]);
		expect(logger.calls).toEqual([]);
	});
});

function createUpdater(
	storage: BarHistoryStorage,
	provider: ReturnType<typeof createFakeProvider>,
	logger: ReturnType<typeof createFakeLogger>,
) {
	return createBarHistoryUpdater(storage, logger.logger, {
		fetchFromProvider: provider.fetch,
		pause: async () => {},
		getCurrentInstant: () => CHECKED_AT,
	});
}

function createFakeStorage(
	values: Readonly<Record<string, BarHistory | BarHistoryStorageFailure>>,
	failingWrites = new Set<string>(),
): BarHistoryStorage & {
	readCalls: string[];
	writeCalls: BarHistory[];
} {
	const storedValues = new Map(Object.entries(values));
	const readCalls: string[] = [];
	const writeCalls: BarHistory[] = [];

	return {
		readCalls,
		writeCalls,
		read: async (tradingLineId): Promise<BarHistoryStorageReadResult> => {
			readCalls.push(tradingLineId);
			const value = storedValues.get(tradingLineId);

			if (!value) {
				return createStorageFailure('not-found', 'No stored Bar History exists.');
			}

			return 'schemaVersion' in value ? { ok: true, history: value } : value;
		},
		write: async (history) => {
			writeCalls.push(history);

			if (failingWrites.has(history.tradingLineId)) {
				return createStorageFailure('write-failed', 'Replacement failed.');
			}

			storedValues.set(history.tradingLineId, history);
			return { ok: true, history };
		},
	};
}

function createFakeProvider(config: {
	histories?: Readonly<Record<string, readonly DailyBar[]>>;
	panels?: Partial<Readonly<Record<OpenBymadataPanel, readonly unknown[]>>>;
}) {
	const calls: string[] = [];

	return {
		calls,
		fetch: async (input: string | URL | Request): Promise<Response> => {
			const url = input instanceof Request ? input.url : String(input);
			calls.push(url);

			if (url.includes('/history?')) {
				const symbol = new URL(url).searchParams.get('symbol') ?? '';
				const bars = config.histories?.[symbol];
				return bars
					? createJsonResponse(createHistoryPayload(bars))
					: createJsonResponse({}, 500);
			}

			const panel = url.split('/').at(-1) as OpenBymadataPanel;
			const rows = config.panels?.[panel];
			return rows ? createJsonResponse(rows) : createJsonResponse({}, 500);
		},
	};
}

function createFakeLogger(): { logger: BarHistoryUpdateLogger; calls: unknown[][] } {
	const calls: unknown[][] = [];
	const info = ((...arguments_: unknown[]) => {
		calls.push(arguments_);
	}) as Logger['info'];

	return { logger: { info }, calls };
}

function createTradingLine(tradingLineId: string, symbol: string, panel: OpenBymadataPanel) {
	return { tradingLineId, symbol, panel } as const;
}

function createUpdateLine(
	tradingLine: typeof AAPL,
	mode: UpdateBarHistoryLine['mode'],
): UpdateBarHistoryLine {
	return { tradingLine, mode };
}

function createHistory(
	tradingLine: typeof AAPL,
	checkedThroughSession: string,
	bars: readonly DailyBar[] = [createBar(checkedThroughSession)],
): BarHistory {
	return {
		schemaVersion: 1,
		tradingLineId: tradingLine.tradingLineId,
		source: { provider: 'open-bymadata', symbol: `${tradingLine.symbol} 24HS` },
		priceAdjustment: 'none',
		backfilledAt: '2026-09-01T21:10:00Z',
		lastReconciledAt: null,
		checkedThroughSession,
		bars,
	};
}

function createBar(sessionDate: string, overrides: Partial<DailyBar> = {}): DailyBar {
	return {
		sessionDate,
		open: 100,
		high: 103,
		low: 99,
		close: 102,
		volume: 1_000,
		...overrides,
	};
}

function createPanelRow(symbol: string, overrides: Readonly<Record<string, number>> = {}) {
	return {
		symbol,
		openingPrice: 100,
		tradingHighPrice: 103,
		tradingLowPrice: 99,
		closingPrice: 102,
		volume: 1_000,
		...overrides,
	};
}

function createHistoryPayload(bars: readonly DailyBar[]) {
	return {
		s: 'ok',
		t: bars.map((bar) => toEpochSeconds(bar.sessionDate)),
		o: bars.map((bar) => bar.open),
		h: bars.map((bar) => bar.high),
		l: bars.map((bar) => bar.low),
		c: bars.map((bar) => bar.close),
		v: bars.map((bar) => bar.volume),
	};
}

function toEpochSeconds(sessionDate: string): number {
	return (
		Temporal.PlainDate.from(sessionDate)
			.toZonedDateTime('America/Argentina/Buenos_Aires')
			.toInstant().epochMilliseconds / 1_000
	);
}

function createJsonResponse(value: unknown, status = 200): Response {
	return Response.json(value, { status });
}

function createStorageFailure(
	reason: BarHistoryStorageFailure['reason'],
	message: string,
): BarHistoryStorageFailure {
	return { ok: false, reason, message, issues: [] };
}
