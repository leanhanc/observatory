import { describe, expect, test } from 'bun:test';

import { selectNamedTippingPoints, selectPatternLevel } from './line-levels.ts';
import { selectNamedLevels } from './line-wording.ts';

import type { AvailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

type PricedLine = Pick<AvailableLine, 'latestState' | 'pesoEquivalents' | 'cclEquivalents'>;
type SnapshotState = AvailableLine['latestState'];

const swingLow = {
	kind: 'low',
	price: 3.68,
	occurredAtSession: '2026-10-01',
	confirmedAtSession: '2026-10-06',
	priceRelativeToSwingInPercent: 4.9,
	closePosition: 'at-or-above',
} as const;
const swingHigh = {
	kind: 'high',
	price: 4.04,
	occurredAtSession: '2026-10-06',
	confirmedAtSession: '2026-10-09',
	priceRelativeToSwingInPercent: -4.5,
	closePosition: 'at-or-below',
} as const;
const state: SnapshotState = {
	sessionDate: '2026-10-09',
	regime: 'bearish',
	pendingRegimeTransition: null,
	regimeTippingCloses: {
		bullish: { closeAbove: 4.77, isFastEmaAligned: false },
		bearish: { closeBelow: 4.21, isFastEmaAligned: true },
	},
	structure: 'downtrend',
	lastConfirmedSwingHigh: swingHigh,
	lastConfirmedSwingLow: swingLow,
	rsi: 34.2,
	priceRelativeToEmaInAtr: -1.43,
	priceRelativeToLongTermEmaInPercent: -17.8,
	longTermEma: 4.49,
	situations: [],
};
const line: PricedLine = {
	latestState: state,
	pesoEquivalents: {
		sessionDate: '2026-10-09',
		mepRate: 1540,
		close: 5940,
		lastConfirmedSwingHigh: 6223,
		lastConfirmedSwingLow: 5662,
		regimeTippingCloses: { bullishCloseAbove: 7344, bearishCloseBelow: 6480 },
		longTermEma: 6912,
	},
	cclEquivalents: null,
};

describe('selectNamedLevels', () => {
	test('names both levels while the close is between them, in the view’s currency', () => {
		expect(selectNamedLevels(line, 'ars')).toEqual({ support: 5662, resistance: 6223 });
		expect(selectNamedLevels(line, 'usd')).toEqual({ support: 3.68, resistance: 4.04 });
	});

	// A close below the last confirmed low leaves no confirmed Support until a new low confirms;
	// the low is still the State's last confirmed swing.
	test('names no Support once the close is below the last confirmed low', () => {
		const belowLow = {
			...line,
			latestState: {
				...state,
				lastConfirmedSwingLow: { ...swingLow, closePosition: 'below' as const },
			},
		};

		expect(selectNamedLevels(belowLow, 'usd')).toEqual({ support: null, resistance: 4.04 });
	});

	test('names no Resistance once the close is above the last confirmed high', () => {
		const aboveHigh = {
			...line,
			latestState: {
				...state,
				lastConfirmedSwingHigh: { ...swingHigh, closePosition: 'above' as const },
			},
		};

		expect(selectNamedLevels(aboveHigh, 'ars')).toEqual({ support: 5662, resistance: null });
	});
});

describe('selectPatternLevel', () => {
	test('a downtrend breaks at the high and an uptrend at the low', () => {
		expect(selectPatternLevel(line)).toBe('high');
		expect(
			selectPatternLevel({ ...line, latestState: { ...state, structure: 'uptrend' } }),
		).toBe('low');
	});

	test('a range or an unclear pattern names no level', () => {
		expect(
			selectPatternLevel({ ...line, latestState: { ...state, structure: 'range' } }),
		).toBeNull();
		expect(
			selectPatternLevel({ ...line, latestState: { ...state, structure: 'undefined' } }),
		).toBeNull();
	});
});

describe('selectNamedTippingPoints', () => {
	test('a trend names the edge that would end it, and a mixed trend both', () => {
		expect(selectNamedTippingPoints(line)).toEqual([
			{ side: 'bearish', tag: 'deja de ser bajista' },
		]);
		expect(
			selectNamedTippingPoints({ ...line, latestState: { ...state, regime: 'bullish' } }),
		).toEqual([{ side: 'bullish', tag: 'deja de ser alcista' }]);
		expect(
			selectNamedTippingPoints({ ...line, latestState: { ...state, regime: 'mixed' } }),
		).toEqual([
			{ side: 'bullish', tag: 'pasa a ser alcista' },
			{ side: 'bearish', tag: 'pasa a ser bajista' },
		]);
	});

	test('names none while Regime is unreadable', () => {
		expect(
			selectNamedTippingPoints({
				...line,
				latestState: { ...state, regime: null, regimeTippingCloses: null },
			}),
		).toEqual([]);
	});
});
