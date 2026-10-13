import { describe, expect, test } from 'bun:test';

import {
	describeEvent,
	formatEvaluatedPercent,
	formatEvaluatedValue,
	formatPendingRegimeTransition,
	formatPeriodReturn,
	formatPesoEquivalent,
	formatPesoSwingLevel,
	formatPrice,
	formatResistance,
	formatSituation,
	formatSupport,
	formatSwingLevel,
	formatTippingClose,
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
			closePosition: 'at-or-below',
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
			closePosition: 'at-or-above',
		} as const;

		expect(formatSwingLevel(swingLow, 'mep-dollar')).toBe(
			'3.68 MEP dollars (occurred 2026-10-01, confirmed 2026-10-06), distance from the close not evaluated',
		);
	});

	test('shows a kind with no confirmed swing as none confirmed yet', () => {
		expect(formatSwingLevel(null, 'mep-dollar')).toBe('none confirmed yet');
	});
});

describe('formatSupport and formatResistance', () => {
	const swing = {
		price: 7.5,
		occurredAtSession: '2026-09-01',
		confirmedAtSession: '2026-09-04',
		priceRelativeToSwingInPercent: 0,
	} as const;

	test('shows the classification the analysis made, including a close exactly on the level', () => {
		expect(formatSupport({ ...swing, kind: 'low', closePosition: 'at-or-above' })).toBe(
			'Support',
		);
		expect(formatResistance({ ...swing, kind: 'high', closePosition: 'at-or-below' })).toBe(
			'Resistance',
		);
	});

	test('shows a level the close is beyond as no longer Support or Resistance', () => {
		expect(formatSupport({ ...swing, kind: 'low', closePosition: 'below' })).toBe(
			'not Support: the close is below it',
		);
		expect(formatResistance({ ...swing, kind: 'high', closePosition: 'above' })).toBe(
			'not Resistance: the close is above it',
		);
	});

	test('shows a missing level as none confirmed yet', () => {
		expect(formatSupport(null)).toBe('none confirmed yet');
		expect(formatResistance(null)).toBe('none confirmed yet');
	});
});

describe('formatTippingClose', () => {
	const tippingCloses = {
		bullish: { closeAbove: 4.2, isFastEmaAligned: false },
		bearish: { closeBelow: 3.8, isFastEmaAligned: true },
	} as const;
	const pesoEquivalents = {
		sessionDate: '2026-10-09',
		mepRate: 1500,
		close: 6000,
		lastConfirmedSwingHigh: null,
		lastConfirmedSwingLow: null,
		regimeTippingCloses: { bullishCloseAbove: 6300, bearishCloseBelow: 5700 },
	} as const;

	test('puts each close’s peso equivalent right after it, then whether EMA50 meets its condition', () => {
		expect(formatTippingClose('bullish', tippingCloses, pesoEquivalents, 'mep-dollar')).toBe(
			'a close above 4.2 MEP dollars (≈ 6,300 pesos, its equivalent at the 2026-10-09 MEP rate of 1,500 pesos per MEP dollar); EMA50 is not above EMA200',
		);
		expect(formatTippingClose('bearish', tippingCloses, pesoEquivalents, 'mep-dollar')).toBe(
			'a close below 3.8 MEP dollars (≈ 5,700 pesos, its equivalent at the 2026-10-09 MEP rate of 1,500 pesos per MEP dollar); EMA50 is already below EMA200',
		);
	});
});

describe('formatPeriodReturn', () => {
	test('shows the change with its window and start session', () => {
		expect(
			formatPeriodReturn({
				windowMarketSessions: 21,
				fromSessionDate: '2026-09-09',
				percentChange: -12.345,
			}),
		).toBe('21 Market Sessions: -12.35% since the close of 2026-09-09');
	});

	test('shows a zero change as 0%, and a missing one as not evaluated', () => {
		expect(
			formatPeriodReturn({
				windowMarketSessions: 63,
				fromSessionDate: '2026-07-01',
				percentChange: 0,
			}),
		).toBe('63 Market Sessions: 0% since the close of 2026-07-01');
		expect(
			formatPeriodReturn({
				windowMarketSessions: 252,
				fromSessionDate: null,
				percentChange: null,
			}),
		).toBe('252 Market Sessions: not evaluated');
	});
});

describe('formatSituation', () => {
	const level = {
		kind: 'low',
		price: 1.86,
		occurredAtSession: '2026-09-28',
		confirmedAtSession: '2026-10-01',
	} as const;
	const situation = {
		type: 'below-last-confirmed-low-in-bearish-regime',
		activeSinceSession: '2026-10-02',
		level,
	} as const;
	const latestState = {
		sessionDate: '2026-10-09',
		regime: 'bearish',
		pendingRegimeTransition: null,
		regimeTippingCloses: null,
		structure: 'downtrend',
		lastConfirmedSwingHigh: null,
		lastConfirmedSwingLow: {
			...level,
			priceRelativeToSwingInPercent: -0.84,
			closePosition: 'below',
		},
		rsi: 39.4,
		priceRelativeToEmaInAtr: -0.9,
		priceRelativeToLongTermEmaInPercent: -8.8,
		situations: [situation],
	} as const;

	test('shows the type, start session, the State’s distance from the level and the level itself', () => {
		expect(formatSituation(situation, latestState, 'mep-dollar')).toBe(
			'below-last-confirmed-low-in-bearish-regime, since 2026-10-02: close -0.84% from the swing low at 1.86 MEP dollars (occurred 2026-09-28, confirmed 2026-10-01)',
		);
	});
});

describe('formatPesoEquivalent', () => {
	test('labels any peso equivalent with its session and MEP rate', () => {
		expect(formatPesoEquivalent(6300, { sessionDate: '2026-10-09', mepRate: 1500 })).toBe(
			'≈ 6,300 pesos, its equivalent at the 2026-10-09 MEP rate of 1,500 pesos per MEP dollar',
		);
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
