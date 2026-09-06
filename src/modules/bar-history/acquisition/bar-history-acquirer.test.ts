import { describe, expect, test } from 'bun:test';

import { createBarHistoryAcquirer } from './bar-history-acquirer.ts';

import type {
	OpenBymadataAdapter,
	OpenBymadataFailure,
	OpenBymadataHistoryRequest,
	OpenBymadataHistoryResult,
	OpenBymadataPanelRequest,
	OpenBymadataPanelResult,
	OpenBymadataTradingLineDescriptor,
} from '../adapters/index.ts';
import type { BarHistory, BarHistorySource } from '../bar-history.types.ts';
import type {
	BarHistoryAcquisitionLine,
	BarHistoryAcquisitionRequest,
} from './bar-history-acquirer.types.ts';

const AAPL = createTradingLine('cedear-aapl-ars', 'AAPL', 'cedears');
const MSFT = createTradingLine('cedear-msft-ars', 'MSFT', 'cedears');
const GGAL = createTradingLine('equity-ggal-ars', 'GGAL', 'leading-equity');
const THROUGH_SESSION = '2026-09-07';

describe('createBarHistoryAcquirer', () => {
	test('backfills from the explicit historical lower bound', async () => {
		const adapter = createFakeAdapter();
		const acquirer = createBarHistoryAcquirer(adapter.adapter, adapter.pause);

		const result = await acquirer.acquire({
			throughSession: THROUGH_SESSION,
			lines: [createLine(AAPL, null, 'initial-backfill')],
		});

		expect(adapter.historyRequests).toEqual([
			{
				tradingLine: AAPL,
				fromEpochSeconds: toEpochSeconds('2000-01-01'),
				toEpochSeconds: toEpochSeconds(THROUGH_SESSION),
				throughSession: THROUGH_SESSION,
			},
		]);
		expect(result).toMatchObject({
			ok: true,
			lines: [
				{
					status: 'available',
					tradingLineId: AAPL.tradingLineId,
					reconciliationWindow: null,
				},
			],
		});
	});

	test('catches up from the calendar day after each line check progress', async () => {
		const adapter = createFakeAdapter();
		const acquirer = createBarHistoryAcquirer(adapter.adapter, adapter.pause);

		await acquirer.acquire({
			throughSession: THROUGH_SESSION,
			lines: [createLine(AAPL, createHistory(AAPL, '2026-09-04'), 'catch-up')],
		});

		expect(adapter.historyRequests[0]).toMatchObject({
			fromEpochSeconds: toEpochSeconds('2026-09-05'),
			toEpochSeconds: toEpochSeconds(THROUGH_SESSION),
		});
	});

	test('returns the provider available historical window for reconciliation', async () => {
		const firstAvailableSession = '2026-09-03';
		const adapter = createFakeAdapter({
			fetchHistory: async (request) => ({
				ok: true,
				source: createSource(request.tradingLine),
				bars: [createDailyBar(firstAvailableSession), createDailyBar(THROUGH_SESSION)],
			}),
		});
		const acquirer = createBarHistoryAcquirer(adapter.adapter, adapter.pause);

		const result = await acquirer.acquire({
			throughSession: THROUGH_SESSION,
			lines: [createLine(AAPL, createHistory(AAPL, '2026-09-04'), 'reconciliation')],
		});

		expect(adapter.historyRequests[0]).toMatchObject({
			fromEpochSeconds: toEpochSeconds('2000-01-01'),
			toEpochSeconds: toEpochSeconds(THROUGH_SESSION),
		});
		expect(result).toMatchObject({
			ok: true,
			lines: [
				{
					status: 'available',
					reconciliationWindow: { start: firstAvailableSession, end: THROUGH_SESSION },
				},
			],
		});
	});

	test('keeps the requested reconciliation window when the provider returns no bars', async () => {
		const adapter = createFakeAdapter({
			fetchHistory: async (request) => ({
				ok: true,
				source: createSource(request.tradingLine),
				bars: [],
			}),
		});
		const acquirer = createBarHistoryAcquirer(adapter.adapter, adapter.pause);

		const result = await acquirer.acquire({
			throughSession: THROUGH_SESSION,
			lines: [createLine(AAPL, createHistory(AAPL, '2026-09-04'), 'reconciliation')],
		});

		expect(result).toMatchObject({
			ok: true,
			lines: [
				{
					status: 'available',
					reconciliationWindow: { start: '2000-01-01', end: THROUGH_SESSION },
				},
			],
		});
	});

	test('shares each ordinary refresh panel and preserves requested line order', async () => {
		const adapter = createFakeAdapter({
			fetchPanel: async (request) => ({
				ok: true,
				lines: request.tradingLines.map((tradingLine) => ({
					status: 'found' as const,
					tradingLineId: tradingLine.tradingLineId,
					source: createSource(tradingLine),
					bar: createDailyBar(THROUGH_SESSION),
				})),
			}),
		});
		const acquirer = createBarHistoryAcquirer(adapter.adapter, adapter.pause);

		const result = await acquirer.acquire({
			throughSession: THROUGH_SESSION,
			lines: [
				createLine(GGAL, createHistory(GGAL, '2026-09-04'), 'ordinary-refresh'),
				createLine(AAPL, createHistory(AAPL, '2026-09-04'), 'ordinary-refresh'),
				createLine(MSFT, createHistory(MSFT, '2026-09-04'), 'ordinary-refresh'),
			],
		});

		expect(adapter.panelRequests).toEqual([
			{ tradingLines: [GGAL], throughSession: THROUGH_SESSION },
			{ tradingLines: [AAPL, MSFT], throughSession: THROUGH_SESSION },
		]);
		expect(result).toMatchObject({
			ok: true,
			lines: [
				{ tradingLineId: GGAL.tradingLineId, bars: [{ sessionDate: THROUGH_SESSION }] },
				{ tradingLineId: AAPL.tradingLineId, bars: [{ sessionDate: THROUGH_SESSION }] },
				{ tradingLineId: MSFT.tradingLineId, bars: [{ sessionDate: THROUGH_SESSION }] },
			],
		});
	});

	test('paces historical requests sequentially and continues after a per-line failure', async () => {
		const events: string[] = [];
		const adapter = createFakeAdapter({
			fetchHistory: async (request) => {
				events.push(`history:${request.tradingLine.tradingLineId}`);

				if (request.tradingLine.tradingLineId === AAPL.tradingLineId) {
					return createProviderFailure('request-failed', 'Provider is unavailable.');
				}

				return createHistoryResult(request.tradingLine);
			},
			pause: async (milliseconds) => {
				events.push(`pause:${milliseconds}`);
			},
		});
		const acquirer = createBarHistoryAcquirer(adapter.adapter, adapter.pause);

		const result = await acquirer.acquire({
			throughSession: THROUGH_SESSION,
			lines: [
				createLine(AAPL, null, 'initial-backfill'),
				createLine(MSFT, null, 'initial-backfill'),
			],
		});

		expect(events).toEqual([
			`history:${AAPL.tradingLineId}`,
			'pause:2000',
			`history:${MSFT.tradingLineId}`,
		]);
		expect(result).toMatchObject({
			ok: true,
			lines: [
				{ status: 'failed', reason: 'request-failed' },
				{ status: 'available', tradingLineId: MSFT.tradingLineId },
			],
		});
	});

	test('treats a carried-close panel row as an empty candidate and a missing symbol as a failure', async () => {
		const adapter = createFakeAdapter({
			fetchPanel: async () => ({
				ok: true,
				lines: [
					{
						status: 'excluded',
						reason: 'no-trade-placeholder',
						tradingLineId: AAPL.tradingLineId,
						source: createSource(AAPL),
					},
					{
						status: 'missing',
						tradingLineId: MSFT.tradingLineId,
						source: createSource(MSFT),
					},
				],
			}),
		});
		const acquirer = createBarHistoryAcquirer(adapter.adapter, adapter.pause);

		const result = await acquirer.acquire({
			throughSession: THROUGH_SESSION,
			lines: [
				createLine(AAPL, createHistory(AAPL, '2026-09-04'), 'ordinary-refresh'),
				createLine(MSFT, createHistory(MSFT, '2026-09-04'), 'ordinary-refresh'),
			],
		});

		expect(result).toMatchObject({
			ok: true,
			lines: [
				{ status: 'available', tradingLineId: AAPL.tradingLineId, bars: [] },
				{
					status: 'failed',
					tradingLineId: MSFT.tradingLineId,
					reason: 'missing-provider-line',
				},
			],
		});
	});

	test('returns not-required without fetching an already covered line', async () => {
		const adapter = createFakeAdapter();
		const acquirer = createBarHistoryAcquirer(adapter.adapter, adapter.pause);

		const result = await acquirer.acquire({
			throughSession: THROUGH_SESSION,
			lines: [createLine(AAPL, createHistory(AAPL, THROUGH_SESSION), 'catch-up')],
		});

		expect(result).toEqual({
			ok: true,
			lines: [{ status: 'not-required', tradingLineId: AAPL.tradingLineId }],
		});
		expect(adapter.historyRequests).toEqual([]);
		expect(adapter.panelRequests).toEqual([]);
	});

	test('rejects invalid requests before calling the provider', async () => {
		const adapter = createFakeAdapter();
		const acquirer = createBarHistoryAcquirer(adapter.adapter, adapter.pause);
		const invalidRequest = {
			throughSession: '2026-02-30',
			lines: [
				createLine(AAPL, createHistory(AAPL, '2026-09-04'), 'ordinary-refresh'),
				createLine(AAPL, null, 'initial-backfill'),
				createLine(GGAL, createHistory(AAPL, '2026-09-04'), 'catch-up'),
			],
		} as unknown as BarHistoryAcquisitionRequest;

		const result = await acquirer.acquire(invalidRequest);

		expect(result).toMatchObject({
			ok: false,
			reason: 'invalid-request',
			issues: [
				{ code: 'invalid-date', path: 'throughSession' },
				{ code: 'invalid-value', path: 'lines[2].existingHistory.tradingLineId' },
				{ code: 'invalid-value', path: 'lines[1].tradingLine.tradingLineId' },
			],
		});
		expect(adapter.historyRequests).toEqual([]);
		expect(adapter.panelRequests).toEqual([]);
	});

	test('rejects source drift and regressing reconciliation before calling the provider', async () => {
		const adapter = createFakeAdapter();
		const acquirer = createBarHistoryAcquirer(adapter.adapter, adapter.pause);
		const historyWithSourceDrift = {
			...createHistory(AAPL, '2026-09-04'),
			source: { provider: 'open-bymadata' as const, symbol: 'MSFT 24HS' },
		};

		const sourceDriftResult = await acquirer.acquire({
			throughSession: THROUGH_SESSION,
			lines: [createLine(AAPL, historyWithSourceDrift, 'ordinary-refresh')],
		});
		const regressingReconciliationResult = await acquirer.acquire({
			throughSession: THROUGH_SESSION,
			lines: [createLine(GGAL, createHistory(GGAL, '2026-09-08'), 'reconciliation')],
		});

		expect(sourceDriftResult).toMatchObject({
			ok: false,
			reason: 'invalid-request',
			issues: [{ path: 'lines[0].existingHistory.source' }],
		});
		expect(regressingReconciliationResult).toMatchObject({
			ok: false,
			reason: 'invalid-request',
			issues: [{ path: 'lines[0].mode' }],
		});
		expect(adapter.historyRequests).toEqual([]);
		expect(adapter.panelRequests).toEqual([]);
	});
});

