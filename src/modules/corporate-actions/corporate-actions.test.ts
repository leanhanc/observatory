import { describe, expect, test } from 'bun:test';

import { instrumentCatalog } from '#modules/instrument-catalog/index.ts';

import { applyCorporateActions, validateCorporateActionList } from './corporate-actions.ts';
import { corporateActions } from './index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { CorporateAction } from './corporate-actions.types.ts';

const HALVING: CorporateAction = {
	tradingLineId: 'test-stock-byma-ars',
	exDate: '2026-01-05',
	priceFactor: 0.5,
	kind: 'share-distribution',
	sourceUrl: 'https://example.com/notice',
};

describe('the committed Corporate Action list', () => {
	test("contains ETHA's 1-for-3 reverse split with its source", () => {
		expect(corporateActions).toContainEqual({
			tradingLineId: 'etha-cedear-byma-ars',
			exDate: '2026-10-06',
			priceFactor: 3,
			kind: 'reverse-split',
			sourceUrl:
				'https://www.sec.gov/Archives/edgar/data/0002000638/000143774926025654/etha20260803_8k.htm',
		});
	});

	test("contains BYMA's 1:1 share distribution with its source", () => {
		expect(corporateActions).toContainEqual({
			tradingLineId: 'byma-stock-byma-ars',
			exDate: '2025-05-26',
			priceFactor: 0.5,
			kind: 'share-distribution',
			sourceUrl: 'https://www.byma.com.ar/newsroom/byma-anuncia-pago-en-acciones',
		});
	});

	test('names only Trading Lines of the Instrument Catalog', () => {
		const tradingLineIds = [...new Set(corporateActions.map((action) => action.tradingLineId))];

		expect(instrumentCatalog.getTradingLinesByIds(tradingLineIds).ok).toBe(true);
	});
});

describe('validateCorporateActionList', () => {
	const validEntry = { ...HALVING };

	test('accepts a valid list', () => {
		expect(
			validateCorporateActionList({ schemaVersion: 1, corporateActions: [validEntry] }),
		).toEqual({ isValid: true, corporateActions: [validEntry] });
	});

	test('rejects an entry without a source', () => {
		const { sourceUrl: _, ...entryWithoutSource } = validEntry;
		const validation = validateCorporateActionList({
			schemaVersion: 1,
			corporateActions: [entryWithoutSource],
		});

		expect(validation).toMatchObject({
			isValid: false,
			issues: [{ path: 'corporateActions[0].sourceUrl' }],
		});
	});

	test.each([
		['priceFactor', 0],
		['priceFactor', 1],
		['priceFactor', -0.5],
		['priceFactor', Number.POSITIVE_INFINITY],
		['exDate', '2025-02-30'],
		['kind', 'rights-issue'],
		['sourceUrl', 'http://example.com/notice'],
		['sourceUrl', 'not a url'],
		['tradingLineId', 'Test Stock'],
	])('rejects %s %p', (field, value) => {
		const validation = validateCorporateActionList({
			schemaVersion: 1,
			corporateActions: [{ ...validEntry, [field]: value }],
		});

		expect(validation).toMatchObject({
			isValid: false,
			issues: [{ path: `corporateActions[0].${field}` }],
		});
	});

	test.each([
		['a reverse split with a factor below 1', 'reverse-split', 0.5],
		['a split with a factor above 1', 'split', 2],
		['a share distribution with a factor above 1', 'share-distribution', 3],
	])('rejects %s', (_, kind, priceFactor) => {
		const validation = validateCorporateActionList({
			schemaVersion: 1,
			corporateActions: [{ ...validEntry, kind, priceFactor }],
		});

		expect(validation).toMatchObject({
			isValid: false,
			issues: [{ path: 'corporateActions[0].priceFactor' }],
		});
	});

	test('accepts a reverse split with a factor above 1', () => {
		const reverseSplit = { ...validEntry, kind: 'reverse-split', priceFactor: 3 };

		expect(
			validateCorporateActionList({ schemaVersion: 1, corporateActions: [reverseSplit] })
				.isValid,
		).toBe(true);
	});

	test('rejects an extra field', () => {
		const validation = validateCorporateActionList({
			schemaVersion: 1,
			corporateActions: [{ ...validEntry, note: 'unsupported' }],
		});

		expect(validation.isValid).toBe(false);
	});

	test('rejects two entries for the same line and ex-date', () => {
		const validation = validateCorporateActionList({
			schemaVersion: 1,
			corporateActions: [validEntry, { ...validEntry, priceFactor: 0.25 }],
		});

		expect(validation).toMatchObject({
			isValid: false,
			issues: [
				{ code: 'duplicate-corporate-action', path: 'corporateActions[0]' },
				{ code: 'duplicate-corporate-action', path: 'corporateActions[1]' },
			],
		});
	});
});

