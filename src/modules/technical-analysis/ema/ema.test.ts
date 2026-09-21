import { describe, expect, test } from 'bun:test';

import { loadNflxFixture } from '../tests/support/index.ts';
import { calculateEma } from './index.ts';

describe('calculateEma', () => {
	test('seeds on the first value and keeps warm-up positions absent', () => {
		expect(calculateEma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2.25, 3.125, 4.0625]);
	});

	test('does not change earlier output when future values are appended', () => {
		const prefix = calculateEma([1, 2, 3], 3);
		const full = calculateEma([1, 2, 3, 100], 3);

		expect(full.slice(0, prefix.length)).toEqual([...prefix]);
	});

	test('matches the NFLX reference values', async () => {
		const bars = await loadNflxFixture();
		const closes = bars.map((bar) => bar.close);

		expect(calculateEma(closes, 20).at(-1)).toBeCloseTo(76.17, 2);
		expect(calculateEma(closes, 50).at(-1)).toBeCloseTo(76.73, 2);
		expect(calculateEma(closes, 200).at(-1)).toBeCloseTo(87.44, 2);
	});

	test('rejects invalid periods', () => {
		expect(() => calculateEma([], 0)).toThrow(TypeError);
		expect(() => calculateEma([], 1.5)).toThrow(TypeError);
	});
});
