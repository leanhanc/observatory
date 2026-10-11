import { describe, expect, test } from 'bun:test';

import { applyCorporateActions, validateCorporateActionList } from './corporate-actions.ts';
import { corporateActions } from './index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type {
	CorporateAction,
	PricesAndVolumeCorporateAction,
	VolumeCorporateAction,
} from './corporate-actions.types.ts';

const PDF_URL_PREFIX =
	'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/';

const HALVING: PricesAndVolumeCorporateAction = {
	tradingLineId: 'test-stock-byma-ars',
	exDate: '2026-01-05',
	correction: 'prices-and-volume',
	priceFactor: 0.5,
	kind: 'share-distribution',
	sourceUrl: 'https://example.com/notice',
};

const TRIPLING_VOLUME: VolumeCorporateAction = {
	tradingLineId: 'test-cedear-byma-ars',
	exDate: '2026-01-05',
	correction: 'volume',
	shareFactor: 3,
	kind: 'ratio-change',
	sourceUrl: 'https://example.com/notice',
};

describe('the committed Corporate Action list', () => {
	test("contains ETHA's 1-for-3 reverse split with its source", () => {
		expect(corporateActions).toContainEqual({
			tradingLineId: 'etha-cedear-byma-ars',
			exDate: '2026-10-06',
			correction: 'prices-and-volume',
			priceFactor: 3,
			kind: 'reverse-split',
			sourceUrl:
				'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/501592',
		});
	});

	test("contains BYMA's 1:1 share distribution with its source", () => {
		expect(corporateActions).toContainEqual({
			tradingLineId: 'byma-stock-byma-ars',
			exDate: '2025-05-26',
			correction: 'prices-and-volume',
			priceFactor: 0.5,
			kind: 'share-distribution',
			sourceUrl: 'https://www.byma.com.ar/newsroom/byma-anuncia-pago-en-acciones',
		});
	});

	// Both notices give a record date of 2026-05-29 and a change date of 2026-06-01 but no ex-date;
	// the volume steps begin on 2026-05-29.
	test.each([
		['SPY', 'spy-cedear-byma-ars', 3, 493877],
		['HUT', 'hut-cedear-byma-ars', 25, 493878],
	])(
		"contains %s's volume-only ratio change with its notice",
		(_, tradingLineId, shareFactor, notice) => {
			expect(corporateActions).toContainEqual({
				tradingLineId,
				exDate: '2026-05-29',
				correction: 'volume',
				shareFactor,
				kind: 'ratio-change',
				sourceUrl: `${PDF_URL_PREFIX}${notice}`,
			});
		},
	);
});

