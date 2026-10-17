import { describe, expect, test } from 'bun:test';

import { buildChartSeries, roundChartSeriesForDisplay } from './chart-series.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { CclRateSession, MepRateSession } from '#modules/dollarized-series/index.ts';
import type { ChartSeries } from './chart-series.types.ts';

describe('buildChartSeries', () => {
	test('converts each session at its own MEP and CCL Rates', () => {
		const pesoBars = [
			buildBar('2026-10-13', { open: 5880, high: 6000, low: 5800, close: 5940 }),
		];

		const series = buildChartSeries({
			pesoBars,
			mepRates: [{ sessionDate: '2026-10-13', mepRate: 1500 }],
			cclRates: [{ sessionDate: '2026-10-13', cclRate: 1600 }],
			throughSessionDate: '2026-10-13',
		});

		expect(series.peso).toEqual([
			{ sessionDate: '2026-10-13', open: 5880, high: 6000, low: 5800, close: 5940 },
		]);
		expect(series.mep[0]!.open).toBeCloseTo(3.92, 12);
		expect(series.mep[0]!.high).toBeCloseTo(4, 12);
		expect(series.mep[0]!.low).toBeCloseTo(3.866666666667, 12);
		expect(series.mep[0]!.close).toBeCloseTo(3.96, 12);
		expect(series.ccl).toEqual([
			{ sessionDate: '2026-10-13', open: 3.675, high: 3.75, low: 3.625, close: 3.7125 },
		]);
	});

	// A rate from a neighboring session would move the candle by that day's change in the dollar,
	// which is not a price the line had.
	test('a session without a CCL Rate is missing only in CCL dollars, never filled from a neighbor', () => {
		const sessions = ['2026-09-08', '2026-09-09', '2026-09-10'];

		const series = buildChartSeries({
			pesoBars: sessions.map((date) => buildBar(date, { close: 1000 })),
			mepRates: sessions.map((date) => ({ sessionDate: date, mepRate: 1000 })),
			cclRates: [
				{ sessionDate: '2026-09-08', cclRate: 1000 },
				{ sessionDate: '2026-09-10', cclRate: 1250 },
			],
			throughSessionDate: '2026-09-10',
		});

		expect(listSessions(series)).toEqual({
			peso: sessions,
			mep: sessions,
			ccl: ['2026-09-08', '2026-09-10'],
		});
		expect(series.ccl.map((candle) => candle.close)).toEqual([1, 0.8]);
	});

	test('a session without a MEP Rate stays in pesos and is missing in MEP dollars', () => {
		const sessions = ['2026-09-08', '2026-09-09', '2026-09-10'];

		const series = buildChartSeries({
			pesoBars: sessions.map((date) => buildBar(date, { close: 1600 })),
			mepRates: [
				{ sessionDate: '2026-09-08', mepRate: 1600 },
				{ sessionDate: '2026-09-10', mepRate: 1600 },
			],
			cclRates: sessions.map((date) => ({ sessionDate: date, cclRate: 1600 })),
			throughSessionDate: '2026-09-10',
		});

		expect(listSessions(series)).toEqual({
			peso: sessions,
			mep: ['2026-09-08', '2026-09-10'],
			ccl: sessions,
		});
	});

	test('ends on the latest State session, even when a later peso bar exists', () => {
		const sessions = ['2026-10-12', '2026-10-13', '2026-10-14'];

		const series = buildChartSeries({
			pesoBars: sessions.map((date) => buildBar(date, { close: 1000 })),
			mepRates: buildRates(sessions.slice(0, 2), 1000),
			cclRates: [],
			throughSessionDate: '2026-10-13',
		});

		expect(series.peso.at(-1)!.sessionDate).toBe('2026-10-13');
		expect(series.mep.at(-1)!.sessionDate).toBe('2026-10-13');
	});

	test('covers 24 calendar months back from the latest State session', () => {
		const sessions = ['2024-10-11', '2024-10-12', '2024-10-13', '2024-10-14', '2026-10-13'];

		const series = buildChartSeries({
			pesoBars: sessions.map((date) => buildBar(date, { close: 1000 })),
			mepRates: buildRates(sessions, 1000),
			cclRates: [],
			throughSessionDate: '2026-10-13',
		});

		expect(series.peso.map((candle) => candle.sessionDate)).toEqual([
			'2024-10-13',
			'2024-10-14',
			'2026-10-13',
		]);
	});

	test('a start day the target month lacks becomes that month’s last day', () => {
		// 29 February 2028 minus 24 months would be 29 February 2026, which does not exist.
		const sessions = ['2026-02-27', '2026-02-28', '2026-03-02', '2028-02-29'];

		const series = buildChartSeries({
			pesoBars: sessions.map((date) => buildBar(date, { close: 1000 })),
			mepRates: buildRates(sessions, 1000),
			cclRates: [],
			throughSessionDate: '2028-02-29',
		});

		expect(series.peso.map((candle) => candle.sessionDate)).toEqual([
			'2026-02-28',
			'2026-03-02',
			'2028-02-29',
		]);
	});

	test('a run without CCL Rates has no CCL candles and the same peso and MEP candles', () => {
		const sessions = ['2026-10-12', '2026-10-13'];
		const input = {
			pesoBars: sessions.map((date) => buildBar(date, { close: 1000 })),
			mepRates: buildRates(sessions, 1000),
			throughSessionDate: '2026-10-13',
		};

		const withoutCcl = buildChartSeries({ ...input, cclRates: [] });
		const withCcl = buildChartSeries({
			...input,
			cclRates: sessions.map((date) => ({ sessionDate: date, cclRate: 1100 })),
		});

		expect(withoutCcl.ccl).toEqual([]);
		expect(withoutCcl.peso).toEqual(withCcl.peso);
		expect(withoutCcl.mep).toEqual(withCcl.mep);
	});

	test('does not mutate its input', () => {
		const pesoBars = Object.freeze([Object.freeze(buildBar('2026-10-13', { close: 1000 }))]);
		const mepRates: readonly MepRateSession[] = Object.freeze([
			Object.freeze({ sessionDate: '2026-10-13', mepRate: 1000 }),
		]);
		const cclRates: readonly CclRateSession[] = Object.freeze([
			Object.freeze({ sessionDate: '2026-10-13', cclRate: 1100 }),
		]);

		expect(() =>
			buildChartSeries({ pesoBars, mepRates, cclRates, throughSessionDate: '2026-10-13' }),
		).not.toThrow();
	});
});