describe('applyCorporateActions', () => {
	test('rescales prices and volume before the ex-date and leaves later bars unchanged', () => {
		const bars = [
			createBar('2026-01-01', 400, 100),
			createBar('2026-01-02', 400, 100),
			createBar('2026-01-05', 200, 300),
			createBar('2026-01-06', 210, 300),
		];

		const correction = applyCorporateActions(bars, [HALVING]);

		expect(correction.bars).toEqual([
			{
				sessionDate: '2026-01-01',
				open: 200,
				high: 202.5,
				low: 197.5,
				close: 200,
				volume: 200,
			},
			{
				sessionDate: '2026-01-02',
				open: 200,
				high: 202.5,
				low: 197.5,
				close: 200,
				volume: 200,
			},
			bars[2]!,
			bars[3]!,
		]);
		expect(correction.outcomes).toEqual([
			{ ...HALVING, status: 'applied', observedCloseRatio: 0.5 },
		]);
	});

	test('keeps traded value on every corrected bar', () => {
		const bars = [createBar('2026-01-02', 400, 100), createBar('2026-01-05', 200, 300)];
		const [correctedBar] = applyCorporateActions(bars, [HALVING]).bars;

		expect(correctedBar!.close * correctedBar!.volume).toBe(400 * 100);
	});

	test('compounds two applied actions on bars before both ex-dates', () => {
		const laterHalving = { ...HALVING, exDate: '2026-01-07' };
		const bars = [
			createBar('2026-01-02', 400, 100),
			createBar('2026-01-05', 200, 200),
			createBar('2026-01-07', 100, 400),
		];

		const correction = applyCorporateActions(bars, [HALVING, laterHalving]);

		expect(correction.bars.map((bar) => [bar.close, bar.volume])).toEqual([
			[100, 400],
			[100, 400],
			[100, 400],
		]);
	});

	test('raises prices and lowers volume before a reverse split', () => {
		const reverseSplit: CorporateAction = { ...HALVING, kind: 'reverse-split', priceFactor: 3 };
		const bars = [createBar('2026-01-02', 100, 900), createBar('2026-01-05', 290, 300)];

		const correction = applyCorporateActions(bars, [reverseSplit]);

		expect([correction.bars[0]!.close, correction.bars[0]!.volume]).toEqual([300, 300]);
		expect(correction.bars[1]).toEqual(bars[1]);
		expect(correction.outcomes[0]).toMatchObject({
			status: 'applied',
			observedCloseRatio: 2.9,
		});
	});

	test('skips an action the provider already adjusted', () => {
		const bars = [createBar('2026-01-02', 200, 100), createBar('2026-01-05', 201, 100)];

		const correction = applyCorporateActions(bars, [HALVING]);

		expect(correction.bars).toEqual(bars);
		expect(correction.outcomes).toEqual([
			{ ...HALVING, status: 'already-adjusted', observedCloseRatio: 1.005 },
		]);
	});

	test.each([
		['at ×1.25 above the factor', 250, 'applied'],
		['at ÷1.25 below the factor', 160, 'applied'],
		['just beyond ×1.25', 250.01, 'already-adjusted'],
		['just beyond ÷1.25', 159.99, 'already-adjusted'],
	] as const)(
		'treats a close of 400, then %s (%p), as %s',
		(_, closeOnExDate, expectedStatus) => {
			const bars = [
				createBar('2026-01-02', 400, 100),
				createBar('2026-01-05', closeOnExDate, 100),
			];

			const [outcome] = applyCorporateActions(bars, [HALVING]).outcomes;

			expect(outcome!.status).toBe(expectedStatus);
		},
	);

	test('does not apply a factor near 1 to a ratio closer to no step', () => {
		const nearOneFactor = { ...HALVING, priceFactor: 0.85 };
		const bars = [createBar('2026-01-02', 100, 100), createBar('2026-01-05', 99, 100)];

		const [outcome] = applyCorporateActions(bars, [nearOneFactor]).outcomes;

		expect(measureDeviation(0.99, 0.85)).toBeLessThan(1.25);
		expect(outcome!.status).toBe('already-adjusted');
	});

	test.each([
		['every bar is on or after the ex-date', ['2026-01-05', '2026-01-06']],
		['every bar is before the ex-date', ['2026-01-01', '2026-01-02']],
	])('records an action as outside the window when %s', (_, sessionDates) => {
		const bars = sessionDates.map((sessionDate) => createBar(sessionDate, 400, 100));

		const correction = applyCorporateActions(bars, [HALVING]);

		expect(correction.bars).toEqual(bars);
		expect(correction.outcomes).toEqual([
			{ ...HALVING, status: 'outside-window', observedCloseRatio: null },
		]);
	});

	test('measures the step against the first bar after an ex-date the line did not trade', () => {
		const bars = [createBar('2026-01-02', 400, 100), createBar('2026-01-07', 196, 100)];

		const [outcome] = applyCorporateActions(bars, [HALVING]).outcomes;

		expect(outcome).toMatchObject({ status: 'applied', observedCloseRatio: 0.49 });
	});

	test('does not mutate its input', () => {
		const bars = Object.freeze([
			Object.freeze(createBar('2026-01-02', 400, 100)),
			Object.freeze(createBar('2026-01-05', 200, 100)),
		]);

		expect(() => applyCorporateActions(bars, [HALVING])).not.toThrow();
		expect(bars[0]!.close).toBe(400);
	});
});

function createBar(sessionDate: string, close: number, volume: number): DailyBar {
	const halfRange = close / 80;
	return {
		sessionDate,
		open: close,
		high: close + halfRange,
		low: close - halfRange,
		close,
		volume,
	};
}

function measureDeviation(left: number, right: number): number {
	return Math.max(left / right, right / left);
}
