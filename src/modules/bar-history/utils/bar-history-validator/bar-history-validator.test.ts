import { describe, expect, test } from 'bun:test';

import { validateBarHistory, validateDailyBars } from './bar-history-validator.ts';

import type { BarHistory, DailyBar } from '../../bar-history.types.ts';

describe('validateDailyBars', () => {
	test('accepts valid prices and zero volume', () => {
		const result = validateDailyBars([createBar('2026-09-01', { volume: 0 })], true, 'bars');

		expect(result).toEqual({ isValid: true, issues: [] });
	});

	test('rejects missing, non-finite, and negative numeric values', () => {
		const result = validateDailyBars(
			[
				{ ...createBar('2026-09-01'), open: undefined },
				createBar('2026-09-02', { close: Number.NaN }),
				createBar('2026-09-03', { volume: -1 }),
			],
			true,
			'bars',
		);

		expect(result.isValid).toBe(false);
		expect(result.issues.map((issue) => issue.code)).toContain('invalid-number');
		expect(result.issues.map((issue) => issue.code)).toContain('negative-number');
	});

	test('rejects invalid price relationships', () => {
		const result = validateDailyBars(
			[
				createBar('2026-09-01', { high: 98 }),
				createBar('2026-09-02', { open: 98 }),
				createBar('2026-09-03', { close: 104 }),
			],
			true,
			'bars',
		);

		expect(result.isValid).toBe(false);
		expect(result.issues.filter((issue) => issue.code === 'invalid-price-range')).toHaveLength(
			3,
		);
	});

	test('rejects impossible session dates', () => {
		const result = validateDailyBars([createBar('2026-02-30')], true, 'bars');

		expect(result).toMatchObject({
			isValid: false,
			issues: [{ code: 'invalid-date', path: 'bars[0].sessionDate' }],
		});
	});

	test('rejects undeclared Daily Bar fields', () => {
		const result = validateDailyBars(
			[{ ...createBar('2026-09-01'), providerTimestamp: 1_788_292_800 }],
			true,
			'bars',
		);

		expect(result.isValid).toBe(false);
		expect(result.issues.map((issue) => issue.path)).toContain('bars[0].providerTimestamp');
	});

	test('rejects duplicate and unordered sessions in stored history', () => {
		const duplicateResult = validateDailyBars(
			[createBar('2026-09-01'), createBar('2026-09-01')],
			true,
			'bars',
		);
		const unorderedResult = validateDailyBars(
			[createBar('2026-09-02'), createBar('2026-09-01')],
			true,
			'bars',
		);

		expect(duplicateResult.issues.map((issue) => issue.code)).toContain(
			'duplicate-session-date',
		);
		expect(unorderedResult.issues.map((issue) => issue.code)).toContain(
			'unsorted-session-date',
		);
	});
});

describe('validateBarHistory', () => {
	test('accepts a complete schema-v1 history', () => {
		expect(validateBarHistory(createHistory())).toEqual({ isValid: true, issues: [] });
	});

	test('rejects unsupported schema, adjustment, and source values', () => {
		const history = createHistory();
		const result = validateBarHistory({
			...history,
			schemaVersion: 2,
			priceAdjustment: 'split-adjusted',
			source: { provider: 'somewhere-else', symbol: '' },
		});

		expect(result.isValid).toBe(false);
		expect(result.issues.map((issue) => issue.code)).toContain('invalid-schema-version');
		expect(result.issues.map((issue) => issue.path)).toContain('history.source.provider');
		expect(result.issues.map((issue) => issue.path)).toContain('history.priceAdjustment');
	});

	test('rejects impossible UTC metadata instants', () => {
		const result = validateBarHistory({
			...createHistory(),
			backfilledAt: '2026-02-30T21:10:00Z',
		});

		expect(result).toMatchObject({
			isValid: false,
			issues: [{ code: 'invalid-date', path: 'history.backfilledAt' }],
		});
	});

	test('accepts UTC instants with variable fractional precision', () => {
		const oneDigitResult = validateBarHistory({
			...createHistory(),
			backfilledAt: '2026-09-01T21:10:00.1Z',
		});
		const nanosecondResult = validateBarHistory({
			...createHistory(),
			backfilledAt: '2026-09-01T21:10:00.123456789Z',
		});

		expect(oneDigitResult).toEqual({ isValid: true, issues: [] });
		expect(nanosecondResult).toEqual({ isValid: true, issues: [] });
	});

	test('rejects undeclared Bar History and source fields', () => {
		const historyResult = validateBarHistory({ ...createHistory(), providerPayload: {} });
		const sourceResult = validateBarHistory({
			...createHistory(),
			source: { ...createHistory().source, market: 'BYMA' },
		});

		expect(historyResult.isValid).toBe(false);
		expect(historyResult.issues.map((issue) => issue.path)).toContain(
			'history.providerPayload',
		);
		expect(sourceResult.isValid).toBe(false);
		expect(sourceResult.issues.map((issue) => issue.path)).toContain('history.source.market');
	});

	test('rejects bars later than stored check progress', () => {
		const result = validateBarHistory({
			...createHistory(),
			checkedThroughSession: '2026-09-01',
			bars: [createBar('2026-09-02')],
		});

		expect(result.issues.map((issue) => issue.code)).toContain('bar-after-check-through');
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
