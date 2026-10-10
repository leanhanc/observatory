import { describe, expect, test } from 'bun:test';

import { detectAdjustmentOrCorrection } from './bar-history-adjustment-detector.ts';

import type { DailyBar } from '../../bar-history.types.ts';
import type { PriceRevision } from './bar-history-adjustment-detector.types.ts';

const STORED_BARS = [
	createBar('2026-09-01', 6_000),
	createBar('2026-09-02', 6_100),
	createBar('2026-09-03', 6_050),
	createBar('2026-09-04', 6_200),
	createBar('2026-09-07', 6_150),
];

describe('detectAdjustmentOrCorrection', () => {
	test('reports unchanged when every overlapping bar is identical', () => {
		expect(detectAdjustmentOrCorrection(STORED_BARS, STORED_BARS)).toEqual({
			kind: 'unchanged',
		});
	});

	test('detects a distribution adjustment through the latest scaled session', () => {
		const fetchedBars = [
			...STORED_BARS.slice(0, 3).map((bar) => scaleBar(bar, 0.97)),
			...STORED_BARS.slice(3),
		];
		const revision = detectAdjustmentOrCorrection(STORED_BARS, fetchedBars);

		expect(revision).toMatchObject({
			kind: 'adjustments',
			adjustments: [{ adjustedThroughSession: '2026-09-03' }],
		});
		expect(selectRatios(revision)[0]).toBeCloseTo(0.97, 3);
	});

	test('separates two adjustments made since the last check', () => {
		const fetchedBars = [
			...STORED_BARS.slice(0, 2).map((bar) => scaleBar(bar, 0.97 * 0.95)),
			...STORED_BARS.slice(2, 4).map((bar) => scaleBar(bar, 0.95)),
			STORED_BARS[4]!,
		];
		const revision = detectAdjustmentOrCorrection(STORED_BARS, fetchedBars);
		const [firstRatio, secondRatio] = selectRatios(revision);

		expect(revision).toMatchObject({
			kind: 'adjustments',
			adjustments: [
				{ adjustedThroughSession: '2026-09-02' },
				{ adjustedThroughSession: '2026-09-04' },
			],
		});
		expect(firstRatio).toBeCloseTo(0.97, 3);
		expect(secondRatio).toBeCloseTo(0.95, 3);
	});

	test('reports corrections when one step of a staircase has a single bar', () => {
		const fetchedBars = [
			...STORED_BARS.slice(0, 2).map((bar) => scaleBar(bar, 0.97 * 0.95)),
			scaleBar(STORED_BARS[2]!, 0.95),
			...STORED_BARS.slice(3),
		];

		expect(detectAdjustmentOrCorrection(STORED_BARS, fetchedBars)).toEqual({
			kind: 'corrections',
			sessionDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
		});
	});

	test('treats an adjustment covering the whole overlap as an adjustment', () => {
		const fetchedBars = STORED_BARS.map((bar) => scaleBar(bar, 0.97));

		expect(detectAdjustmentOrCorrection(STORED_BARS, fetchedBars)).toMatchObject({
			kind: 'adjustments',
			adjustments: [{ adjustedThroughSession: '2026-09-07' }],
		});
	});

	test('ignores sessions that only one side contains', () => {
		const fetchedBars = [
			...STORED_BARS.slice(2, 4).map((bar) => scaleBar(bar, 0.97)),
			STORED_BARS[4]!,
			createBar('2026-09-08', 6_300),
		];

		expect(detectAdjustmentOrCorrection(STORED_BARS, fetchedBars)).toMatchObject({
			kind: 'adjustments',
			adjustments: [{ adjustedThroughSession: '2026-09-04' }],
		});
	});

	test('accepts an adjustment whose bars also changed volume', () => {
		const fetchedBars = [
			...STORED_BARS.slice(0, 2).map((bar) => ({
				...scaleBar(bar, 0.5),
				volume: bar.volume * 2,
			})),
			...STORED_BARS.slice(2),
		];

		expect(detectAdjustmentOrCorrection(STORED_BARS, fetchedBars)).toEqual({
			kind: 'adjustments',
			adjustments: [{ ratio: 0.5, adjustedThroughSession: '2026-09-02' }],
		});
	});

	test('reports a single corrected bar as a correction', () => {
		const fetchedBars = STORED_BARS.with(4, { ...STORED_BARS[4]!, close: 6_160 });

		expect(detectAdjustmentOrCorrection(STORED_BARS, fetchedBars)).toEqual({
			kind: 'corrections',
			sessionDates: ['2026-09-07'],
		});
	});

	test('does not call one scaled bar an adjustment', () => {
		const fetchedBars = STORED_BARS.with(0, scaleBar(STORED_BARS[0]!, 0.97));

		expect(detectAdjustmentOrCorrection(STORED_BARS, fetchedBars)).toEqual({
			kind: 'corrections',
			sessionDates: ['2026-09-01'],
		});
	});

	test('reports corrections when one adjusted bar changed by a different ratio', () => {
		const fetchedBars = [
			scaleBar(STORED_BARS[0]!, 0.97),
			scaleBar(STORED_BARS[1]!, 0.9),
			scaleBar(STORED_BARS[2]!, 0.97),
			...STORED_BARS.slice(3),
		];

		expect(detectAdjustmentOrCorrection(STORED_BARS, fetchedBars)).toEqual({
			kind: 'corrections',
			sessionDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
		});
	});

	test('reports corrections when an earlier overlapping bar was not scaled', () => {
		const fetchedBars = [
			STORED_BARS[0]!,
			...STORED_BARS.slice(1, 3).map((bar) => scaleBar(bar, 0.97)),
			...STORED_BARS.slice(3),
		];

		expect(detectAdjustmentOrCorrection(STORED_BARS, fetchedBars)).toEqual({
			kind: 'corrections',
			sessionDates: ['2026-09-02', '2026-09-03'],
		});
	});

	test('reports corrections when only volume changed', () => {
		const fetchedBars = STORED_BARS.map((bar, index) =>
			index < 3 ? { ...bar, volume: bar.volume + 10 } : bar,
		);

		expect(detectAdjustmentOrCorrection(STORED_BARS, fetchedBars)).toEqual({
			kind: 'corrections',
			sessionDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
		});
	});

	test('reports small edits to two bars as corrections, not as a ratio near 1', () => {
		const closeEdits = STORED_BARS.map((bar, index) =>
			index < 2 ? { ...bar, close: bar.close + 1 } : bar,
		);
		const highEdits = STORED_BARS.map((bar, index) =>
			index < 2 ? { ...bar, high: bar.high + 3 } : bar,
		);

		expect(detectAdjustmentOrCorrection(STORED_BARS, closeEdits)).toMatchObject({
			kind: 'corrections',
		});
		expect(detectAdjustmentOrCorrection(STORED_BARS, highEdits)).toMatchObject({
			kind: 'corrections',
		});
	});

	test('reports corrections when an edited step precedes a real adjustment', () => {
		const fetchedBars = [
			...STORED_BARS.slice(0, 2).map((bar) => ({ ...bar, high: bar.high + 3 })),
			...STORED_BARS.slice(2, 4).map((bar) => scaleBar(bar, 0.97)),
			STORED_BARS[4]!,
		];

		expect(detectAdjustmentOrCorrection(STORED_BARS, fetchedBars)).toMatchObject({
			kind: 'corrections',
		});
	});

	test('reports noise and slow drift near a ratio of 1 as corrections', () => {
		const noisyBars = [
			...[1.0005, 0.9995, 1.0005, 0.9995].map((ratio, index) =>
				scaleBar(STORED_BARS[index]!, ratio),
			),
			STORED_BARS[4]!,
		];
		const driftingBars = [
			...[0.999, 0.9982, 0.9973, 0.9965].map((ratio, index) =>
				scaleBar(STORED_BARS[index]!, ratio),
			),
			STORED_BARS[4]!,
		];

		expect(detectAdjustmentOrCorrection(STORED_BARS, noisyBars)).toMatchObject({
			kind: 'corrections',
		});
		expect(detectAdjustmentOrCorrection(STORED_BARS, driftingBars)).toMatchObject({
			kind: 'corrections',
		});
	});

	test('reports a ratio above 1 as corrections', () => {
		const reverseSplitBars = [
			...STORED_BARS.slice(0, 2).map((bar) => scaleBar(bar, 2)),
			...STORED_BARS.slice(2),
		];
		const risingStepBars = [
			...STORED_BARS.slice(0, 2).map((bar) => scaleBar(bar, 0.97)),
			...STORED_BARS.slice(2, 4).map((bar) => scaleBar(bar, 1.05)),
			STORED_BARS[4]!,
		];

		expect(detectAdjustmentOrCorrection(STORED_BARS, reverseSplitBars)).toMatchObject({
			kind: 'corrections',
		});
		expect(detectAdjustmentOrCorrection(STORED_BARS, risingStepBars)).toMatchObject({
			kind: 'corrections',
		});
	});

	test('estimates a low-priced ratio from every price rather than one rounded close', () => {
		const lowPricedBars = STORED_BARS.map((bar) => scaleBar(bar, 0.00018));
		const fetchedBars = [
			...lowPricedBars.slice(0, 3).map((bar) => scaleBar(bar, 0.97)),
			...lowPricedBars.slice(3),
		];
		const [ratio] = selectRatios(detectAdjustmentOrCorrection(lowPricedBars, fetchedBars));

		expect(Math.abs(ratio! - 0.97)).toBeLessThan(0.0001);
	});

	test('reports corrections when the refetch omits a session at a step boundary', () => {
		const fetchedBars = [
			...STORED_BARS.slice(0, 3).map((bar) => scaleBar(bar, 0.97)),
			STORED_BARS[4]!,
		];

		expect(detectAdjustmentOrCorrection(STORED_BARS, fetchedBars)).toMatchObject({
			kind: 'corrections',
		});
	});

	test('rejects a price that strays beyond the rounding tolerance', () => {
		const fetchedBars = [
			{ ...scaleBar(STORED_BARS[0]!, 0.97), high: roundPrice(STORED_BARS[0]!.high * 0.972) },
			scaleBar(STORED_BARS[1]!, 0.97),
		];

		expect(detectAdjustmentOrCorrection(STORED_BARS, fetchedBars)).toMatchObject({
			kind: 'corrections',
		});
	});
});

function selectRatios(revision: PriceRevision): readonly number[] {
	return revision.kind === 'adjustments'
		? revision.adjustments.map((adjustment) => adjustment.ratio)
		: [];
}

function createBar(sessionDate: string, close: number): DailyBar {
	return {
		sessionDate,
		open: close - 25,
		high: close + 60,
		low: close - 75,
		close,
		volume: 1_000_000,
	};
}

// The provider rounds adjusted prices to three decimals.
function scaleBar(bar: DailyBar, ratio: number): DailyBar {
	return {
		...bar,
		open: roundPrice(bar.open * ratio),
		high: roundPrice(bar.high * ratio),
		low: roundPrice(bar.low * ratio),
		close: roundPrice(bar.close * ratio),
	};
}

function roundPrice(price: number): number {
	return Math.round(price * 1_000) / 1_000;
}
