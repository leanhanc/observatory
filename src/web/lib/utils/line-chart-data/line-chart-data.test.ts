import { describe, expect, test } from 'bun:test';

import { describeLevels, formatCurrencyPrice } from '#web/lib/utils/line-wording/index.ts';

import { buildLineChartData } from './line-chart-data.ts';

import type { AvailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

type ChartLine = Pick<
	AvailableLine,
	'latestState' | 'pesoEquivalents' | 'cclEquivalents' | 'chartSeries'
>;

const pesoCandle = { sessionDate: '2026-10-09', open: 5880, high: 6000, low: 5800, close: 5940 };
const mepCandle = { sessionDate: '2026-10-09', open: 3.82, high: 3.9, low: 3.77, close: 3.86 };
const cclCandle = { sessionDate: '2026-10-09', open: 3.65, high: 3.72, low: 3.6, close: 3.68 };
const line: ChartLine = {
	latestState: {
		sessionDate: '2026-10-09',
		regime: 'bearish',
		pendingRegimeTransition: null,
		regimeTippingCloses: {
			bullish: { closeAbove: 4.77, isFastEmaAligned: false },
			bearish: { closeBelow: 4.21, isFastEmaAligned: true },
		},
		structure: 'downtrend',
		lastConfirmedSwingHigh: {
			kind: 'high',
			price: 4.04,
			occurredAtSession: '2026-10-06',
			confirmedAtSession: '2026-10-09',
			priceRelativeToSwingInPercent: -4.5,
			closePosition: 'at-or-below',
		},
		lastConfirmedSwingLow: {
			kind: 'low',
			price: 3.68,
			occurredAtSession: '2026-10-01',
			confirmedAtSession: '2026-10-06',
			priceRelativeToSwingInPercent: -1,
			closePosition: 'below',
		},
		rsi: 34.2,
		priceRelativeToEmaInAtr: -1.43,
		priceRelativeToLongTermEmaInPercent: -17.8,
		longTermEma: 4.49,
		situations: [],
	},
	pesoEquivalents: {
		sessionDate: '2026-10-09',
		mepRate: 1540,
		close: 5940,
		lastConfirmedSwingHigh: 6223,
		lastConfirmedSwingLow: 5662,
		regimeTippingCloses: { bullishCloseAbove: 7344, bearishCloseBelow: 6480 },
		longTermEma: 6912,
	},
	cclEquivalents: {
		sessionDate: '2026-10-09',
		cclRate: 1612,
		close: 3.6849,
		lastConfirmedSwingHigh: 3.8604,
		lastConfirmedSwingLow: 3.5124,
		regimeTippingCloses: { bullishCloseAbove: 4.5558, bearishCloseBelow: 4.0199 },
		longTermEma: 4.2879,
	},
	chartSeries: { peso: [pesoCandle], mep: [mepCandle], ccl: [cclCandle] },
};

describe('buildLineChartData', () => {
	test('gives each offered view its own candles and the levels its text names, unconverted', () => {
		expect(buildLineChartData(line, ['ars', 'usd', 'ccl'])).toEqual({
			currencyViews: {
				ars: { candles: [pesoCandle], support: null, resistance: 6223 },
				usd: { candles: [mepCandle], support: null, resistance: 4.04 },
				ccl: { candles: [cclCandle], support: null, resistance: 3.8604 },
			},
		});
	});

	// The chart draws the same levels the "Soporte y resistencia" text names, and none it does not.
	test('names in each view exactly the levels the text names', () => {
		const { currencyViews } = buildLineChartData(line, ['ars', 'usd', 'ccl']);

		for (const currency of ['ars', 'usd', 'ccl'] as const) {
			const levelsText = describeLevels(line, currency)
				.flat()
				.map((segment) => (typeof segment === 'string' ? segment : segment.strong))
				.join('');
			const view = currencyViews[currency]!;

			expect(levelsText).toContain(
				`Resistencia en ${formatCurrencyPrice(view.resistance!, currency)}`,
			);
			expect(view.support).toBeNull();
			expect(levelsText).not.toContain('Soporte en');
		}
	});

	test('has no entry for a view the page does not offer', () => {
		expect(Object.keys(buildLineChartData(line, ['ars', 'usd']).currencyViews)).toEqual([
			'ars',
			'usd',
		]);
		expect(Object.keys(buildLineChartData(line, ['usd']).currencyViews)).toEqual(['usd']);
	});
});