function createLine(
	tradingLine: OpenBymadataTradingLineDescriptor,
	existingHistory: BarHistory | null,
	mode: BarHistoryAcquisitionLine['mode'],
): BarHistoryAcquisitionLine {
	return { tradingLine, existingHistory, mode };
}

function createTradingLine(
	tradingLineId: string,
	symbol: string,
	panel: OpenBymadataTradingLineDescriptor['panel'],
): OpenBymadataTradingLineDescriptor {
	return { tradingLineId, symbol, panel };
}

function createHistory(
	tradingLine: OpenBymadataTradingLineDescriptor,
	checkedThroughSession: string,
): BarHistory {
	return {
		schemaVersion: 1,
		tradingLineId: tradingLine.tradingLineId,
		source: createSource(tradingLine),
		priceAdjustment: 'none',
		backfilledAt: '2026-09-03T21:10:00Z',
		lastReconciledAt: null,
		checkedThroughSession,
		bars: [],
	};
}

function createSource(tradingLine: OpenBymadataTradingLineDescriptor): BarHistorySource {
	return { provider: 'open-bymadata', symbol: `${tradingLine.symbol} 24HS` };
}

function createDailyBar(sessionDate: string) {
	return {
		sessionDate,
		open: 100,
		high: 103,
		low: 99,
		close: 102,
		volume: 1_000,
	};
}

