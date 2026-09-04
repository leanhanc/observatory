import { describe, expect, test } from 'bun:test';

import {
	checkIfBarHistoriesAreEqual,
	findMissingStoredSessionDates,
	findOutOfWindowSessionDates,
	mergeDailyBars,
} from './bar-history-reconciler.ts';

import type { BarHistory, DailyBar } from '../../bar-history.types.ts';

describe('mergeDailyBars', () => {
	test('merges by session date and sorts oldest to newest', () => {
		const result = mergeDailyBars(
			[createBar('2026-09-02')],
			[createBar('2026-09-03'), createBar('2026-09-01')],
		);

		expect(result.bars.map((bar) => bar.sessionDate)).toEqual([
			'2026-09-01',
			'2026-09-02',
			'2026-09-03',
		]);
		expect(result.corrections).toEqual([]);
	});

	test('reports changed values as a correction without mutating inputs', () => {
		const existingBar = createBar('2026-09-02');
		const correctedBar = createBar('2026-09-02', { close: 103 });
		const result = mergeDailyBars([existingBar], [correctedBar]);

		expect(result.corrections).toEqual([
			{
				sessionDate: '2026-09-02',
				previousBar: existingBar,
				correctedBar,
			},
		]);
		expect(result.bars[0]).not.toBe(existingBar);
		expect(result.bars[0]).not.toBe(correctedBar);
	});
});

describe('authoritative reconciliation helpers', () => {
	test('finds stored sessions missing only inside the requested window', () => {
		const missingDates = findMissingStoredSessionDates(
			[createBar('2026-08-29'), createBar('2026-09-01'), createBar('2026-09-02')],
			[createBar('2026-09-01')],
			{ start: '2026-09-01', end: '2026-09-02' },
		);

		expect(missingDates).toEqual(['2026-09-02']);
	});

	test('finds incoming sessions outside the requested window', () => {
		const outsideDates = findOutOfWindowSessionDates(
			[createBar('2026-08-29'), createBar('2026-09-01'), createBar('2026-09-03')],
			{ start: '2026-09-01', end: '2026-09-02' },
		);

		expect(outsideDates).toEqual(['2026-08-29', '2026-09-03']);
	});
});

describe('checkIfBarHistoriesAreEqual', () => {
	test('compares metadata and every bar value', () => {
		const history = createHistory();

		expect(checkIfBarHistoriesAreEqual(history, { ...history })).toBe(true);
		expect(
			checkIfBarHistoriesAreEqual(history, {
				...history,
				bars: [createBar('2026-09-01', { volume: 2_000 })],
			}),
		).toBe(false);
	});
});

function createHistory(): BarHistory {
	return {
		schemaVersion: 1,
		tradingLineId: 'cedear-aapl-ars',
		source: { provider: 'open-bymadata', symbol: 'AAPL 24HS' },
		priceAdjustment: 'none',
		backfilledAt: '2026-09-01T21:10:00Z',
		lastReconciledAt: null,
		checkedThroughSession: '2026-09-01',
		bars: [createBar('2026-09-01')],
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
