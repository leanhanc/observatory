import { describe, expect, test } from 'bun:test';

import { calculateWilderAverage } from './index.ts';

describe('calculateWilderAverage', () => {
	test('retains prior observations and adds the current value', () => {
		expect(calculateWilderAverage(2, 5, 3)).toBe(3);
	});
});