function createHistoryResult(
	tradingLine: OpenBymadataTradingLineDescriptor,
): OpenBymadataHistoryResult {
	return { ok: true, source: createSource(tradingLine), bars: [createDailyBar(THROUGH_SESSION)] };
}

function createProviderFailure(
	reason: OpenBymadataFailure['reason'],
	message: string,
): OpenBymadataFailure {
	return { ok: false, reason, message };
}

type FakeAdapterOptions = Readonly<{
	fetchHistory?: (request: OpenBymadataHistoryRequest) => Promise<OpenBymadataHistoryResult>;
	fetchPanel?: (request: OpenBymadataPanelRequest) => Promise<OpenBymadataPanelResult>;
	pause?: (milliseconds: number) => Promise<void>;
}>;

function createFakeAdapter(options: FakeAdapterOptions = {}) {
	const historyRequests: OpenBymadataHistoryRequest[] = [];
	const panelRequests: OpenBymadataPanelRequest[] = [];
	const adapter: OpenBymadataAdapter = {
		fetchHistory: async (request) => {
			historyRequests.push(request);
			return options.fetchHistory?.(request) ?? createHistoryResult(request.tradingLine);
		},
		fetchPanel: async (request) => {
			panelRequests.push(request);
			return (
				(await options.fetchPanel?.(request)) ?? {
					ok: true,
					lines: [],
				}
			);
		},
	};

	return {
		adapter,
		historyRequests,
		panelRequests,
		pause: options.pause ?? (() => Promise.resolve()),
	};
}

function toEpochSeconds(sessionDate: string): number {
	return (
		Temporal.PlainDate.from(sessionDate).toZonedDateTime('America/Argentina/Buenos_Aires')
			.epochMilliseconds / 1_000
	);
}
