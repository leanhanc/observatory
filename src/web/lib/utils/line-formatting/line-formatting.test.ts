import { describe, expect, test } from 'bun:test';

import { describeEvent, formatEvaluatedValue, formatPrice } from './line-formatting.ts';

describe('formatEvaluatedValue', () => {
	test('shows a part the analysis could not evaluate as not evaluated', () => {
		expect(formatEvaluatedValue(null)).toBe('not evaluated');
	});

	test('shows an evaluated zero as a number, not as missing', () => {
		expect(formatEvaluatedValue(0)).toBe('0');
	});
});

describe('formatPrice', () => {
	test('labels a price with the snapshot unit', () => {
		expect(formatPrice(7.123, 'mep-dollar')).toBe('7.12 MEP dollars');
	});
});

describe('describeEvent', () => {
	test('labels a Structure Break close and swing price, not its other fields', () => {
		const description = describeEvent(
			{
				type: 'structure-break',
				direction: 'downward',
				priorStructure: 'uptrend',
				definingSwing: {
					kind: 'low',
					price: 7.5,
					occurredAtSession: '2026-09-01',
					confirmedAtSession: '2026-09-04',
				},
				closePrice: 7.12,
			},
			'mep-dollar',
		);

		expect(description).toBe(
			'downward break, prior structure uptrend: close 7.12 MEP dollars against the swing low at 7.5 MEP dollars (occurred 2026-09-01, confirmed 2026-09-04).',
		);
	});

	test('labels a Volatile Session True Range and ATR but not its multiple', () => {
		const description = describeEvent(
			{
				type: 'volatile-session',
				trueRange: 0.52,
				baselineAtr: 0.18,
				baselineThroughSessionDate: '2026-09-29',
				atrMultiple: 2.85,
			},
			'mep-dollar',
		);

		expect(description).toBe(
			'True Range 0.52 MEP dollars is 2.85 times the ATR 0.18 MEP dollars through 2026-09-29.',
		);
	});
});
