import { describe, expect, test } from 'bun:test';

import { calculateAtr, calculateEma, calculateRsi } from '#modules/technical-analysis/index.ts';

import { calculateMepRates, dollarizeBarHistory } from './index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';

function buildBar(sessionDate: string, overrides: Partial<DailyBar> = {}): DailyBar {
	return {
		sessionDate,
		open: 100,
		high: 110,
		low: 90,
		close: 105,
		volume: 1000,
		...overrides,
	};
}

describe('calculateMepRates', () => {
	test('divides the peso close by the dollar close of the same session', () => {
		const pesoBond = [buildBar('2026-01-05', { open: 1, close: 90000 })];
		const dollarBond = [buildBar('2026-01-05', { open: 7, close: 60 })];

		expect(calculateMepRates(pesoBond, dollarBond)).toEqual([
			{ sessionDate: '2026-01-05', mepRate: 1500 },
		]);
	});

	test('does not use opens, highs or lows', () => {
		const pesoBond = [buildBar('2026-01-05', { open: 1, high: 999999, low: 1, close: 3000 })];
		const dollarBond = [buildBar('2026-01-05', { open: 3, high: 1, low: 0.5, close: 2 })];

		expect(calculateMepRates(pesoBond, dollarBond)[0]?.mepRate).toBe(1500);
	});

	test('produces rows only for sessions present in both legs', () => {
		const pesoBond = [buildBar('2026-01-05'), buildBar('2026-01-06'), buildBar('2026-01-07')];
		const dollarBond = [buildBar('2026-01-06'), buildBar('2026-01-07'), buildBar('2026-01-08')];

		const sessionDates = calculateMepRates(pesoBond, dollarBond).map(
			(rate) => rate.sessionDate,
		);

		expect(sessionDates).toEqual(['2026-01-06', '2026-01-07']);
	});

	test('produces no rate when either leg did not trade', () => {
		const pesoBond = [
			buildBar('2026-01-05', { volume: 0 }),
			buildBar('2026-01-06'),
			buildBar('2026-01-07'),
		];
		const dollarBond = [
			buildBar('2026-01-05'),
			buildBar('2026-01-06', { volume: 0 }),
			buildBar('2026-01-07'),
		];

		const sessionDates = calculateMepRates(pesoBond, dollarBond).map(
			(rate) => rate.sessionDate,
		);

		expect(sessionDates).toEqual(['2026-01-07']);
	});

	test('never carries a rate across a session where a leg did not trade', () => {
		const pesoBond = [
			buildBar('2026-01-05', { close: 1000 }),
			buildBar('2026-01-06', { close: 2000 }),
			buildBar('2026-01-07', { close: 3000 }),
			buildBar('2026-01-08', { close: 4000 }),
			buildBar('2026-01-09', { close: 5000 }),
		];
		const dollarBond = [
			buildBar('2026-01-05', { close: 1 }),
			buildBar('2026-01-06', { close: 1, volume: 0 }),
			buildBar('2026-01-07', { close: 1 }),
			// 2026-01-08 has no dollar bar at all
			buildBar('2026-01-09', { close: 1 }),
		];

		expect(calculateMepRates(pesoBond, dollarBond)).toEqual([
			{ sessionDate: '2026-01-05', mepRate: 1000 },
			{ sessionDate: '2026-01-07', mepRate: 3000 },
			{ sessionDate: '2026-01-09', mepRate: 5000 },
		]);
	});

	test('produces no rate for a session only the dollar leg has', () => {
		const pesoBond = [buildBar('2026-01-05'), buildBar('2026-01-07')];
		const dollarBond = [buildBar('2026-01-05'), buildBar('2026-01-06'), buildBar('2026-01-07')];

		const sessionDates = calculateMepRates(pesoBond, dollarBond).map(
			(rate) => rate.sessionDate,
		);

		expect(sessionDates).toEqual(['2026-01-05', '2026-01-07']);
	});

	test('divides without rounding the rate', () => {
		const pesoBond = [buildBar('2026-01-05', { close: 1000 })];
		const dollarBond = [buildBar('2026-01-05', { close: 3 })];

		expect(calculateMepRates(pesoBond, dollarBond)[0]?.mepRate).toBe(1000 / 3);
	});

	test('does not mutate or reorder its input', () => {
		const pesoBond = Object.freeze([
			Object.freeze(buildBar('2026-01-07')),
			Object.freeze(buildBar('2026-01-06')),
			Object.freeze(buildBar('2026-01-05')),
		]);
		const dollarBond = Object.freeze([
			Object.freeze(buildBar('2026-01-07')),
			Object.freeze(buildBar('2026-01-06')),
			Object.freeze(buildBar('2026-01-05')),
		]);

		const sessionDates = calculateMepRates(pesoBond, dollarBond).map(
			(rate) => rate.sessionDate,
		);

		expect(sessionDates).toEqual(['2026-01-07', '2026-01-06', '2026-01-05']);
	});
});

