import { describe, expect, test } from 'bun:test';

import { buildBars, loadNflxFixture } from '../tests/support/index.ts';
import { calculateAtr } from './index.ts';

describe('calculateAtr', () => {
	test('seeds with a simple mean and then uses Wilder smoothing', () => {
		expect(calculateAtr(buildBars([100, 110, 111]), 2)).toEqual([null, 7.5, 5.25]);
	});

	test('keeps warm-up positions absent', () => {
		expect(calculateAtr(buildBars([1, 2]), 3)).toEqual([null, null]);
	});

	test('does not change earlier output when future bars are appended', () => {
		const prefix = calculateAtr(buildBars([1, 2, 3]), 3);
		const full = calculateAtr(buildBars([1, 2, 3, 100]), 3);

		expect(full.slice(0, prefix.length)).toEqual([...prefix]);
	});

	test('matches the NFLX reference value', async () => {
		const bars = await loadNflxFixture();

		expect(calculateAtr(bars).at(-1)).toBeCloseTo(2.35, 2);
	});

	test('rejects invalid periods', () => {
		expect(() => calculateAtr([], -1)).toThrow(TypeError);
		expect(() => calculateAtr([], Number.NaN)).toThrow(TypeError);
	});
});
