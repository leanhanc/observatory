import { describe, expect, test } from 'bun:test';

import { buildBars } from '../tests/support/index.ts';
import { calculateTrueRange } from './index.ts';

describe('calculateTrueRange', () => {
	test('uses high minus low for the first bar', () => {
		expect(calculateTrueRange(buildBars([100]))).toEqual([3]);
	});

	test('includes upward and downward gaps from the previous close', () => {
		const upwardGap = calculateTrueRange(buildBars([100, 110]));
		const downwardGap = calculateTrueRange(buildBars([100, 90]));

		expect(upwardGap).toEqual([3, 12]);
		expect(downwardGap).toEqual([3, 11]);
	});

	test('returns one value per input bar', () => {
		expect(calculateTrueRange([])).toEqual([]);
		expect(calculateTrueRange(buildBars([100, 101, 102]))).toHaveLength(3);
	});
});