describe('dollarizeBarHistory', () => {
	test('divides open, high, low and close and copies volume', () => {
		const pesoBar = buildBar('2026-01-05', {
			open: 1000,
			high: 1100,
			low: 900,
			close: 1050,
			volume: 500,
		});

		const { bars } = dollarizeBarHistory(
			[pesoBar],
			[{ sessionDate: '2026-01-05', mepRate: 1000 }],
		);

		expect(bars).toEqual([
			{ sessionDate: '2026-01-05', open: 1, high: 1.1, low: 0.9, close: 1.05, volume: 500 },
		]);
	});

	test('never uses the rate of a neighboring session and reports the dropped session', () => {
		const pesoBars = [buildBar('2026-01-05'), buildBar('2026-01-06'), buildBar('2026-01-07')];
		const mepRates = [
			{ sessionDate: '2026-01-05', mepRate: 1000 },
			{ sessionDate: '2026-01-07', mepRate: 2000 },
		];

		const result = dollarizeBarHistory(pesoBars, mepRates);

		expect(result.bars.map((bar) => bar.sessionDate)).toEqual(['2026-01-05', '2026-01-07']);
		expect(result.bars[1]?.close).toBe(105 / 2000);
		expect(result.sessionsWithoutMepRate).toEqual(['2026-01-06']);
	});

	test('reports every dropped session in peso input order', () => {
		const pesoBars = [
			buildBar('2026-01-05'),
			buildBar('2026-01-06'),
			buildBar('2026-01-07'),
			buildBar('2026-01-08'),
			buildBar('2026-01-09'),
		];
		const mepRates = [
			{ sessionDate: '2026-01-05', mepRate: 1000 },
			{ sessionDate: '2026-01-07', mepRate: 1000 },
			{ sessionDate: '2026-01-09', mepRate: 1000 },
		];

		const result = dollarizeBarHistory(pesoBars, mepRates);

		expect(result.bars).toHaveLength(3);
		expect(result.sessionsWithoutMepRate).toEqual(['2026-01-06', '2026-01-08']);
	});

	test('ignores rates for sessions without a peso bar', () => {
		const mepRates = [
			{ sessionDate: '2026-01-04', mepRate: 900 },
			{ sessionDate: '2026-01-05', mepRate: 1000 },
		];

		const result = dollarizeBarHistory([buildBar('2026-01-05')], mepRates);

		expect(result.bars).toHaveLength(1);
		expect(result.sessionsWithoutMepRate).toEqual([]);
	});

	test('does not mutate or reorder its input', () => {
		const pesoBars = Object.freeze([
			Object.freeze(buildBar('2026-01-07')),
			Object.freeze(buildBar('2026-01-05')),
			Object.freeze(buildBar('2026-01-06')),
		]);
		const mepRates = Object.freeze([
			Object.freeze({ sessionDate: '2026-01-06', mepRate: 1000 }),
			Object.freeze({ sessionDate: '2026-01-07', mepRate: 1000 }),
			Object.freeze({ sessionDate: '2026-01-05', mepRate: 1000 }),
		]);

		const { bars } = dollarizeBarHistory(pesoBars, mepRates);

		expect(bars.map((bar) => bar.sessionDate)).toEqual([
			'2026-01-07',
			'2026-01-05',
			'2026-01-06',
		]);
	});

	test('dollarizes a zero-volume peso bar when its session has a rate', () => {
		const pesoBar = buildBar('2026-01-05', { close: 3000, volume: 0 });

		const result = dollarizeBarHistory(
			[pesoBar],
			[{ sessionDate: '2026-01-05', mepRate: 1500 }],
		);

		expect(result.bars[0]?.close).toBe(2);
		expect(result.bars[0]?.volume).toBe(0);
		expect(result.sessionsWithoutMepRate).toEqual([]);
	});

	test('divides by a rate that is not a whole number without rounding it', () => {
		const rate = 1000 / 3;

		const { bars } = dollarizeBarHistory(
			[buildBar('2026-01-05', { close: 105 })],
			[{ sessionDate: '2026-01-05', mepRate: rate }],
		);

		expect(bars[0]?.close).toBe(105 / rate);
	});

	test('returns empty output for empty input', () => {
		expect(dollarizeBarHistory([], [])).toEqual({ bars: [], sessionsWithoutMepRate: [] });
	});
});

