import { describe, expect, test } from 'bun:test';

import { buildPaddedDomain, placeOnScale, placeReturnBars } from './visual-scale.ts';

describe('placeOnScale', () => {
	test('places a value by linear interpolation between the ends', () => {
		expect(placeOnScale(34, { min: 0, max: 100 })).toBe(34);
		expect(placeOnScale(-1.3, { min: -3, max: 3 })).toBeCloseTo(28.333, 3);
	});

	// A stretch of 4,2 ATR on a ±3 scale reaches the end; its sentence still says 4,2.
	test('clamps a value beyond the scale to its end', () => {
		expect(placeOnScale(4.2, { min: -3, max: 3 })).toBe(100);
		expect(placeOnScale(-7, { min: -3, max: 3 })).toBe(0);
	});
});

describe('buildPaddedDomain', () => {
	test('widens the span of the values on each side', () => {
		expect(buildPaddedDomain([4, 5, 6], 0.1)).toEqual({ min: 3.8, max: 6.2 });
	});

	test('gives a single value a span around it, so it sits in the middle', () => {
		const domain = buildPaddedDomain([5], 0.1);

		expect(placeOnScale(5, domain)).toBe(50);
	});
});

describe('placeReturnBars', () => {
	test('puts every bar on one scale, the longest filling the track', () => {
		const [month, quarter, year] = placeReturnBars([-15.1, -26.3, 25.1]);

		expect(month!.zeroPosition).toBeCloseTo((26.3 / 51.4) * 100, 9);
		expect(quarter!.width).toBeCloseTo((26.3 / 51.4) * 100, 9);
		expect(year!.width).toBeCloseTo((25.1 / 51.4) * 100, 9);
	});

	test('keeps zero at the left end when every change is a rise', () => {
		const bars = placeReturnBars([5, 10]);

		expect(bars.map((bar) => bar!.zeroPosition)).toEqual([0, 0]);
		expect(bars[1]!.width).toBe(100);
	});

	test('draws no bar for an unavailable return', () => {
		expect(placeReturnBars([null, 10])[0]).toBeNull();
	});

	test('draws no bar at all when nothing moved or nothing is readable', () => {
		expect(placeReturnBars([0, 0, null])).toEqual([null, null, null]);
		expect(placeReturnBars([null])).toEqual([null]);
	});
});