describe('roundChartSeriesForDisplay', () => {
	test('keeps 6 significant digits in every currency', () => {
		const series: ChartSeries = {
			peso: [{ sessionDate: '2026-10-13', open: 5940.123, high: 1, low: 1, close: 107775.5 }],
			mep: [{ sessionDate: '2026-10-13', open: 3.857312345, high: 1, low: 1, close: 1 }],
			ccl: [{ sessionDate: '2026-10-13', open: 0.023712345, high: 1, low: 1, close: 1 }],
		};

		const rounded = roundChartSeriesForDisplay(series);

		expect(rounded.peso[0]!.open).toBe(5940.12);
		expect(rounded.peso[0]!.close).toBe(107776);
		expect(rounded.mep[0]!.open).toBe(3.85731);
		expect(rounded.ccl[0]!.open).toBe(0.0237123);
	});
});

function buildBar(
	sessionDate: string,
	prices: Partial<Pick<DailyBar, 'open' | 'high' | 'low' | 'close'>>,
): DailyBar {
	const close = prices.close ?? 1000;
	return {
		sessionDate,
		open: prices.open ?? close,
		high: prices.high ?? close,
		low: prices.low ?? close,
		close,
		volume: 100,
	};
}

function buildRates(sessions: readonly string[], mepRate: number): readonly MepRateSession[] {
	return sessions.map((sessionDate) => ({ sessionDate, mepRate }));
}

function listSessions(series: ChartSeries): Record<keyof ChartSeries, readonly string[]> {
	return {
		peso: series.peso.map((candle) => candle.sessionDate),
		mep: series.mep.map((candle) => candle.sessionDate),
		ccl: series.ccl.map((candle) => candle.sessionDate),
	};
}