describe('validateCorporateActionList', () => {
	const validEntry = { ...HALVING };

	test('accepts a valid list', () => {
		expect(
			validateCorporateActionList({ schemaVersion: 2, corporateActions: [validEntry] }),
		).toEqual({ isValid: true, corporateActions: [validEntry] });
	});

	test('accepts a valid volume-only entry', () => {
		expect(
			validateCorporateActionList({ schemaVersion: 2, corporateActions: [TRIPLING_VOLUME] }),
		).toEqual({ isValid: true, corporateActions: [TRIPLING_VOLUME] });
	});

	test('rejects a list of the previous schema version', () => {
		const validation = validateCorporateActionList({
			schemaVersion: 1,
			corporateActions: [validEntry],
		});

		expect(validation).toMatchObject({ isValid: false, issues: [{ path: 'schemaVersion' }] });
	});

	test.each([
		['a prices-and-volume entry', HALVING],
		['a volume entry', TRIPLING_VOLUME],
	])('rejects %s without a source', (_, entry) => {
		const { sourceUrl: _sourceUrl, ...entryWithoutSource } = entry;
		const validation = validateCorporateActionList({
			schemaVersion: 2,
			corporateActions: [entryWithoutSource],
		});

		expect(validation).toMatchObject({
			isValid: false,
			issues: [{ path: 'corporateActions[0].sourceUrl' }],
		});
	});

	test.each([
		['shareFactor', 0],
		['shareFactor', 1],
		['shareFactor', 1.56],
		['shareFactor', 0.65],
		['shareFactor', -3],
		['shareFactor', Number.NaN],
		['shareFactor', Number.POSITIVE_INFINITY],
		['shareFactor', '3'],
		['kind', 'consolidation'],
		['sourceUrl', 'http://example.com/notice'],
	])('rejects a volume entry with %s %p', (field, value) => {
		const validation = validateCorporateActionList({
			schemaVersion: 2,
			corporateActions: [{ ...TRIPLING_VOLUME, [field]: value }],
		});

		expect(validation).toMatchObject({
			isValid: false,
			issues: [{ path: `corporateActions[0].${field}` }],
		});
	});

	test('rejects an unknown correction', () => {
		const validation = validateCorporateActionList({
			schemaVersion: 2,
			corporateActions: [{ ...TRIPLING_VOLUME, correction: 'prices' }],
		});

		expect(validation).toMatchObject({
			isValid: false,
			issues: [{ path: 'corporateActions[0].correction' }],
		});
	});

	test('rejects an entry without a correction', () => {
		const { correction: _, ...entryWithoutCorrection } = HALVING;
		const validation = validateCorporateActionList({
			schemaVersion: 2,
			corporateActions: [entryWithoutCorrection],
		});

		expect(validation.isValid).toBe(false);
	});

	test.each([
		['a volume entry with a price factor', { ...HALVING, correction: 'volume' }],
		[
			'a prices-and-volume entry with a share factor',
			{ ...TRIPLING_VOLUME, correction: 'prices-and-volume' },
		],
		['an entry with both factors', { ...TRIPLING_VOLUME, priceFactor: 1 / 3 }],
	])('rejects %s', (_, entry) => {
		const validation = validateCorporateActionList({
			schemaVersion: 2,
			corporateActions: [entry],
		});

		expect(validation.isValid).toBe(false);
	});

	test.each([
		['priceFactor', 0],
		['priceFactor', 1],
		['priceFactor', 0.65],
		['priceFactor', 1.56],
		['priceFactor', -0.5],
		['priceFactor', Number.POSITIVE_INFINITY],
		['exDate', '2025-02-30'],
		['kind', 'rights-issue'],
		['sourceUrl', 'http://example.com/notice'],
		['sourceUrl', 'not a url'],
		['tradingLineId', 'Test Stock'],
	])('rejects %s %p', (field, value) => {
		const validation = validateCorporateActionList({
			schemaVersion: 2,
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
			schemaVersion: 2,
			corporateActions: [{ ...validEntry, kind, priceFactor }],
		});

		expect(validation).toMatchObject({
			isValid: false,
			issues: [{ path: 'corporateActions[0].priceFactor' }],
		});
	});

	test.each([
		['a reverse split with a share factor above 1', 'reverse-split', 3],
		['a split with a share factor below 1', 'split', 0.5],
		['a share distribution with a share factor below 1', 'share-distribution', 0.5],
	])('rejects %s', (_, kind, shareFactor) => {
		const validation = validateCorporateActionList({
			schemaVersion: 2,
			corporateActions: [{ ...TRIPLING_VOLUME, kind, shareFactor }],
		});

		expect(validation).toMatchObject({
			isValid: false,
			issues: [{ path: 'corporateActions[0].shareFactor' }],
		});
	});

	test.each([
		['a price factor', { ...HALVING, kind: 'ratio-change', priceFactor: 3 }],
		['a price factor', { ...HALVING, kind: 'ratio-change', priceFactor: 0.25 }],
		['a share factor', { ...TRIPLING_VOLUME, shareFactor: 3 }],
		['a share factor', { ...TRIPLING_VOLUME, shareFactor: 0.5 }],
	])('accepts a ratio change with %s in either direction', (_, entry) => {
		expect(
			validateCorporateActionList({ schemaVersion: 2, corporateActions: [entry] }).isValid,
		).toBe(true);
	});

	test.each([
		['split', 1.5625],
		['reverse-split', 0.64],
	])('accepts a %s share factor exactly ×1.25 squared away from 1 (%p)', (kind, shareFactor) => {
		const validation = validateCorporateActionList({
			schemaVersion: 2,
			corporateActions: [{ ...TRIPLING_VOLUME, kind, shareFactor }],
		});

		expect(validation.isValid).toBe(true);
	});

	test('accepts a reverse split with a factor above 1', () => {
		const reverseSplit = { ...validEntry, kind: 'reverse-split', priceFactor: 3 };

		expect(
			validateCorporateActionList({ schemaVersion: 2, corporateActions: [reverseSplit] })
				.isValid,
		).toBe(true);
	});

	test.each([0.64, 1.5625])(
		'accepts a factor exactly ×1.25 squared away from 1 (%p)',
		(priceFactor) => {
			const kind = priceFactor > 1 ? 'reverse-split' : 'split';
			const validation = validateCorporateActionList({
				schemaVersion: 2,
				corporateActions: [{ ...validEntry, kind, priceFactor }],
			});

			expect(validation.isValid).toBe(true);
		},
	);

	test('rejects an extra field', () => {
		const validation = validateCorporateActionList({
			schemaVersion: 2,
			corporateActions: [{ ...validEntry, note: 'unsupported' }],
		});

		expect(validation.isValid).toBe(false);
	});

	test('rejects a volume entry and a prices-and-volume entry for the same line and ex-date', () => {
		const validation = validateCorporateActionList({
			schemaVersion: 2,
			corporateActions: [
				validEntry,
				{ ...TRIPLING_VOLUME, tradingLineId: validEntry.tradingLineId },
			],
		});

		expect(validation).toMatchObject({
			isValid: false,
			issues: [
				{ code: 'duplicate-corporate-action', path: 'corporateActions[0]' },
				{ code: 'duplicate-corporate-action', path: 'corporateActions[1]' },
			],
		});
	});

	test('rejects two entries for the same line and ex-date', () => {
		const validation = validateCorporateActionList({
			schemaVersion: 2,
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

	test('skips an action whose step the provider already adjusted', () => {
		const bars = [createBar('2026-01-02', 200, 100), createBar('2026-01-05', 201, 100)];

		const correction = applyCorporateActions(bars, [HALVING]);

		expect(correction.bars).toEqual(bars);
		expect(correction.outcomes).toEqual([
			{ ...HALVING, status: 'step-not-observed', observedCloseRatio: 1.005 },
		]);
	});

	test('does not apply an action whose step a real move on the ex-date hides', () => {
		const bars = [createBar('2026-01-02', 400, 100), createBar('2026-01-05', 150, 100)];

		const correction = applyCorporateActions(bars, [HALVING]);

		expect(correction.bars).toEqual(bars);
		expect(correction.outcomes).toEqual([
			{ ...HALVING, status: 'step-not-observed', observedCloseRatio: 0.375 },
		]);
	});

	test('does not apply two actions whose ex-dates have no bar between them', () => {
		const laterHalving = { ...HALVING, exDate: '2026-01-07' };
		const bars = [createBar('2026-01-02', 400, 100), createBar('2026-01-08', 100, 400)];

		const correction = applyCorporateActions(bars, [HALVING, laterHalving]);

		expect(correction.bars).toEqual(bars);
		expect(correction.outcomes.map((outcome) => outcome.status)).toEqual([
			'step-not-observed',
			'step-not-observed',
		]);
	});

	test.each([
		['at ×1.25 above the factor', 250, 'applied'],
		['at ÷1.25 below the factor', 160, 'applied'],
		['just beyond ×1.25', 250.01, 'step-not-observed'],
		['just beyond ÷1.25', 159.99, 'step-not-observed'],
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

describe('applyCorporateActions with a volume-only action', () => {
	// The provider's shape for SPY's and HUT's ratio changes: earlier prices already on the new
	// scale, so no step at the ex-date, but earlier volumes still count the old, larger CEDEARs.
	const preExDateVolumes = Array.from({ length: 22 }, (_, index) => 10 + index);
	const preExDateBars = preExDateVolumes.map((volume, index) =>
		createBar(
			Temporal.PlainDate.from('2025-12-01').add({ days: index }).toString(),
			100,
			volume,
		),
	);
	const fromExDateBars = [createBar('2026-01-05', 101, 30), createBar('2026-01-06', 99, 45)];
	const servedBars = [...preExDateBars, ...fromExDateBars];

	test('multiplies volume before the ex-date by the share factor and leaves prices as served', () => {
		const correction = applyCorporateActions(servedBars, [TRIPLING_VOLUME]);

		expect(correction.bars).toEqual([
			...preExDateBars.map((bar) => ({ ...bar, volume: bar.volume * 3 })),
			...fromExDateBars,
		]);
		expect(correction.outcomes).toEqual([
			{ ...TRIPLING_VOLUME, status: 'applied', observedCloseRatio: 1.01 },
		]);
	});

	test('multiplies traded value before the ex-date by the share factor', () => {
		const [servedBar] = servedBars;
		const [correctedBar] = applyCorporateActions(servedBars, [TRIPLING_VOLUME]).bars;

		expect(correctedBar!.close * correctedBar!.volume).toBe(
			3 * servedBar!.close * servedBar!.volume,
		);
	});

	test('applies a volume and a prices-and-volume action on one line', () => {
		const laterHalving = { ...HALVING, exDate: '2026-01-07' };
		const bars = [...servedBars, createBar('2026-01-07', 50, 90)];

		const correction = applyCorporateActions(bars, [TRIPLING_VOLUME, laterHalving]);
		const [firstBar] = correction.bars;

		expect(correction.outcomes.map((outcome) => outcome.status)).toEqual([
			'applied',
			'applied',
		]);
		expect([firstBar!.close, firstBar!.volume]).toEqual([50, 10 * 3 * 2]);
		expect(correction.bars.at(-2)).toEqual({
			...fromExDateBars[1]!,
			...scalePrices(fromExDateBars[1]!, 0.5),
			volume: 90,
		});
	});

	test('does not apply when the price still shows the step', () => {
		const bars = [
			...preExDateBars.map((bar) => createBar(bar.sessionDate, 300, bar.volume)),
			...fromExDateBars,
		];

		const correction = applyCorporateActions(bars, [TRIPLING_VOLUME]);

		expect(correction.bars).toEqual(bars);
		expect(correction.outcomes).toEqual([
			{ ...TRIPLING_VOLUME, status: 'price-step-observed', observedCloseRatio: 101 / 300 },
		]);
	});

	test.each([
		['at ×1.25', 125, 'applied'],
		['at ÷1.25', 80, 'applied'],
		['just beyond ×1.25', 125.01, 'price-step-observed'],
		['just beyond ÷1.25', 79.99, 'price-step-observed'],
	] as const)(
		'treats a close of 100, then %s (%p), as %s',
		(_, closeOnExDate, expectedStatus) => {
			const bars = [...preExDateBars, createBar('2026-01-05', closeOnExDate, 30)];

			const [outcome] = applyCorporateActions(bars, [TRIPLING_VOLUME]).outcomes;

			expect(outcome!.status).toBe(expectedStatus);
		},
	);

	test('records a volume-only action as outside the window when no bar precedes the ex-date', () => {
		const correction = applyCorporateActions(fromExDateBars, [TRIPLING_VOLUME]);

		expect(correction.bars).toEqual(fromExDateBars);
		expect(correction.outcomes).toEqual([
			{ ...TRIPLING_VOLUME, status: 'outside-window', observedCloseRatio: null },
		]);
	});

	test('does not read or change bars from the ex-date on', () => {
		const laterBars = [...servedBars, createBar('2026-01-07', 300, 7)];

		const correction = applyCorporateActions(laterBars, [TRIPLING_VOLUME]);

		expect(correction.bars.slice(preExDateBars.length)).toEqual(
			laterBars.slice(preExDateBars.length),
		);
		expect(correction.outcomes[0]!.status).toBe('applied');
	});

	describe('the divisibility check', () => {
		const rescaledBars = [
			...preExDateBars.map((bar) => ({ ...bar, volume: bar.volume * 3 })),
			...fromExDateBars,
		];

		test('skips the action when the last 20 traded volumes are all multiples of the factor', () => {
			const correction = applyCorporateActions(rescaledBars, [TRIPLING_VOLUME]);

			expect(correction.bars).toEqual(rescaledBars);
			expect(correction.outcomes).toEqual([
				{
					...TRIPLING_VOLUME,
					status: 'volume-rescale-suspected',
					observedCloseRatio: 1.01,
				},
			]);
		});

		test('applies the action when one of the 20 is not a multiple', () => {
			const lastPreExDateIndex = preExDateBars.length - 1;
			const bars = rescaledBars.with(lastPreExDateIndex, {
				...rescaledBars[lastPreExDateIndex]!,
				volume: 31,
			});

			expect(applyCorporateActions(bars, [TRIPLING_VOLUME]).outcomes[0]!.status).toBe(
				'applied',
			);
		});

		test('reads only the last 20 traded bars before the ex-date', () => {
			// The oldest of 22 earlier bars is not a multiple, but it is outside the 20 read.
			const bars = rescaledBars.with(0, { ...rescaledBars[0]!, volume: 31 });

			expect(applyCorporateActions(bars, [TRIPLING_VOLUME]).outcomes[0]!.status).toBe(
				'volume-rescale-suspected',
			);
		});

		test('ignores zero-volume bars, which are a multiple of anything', () => {
			// Without skipping the zeros, the window of 20 would reach the non-multiple oldest bar.
			const bars = rescaledBars
				.with(0, { ...rescaledBars[0]!, volume: 31 })
				.with(10, { ...rescaledBars[10]!, volume: 0 })
				.with(11, { ...rescaledBars[11]!, volume: 0 });

			expect(applyCorporateActions(bars, [TRIPLING_VOLUME]).outcomes[0]!.status).toBe(
				'applied',
			);
		});

		test('is not evaluated with fewer than 20 traded bars before the ex-date', () => {
			const bars = rescaledBars.slice(3);

			expect(applyCorporateActions(bars, [TRIPLING_VOLUME]).outcomes[0]!.status).toBe(
				'applied',
			);
		});

		test('is not evaluated for a factor that is not an integer', () => {
			const action = { ...TRIPLING_VOLUME, shareFactor: 2.5 };
			const bars = [
				...preExDateBars.map((bar) => ({ ...bar, volume: bar.volume * 5 })),
				...fromExDateBars,
			];

			expect(applyCorporateActions(bars, [action]).outcomes[0]!.status).toBe('applied');
		});

		test('is not evaluated when the price shows a step', () => {
			const bars = rescaledBars.with(preExDateBars.length, createBar('2026-01-05', 30, 30));

			expect(applyCorporateActions(bars, [TRIPLING_VOLUME]).outcomes[0]!.status).toBe(
				'price-step-observed',
			);
		});
	});
});

function scalePrices(
	bar: DailyBar,
	factor: number,
): Pick<DailyBar, 'open' | 'high' | 'low' | 'close'> {
	return {
		open: bar.open * factor,
		high: bar.high * factor,
		low: bar.low * factor,
		close: bar.close * factor,
	};
}

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
