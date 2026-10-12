import { describe, expect, test } from 'bun:test';

import {
	describeEvent,
	formatEvaluatedPercent,
	formatEvaluatedValue,
	formatPendingRegimeTransition,
	formatPesoSwingLevel,
	formatPrice,
	formatSwingLevel,
} from './line-formatting.ts';

describe('formatEvaluatedValue', () => {
	test('shows a part the analysis could not evaluate as not evaluated', () => {
		expect(formatEvaluatedValue(null)).toBe('not evaluated');
	});

	test('shows an evaluated zero as a number, not as missing', () => {
		expect(formatEvaluatedValue(0)).toBe('0');
	});
});

describe('formatEvaluatedPercent', () => {
	test('shows a percentage with its sign and a percent mark', () => {
		expect(formatEvaluatedPercent(-4.2)).toBe('-4.2%');
	});

	test('shows a part the analysis could not evaluate as not evaluated', () => {
		expect(formatEvaluatedPercent(null)).toBe('not evaluated');
	});
});

describe('formatPrice', () => {
	test('labels a price with the snapshot unit', () => {
		expect(formatPrice(7.123, 'mep-dollar')).toBe('7.12 MEP dollars');
	});
});

describe('formatPendingRegimeTransition', () => {
	test('shows the candidate and its confirmations out of the required ones', () => {
		const pending = {
			candidate: 'bearish',
			confirmations: 2,
			requiredConfirmations: 3,
		} as const;

		expect(formatPendingRegimeTransition(pending)).toBe('bearish, 2 of 3 confirmations');
	});

	test('shows no candidate as none, not as a part the analysis could not evaluate', () => {
		expect(formatPendingRegimeTransition(null)).toBe('none');
	});
});

describe('formatSwingLevel', () => {
	test('labels the swing price with the snapshot unit and the distance as a percentage', () => {
		const swingHigh = {
			kind: 'high',
			price: 7.5,
			occurredAtSession: '2026-09-01',
			confirmedAtSession: '2026-09-04',
			priceRelativeToSwingInPercent: -5,
		} as const;

		expect(formatSwingLevel(swingHigh, 'mep-dollar')).toBe(
			'7.5 MEP dollars (occurred 2026-09-01, confirmed 2026-09-04), close -5% from it',
		);
	});

	test('says the distance was not evaluated instead of placing it in a sentence', () => {
		const swingLow = {
			kind: 'low',
			price: 3.68,
			occurredAtSession: '2026-10-01',
			confirmedAtSession: '2026-10-06',
			priceRelativeToSwingInPercent: null,
		} as const;

		expect(formatSwingLevel(swingLow, 'mep-dollar')).toBe(
			'3.68 MEP dollars (occurred 2026-10-01, confirmed 2026-10-06), distance from the close not evaluated',
		);
	});

	test('shows a kind with no confirmed swing as none confirmed yet', () => {
		expect(formatSwingLevel(null, 'mep-dollar')).toBe('none confirmed yet');
	});
});

describe('formatPesoSwingLevel', () => {
	const conversion = { sessionDate: '2026-10-09', mepRate: 1500.46 };

	test('labels a peso level as an equivalent at a stated session and MEP rate', () => {
		expect(formatPesoSwingLevel(11_250.12, conversion)).toBe(
			'≈ 11,250.12 pesos, its equivalent at the 2026-10-09 MEP rate of 1,500.46 pesos per MEP dollar',
		);
	});

	test('shows a kind with no confirmed swing as none confirmed yet', () => {
		expect(formatPesoSwingLevel(null, conversion)).toBe('none confirmed yet');
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