// Deterministic walk with real ranges and enough bars for RSI14, EMA20 and ATR14.
function buildPesoBars(): DailyBar[] {
	let close = 1000;
	return Array.from({ length: 60 }, (_, index) => {
		close += Math.sin(index * 1.7) * 30 + Math.cos(index * 0.6) * 15;
		const sessionDate = `2026-02-${String(index + 1).padStart(2, '0')}`;
		return buildBar(sessionDate, {
			open: close - 5,
			high: close + 20 + (index % 5) * 3,
			low: close - 20 - (index % 3) * 4,
			close,
		});
	});
}

function buildRates(pesoBars: DailyBar[], rateOf: (index: number) => number) {
	return pesoBars.map((bar, index) => ({
		sessionDate: bar.sessionDate,
		mepRate: rateOf(index),
	}));
}

function measure(bars: readonly DailyBar[]) {
	const closes = bars.map((bar) => bar.close);
	const ema = calculateEma(closes, 20);
	const atr = calculateAtr(bars);
	const rsi = calculateRsi(closes);
	const closeAboveEmaInAtr = closes.map((close, index) => {
		const emaValue = ema[index];
		const atrValue = atr[index];
		if (emaValue == null || atrValue == null) {
			return null;
		}
		return (close - emaValue) / atrValue;
	});
	return { rsi, closeAboveEmaInAtr };
}

function largestGap(a: readonly (number | null)[], b: readonly (number | null)[]): number {
	return Math.max(...a.map((value, index) => Math.abs((value ?? 0) - (b[index] ?? 0))));
}

describe('why dollarize (explanatory examples)', () => {
	test('a flat asset in dollars stays flat when its peso price follows the MEP rate', () => {
		const rates = [1000, 1000, 1500, 1500, 1500];
		const dollarPrice = 2;
		const pesoBars = rates.map((rate, index) =>
			buildBar(`2026-01-0${index + 1}`, {
				open: dollarPrice * rate,
				high: dollarPrice * rate,
				low: dollarPrice * rate,
				close: dollarPrice * rate,
			}),
		);
		const mepRates = rates.map((mepRate, index) => ({
			sessionDate: `2026-01-0${index + 1}`,
			mepRate,
		}));

		const { bars } = dollarizeBarHistory(pesoBars, mepRates);

		expect(pesoBars[2]!.close / pesoBars[1]!.close).toBeCloseTo(1.5, 10);
		for (const bar of bars) {
			expect(bar.close).toBeCloseTo(dollarPrice, 10);
		}
	});

	test('a constant rate leaves RSI and (close - EMA) / ATR unchanged', () => {
		const pesoBars = buildPesoBars();
		const { bars: dollarBars } = dollarizeBarHistory(
			pesoBars,
			buildRates(pesoBars, () => 1250),
		);

		const peso = measure(pesoBars);
		const dollar = measure(dollarBars);

		expect(largestGap(peso.rsi, dollar.rsi)).toBeLessThan(1e-9);
		expect(largestGap(peso.closeAboveEmaInAtr, dollar.closeAboveEmaInAtr)).toBeLessThan(1e-9);
	});

	test('a moving rate changes RSI and (close - EMA) / ATR', () => {
		const pesoBars = buildPesoBars();
		// 2% devaluation per session: the rate adds its own percentage change to every close.
		const rates = buildRates(pesoBars, (index) => 1000 * 1.02 ** index);
		const { bars: dollarBars } = dollarizeBarHistory(pesoBars, rates);

		const peso = measure(pesoBars);
		const dollar = measure(dollarBars);

		expect(largestGap(peso.rsi, dollar.rsi)).toBeGreaterThan(1);
		expect(largestGap(peso.closeAboveEmaInAtr, dollar.closeAboveEmaInAtr)).toBeGreaterThan(0.1);
	});
});
