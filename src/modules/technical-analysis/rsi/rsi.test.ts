import { describe, expect, test } from 'bun:test';

import { loadNflxFixture } from '../tests/support/index.ts';
import { calculateRsi } from './index.ts';

describe('calculateRsi', () => {
	test('needs a full period of changes before producing a value', () => {
		expect(calculateRsi([1, 2, 3, 4, 5], 3)).toEqual([null, null, null, 100, 100]);
	});

	test('handles rising and falling series', () => {
		expect(calculateRsi([1, 2, 3], 2).at(-1)).toBe(100);
		expect(calculateRsi([3, 2, 1], 2).at(-1)).toBe(0);
	});

	test('reports no value until the series establishes a direction', () => {
		expect(calculateRsi([2, 2, 2], 2)).toEqual([null, null, null]);
	});

	test('preserves RSI through a later flat session', () => {
		expect(calculateRsi([1, 2, 1, 1], 2)).toEqual([null, null, 50, 50]);
	});

	test('seeds from every gain and loss in the initial period', () => {
		const result = calculateRsi([10, 12, 11, 14, 12], 3);

		expect(result[3]).toBeCloseTo(83.333333, 6);
		expect(result[4]).toBeCloseTo(55.555556, 6);
	});

	test('does not change earlier output when future values are appended', () => {
		const prefix = calculateRsi([1, 2, 1, 3], 3);
		const full = calculateRsi([1, 2, 1, 3, 100], 3);

		expect(full.slice(0, prefix.length)).toEqual([...prefix]);
	});

	test('matches the NFLX reference value', async () => {
		const bars = await loadNflxFixture();
		const closes = bars.map((bar) => bar.close);

		expect(calculateRsi(closes).at(-1)).toBeCloseTo(61.61, 2);
	});

	test('rejects invalid periods', () => {
		expect(() => calculateRsi([], 0)).toThrow(TypeError);
		expect(() => calculateRsi([], Number.POSITIVE_INFINITY)).toThrow(TypeError);
	});
});
