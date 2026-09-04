import { describe, expect, test } from 'bun:test';

import { reconcileBarHistory } from './bar-history.ts';

import type { BarHistory, DailyBar, ReconcileBarHistoryInput } from './bar-history.types.ts';

const source = {
	provider: 'open-bymadata',
	symbol: 'AAPL 24HS',
} as const;

describe('reconcileBarHistory', () => {
	test('creates an ordered history from an initial backfill', () => {
		const result = reconcileBarHistory(
			createInput({
				incomingBars: [createBar('2026-09-02'), createBar('2026-09-01')],
			}),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.status).toBe('created');
		expect(result.history).toEqual({
			schemaVersion: 1,
			tradingLineId: 'cedear-aapl-ars',
			source,
			priceAdjustment: 'none',
			backfilledAt: '2026-09-03T21:10:00Z',
			lastReconciledAt: null,
			checkedThroughSession: '2026-09-03',
			bars: [createBar('2026-09-01'), createBar('2026-09-02')],
		});
		expect(result.corrections).toEqual([]);
	});

	test('allows an initial check with no completed bars', () => {
		const result = reconcileBarHistory(createInput());

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.status).toBe('created');
		expect(result.history.bars).toEqual([]);
		expect(result.history.checkedThroughSession).toBe('2026-09-03');
	});

	test('returns the existing history for an identical repeated update', () => {
		const existingHistory = createHistory();
		const result = reconcileBarHistory(
			createInput({
				existingHistory,
				incomingBars: [createBar('2026-09-02')],
			}),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.status).toBe('unchanged');
		expect(result.history).toBe(existingHistory);
		expect(result.corrections).toEqual([]);
	});

	test('records a correction and replaces the stored values for that session', () => {
		const existingHistory = createHistory();
		const correctedBar = createBar('2026-09-02', { close: 104, high: 105 });
		const result = reconcileBarHistory(
			createInput({
				existingHistory,
				incomingBars: [correctedBar],
				reconciliationWindow: { start: '2026-09-02', end: '2026-09-03' },
			}),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.status).toBe('updated');
		expect(result.history.bars.at(-1)).toEqual(correctedBar);
		expect(result.corrections).toEqual([
			{
				sessionDate: '2026-09-02',
				previousBar: createBar('2026-09-02'),
				correctedBar,
			},
		]);
	});

	test('rejects changes to already-checked sessions outside reconciliation', () => {
		const existingHistory = createHistory({ bars: [createBar('2026-09-02')] });
		const changedBarResult = reconcileBarHistory(
			createInput({
				existingHistory,
				incomingBars: [createBar('2026-09-02', { close: 104, high: 105 })],
			}),
		);
		const newlyAppearingBarResult = reconcileBarHistory(
			createInput({
				existingHistory,
				incomingBars: [createBar('2026-09-01')],
			}),
		);

		expect(changedBarResult).toMatchObject({
			ok: false,
			reason: 'invalid-incoming-bars',
			previousHistory: existingHistory,
		});
		expect(newlyAppearingBarResult).toMatchObject({
			ok: false,
			reason: 'invalid-incoming-bars',
			previousHistory: existingHistory,
		});
	});

	test('advances check progress when the provider returns no new bar', () => {
		const existingHistory = createHistory();
		const result = reconcileBarHistory(
			createInput({
				existingHistory,
				incomingBars: [],
				throughSession: '2026-09-04',
			}),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.status).toBe('updated');
		expect(result.history.checkedThroughSession).toBe('2026-09-04');
		expect(result.history.bars).toEqual(existingHistory.bars);
	});

	test('preserves older bars during full authoritative reconciliation', () => {
		const existingHistory = createHistory({
			bars: [createBar('2026-08-29'), createBar('2026-09-01'), createBar('2026-09-02')],
		});
		const result = reconcileBarHistory(
			createInput({
				existingHistory,
				incomingBars: [createBar('2026-09-01'), createBar('2026-09-02')],
				reconciliationWindow: { start: '2026-09-01', end: '2026-09-03' },
			}),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.history.bars).toEqual(existingHistory.bars);
		expect(result.history.lastReconciledAt).toBe('2026-09-03T21:10:00Z');
	});

	test('rejects reconciliation when a stored session disappears from the window', () => {
		const existingHistory = createHistory();
		const result = reconcileBarHistory(
			createInput({
				existingHistory,
				incomingBars: [createBar('2026-09-01')],
				reconciliationWindow: { start: '2026-09-01', end: '2026-09-03' },
			}),
		);

		expect(result).toMatchObject({
			ok: false,
			status: 'failed',
			reason: 'history-shrinkage',
			previousHistory: existingHistory,
		});
	});

	test('rejects progress beyond the accepted reconciliation window', () => {
		const existingHistory = createHistory();
		const existingHistoryResult = reconcileBarHistory(
			createInput({
				existingHistory,
				incomingBars: existingHistory.bars,
				throughSession: '2026-09-04',
				reconciliationWindow: { start: '2026-09-01', end: '2026-09-02' },
			}),
		);
		const initialHistoryResult = reconcileBarHistory(
			createInput({
				incomingBars: [createBar('2026-09-01')],
				throughSession: '2026-09-04',
				reconciliationWindow: { start: '2026-09-01', end: '2026-09-01' },
			}),
		);

		expect(existingHistoryResult).toMatchObject({
			ok: false,
			reason: 'invalid-request',
			previousHistory: existingHistory,
		});
		expect(initialHistoryResult).toMatchObject({
			ok: false,
			reason: 'invalid-request',
			previousHistory: null,
		});
	});

	test('rejects all incoming bars when any one of them is invalid', () => {
		const existingHistory = createHistory();
		const invalidBar = createBar('2026-09-03', { high: 99, low: 101 });
		const result = reconcileBarHistory(
			createInput({
				existingHistory,
				incomingBars: [createBar('2026-09-02'), invalidBar],
			}),
		);

		expect(result).toMatchObject({
			ok: false,
			reason: 'invalid-incoming-bars',
			previousHistory: existingHistory,
		});
	});

	test('rejects identity, source, and progress mismatches', () => {
		const existingHistory = createHistory();
		const wrongTradingLine = reconcileBarHistory(
			createInput({ existingHistory, tradingLineId: 'cedear-msft-ars' }),
		);
		const wrongSource = reconcileBarHistory(
			createInput({
				existingHistory,
				source: { ...source, symbol: 'MSFT 24HS' },
			}),
		);
		const regressedProgress = reconcileBarHistory(
			createInput({ existingHistory, throughSession: '2026-09-01' }),
		);

		expect(wrongTradingLine).toMatchObject({ ok: false, reason: 'trading-line-mismatch' });
		expect(wrongSource).toMatchObject({ ok: false, reason: 'source-mismatch' });
		expect(regressedProgress).toMatchObject({
			ok: false,
			reason: 'check-progress-regression',
		});
	});

	test('rejects a bar later than the completed session cutoff', () => {
		const result = reconcileBarHistory(
			createInput({ incomingBars: [createBar('2026-09-04')] }),
		);

		expect(result).toMatchObject({
			ok: false,
			reason: 'invalid-incoming-bars',
		});
	});
});

function createInput(overrides: Partial<ReconcileBarHistoryInput> = {}): ReconcileBarHistoryInput {
	return {
		existingHistory: null,
		tradingLineId: 'cedear-aapl-ars',
		source,
		incomingBars: [],
		throughSession: '2026-09-03',
		checkedAt: '2026-09-03T21:10:00Z',
		reconciliationWindow: null,
		...overrides,
	};
}

function createHistory(overrides: Partial<BarHistory> = {}): BarHistory {
	return {
		schemaVersion: 1,
		tradingLineId: 'cedear-aapl-ars',
		source,
		priceAdjustment: 'none',
		backfilledAt: '2026-09-01T21:10:00Z',
		lastReconciledAt: null,
		checkedThroughSession: '2026-09-03',
		bars: [createBar('2026-09-01'), createBar('2026-09-02')],
		...overrides,
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
