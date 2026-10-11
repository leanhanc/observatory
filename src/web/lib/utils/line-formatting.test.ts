import { describe, expect, test } from 'bun:test';

import { formatEvaluatedValue } from './line-formatting.ts';

describe('formatEvaluatedValue', () => {
	test('shows a part the analysis could not evaluate as not evaluated', () => {
		expect(formatEvaluatedValue(null)).toBe('not evaluated');
	});

	test('shows an evaluated zero as a number, not as missing', () => {
		expect(formatEvaluatedValue(0)).toBe('0');
	});
});
