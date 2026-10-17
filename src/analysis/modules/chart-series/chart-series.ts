import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';
import { dollarizePrice, toCclEquivalent } from '#modules/dollarized-series/index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { Candle, ChartSeries, ChartSeriesInput } from './chart-series.types.ts';

const DISPLAY_SIGNIFICANT_DIGITS = 6;

/**
 * Builds the line's candles in each display currency over the configured window of calendar
 * months, ending on `throughSessionDate`. For display only: no analysis reads a Chart Series.
 *
 * Every candle uses its own session's rate. A session without a MEP Rate has no MEP candle, and one
 * without a CCL Rate has no CCL candle; no other session's rate and no other currency's stands in.
 * A peso candle needs no rate, so the peso list keeps every corrected bar in the window.
 *
 * Expects one line's corrected bars ordered oldest to newest.
 */
export function buildChartSeries({
	pesoBars,
	mepRates,
	cclRates,
	throughSessionDate,
}: ChartSeriesInput): ChartSeries {
	const { historyMonths } = ANALYSIS_CONFIGURATION.chartSeries;
	// `subtract` constrains by default, so 29 February minus a year is 28 February.
	const startDate = Temporal.PlainDate.from(throughSessionDate)
		.subtract({ months: historyMonths })
		.toString();
	const windowBars = pesoBars.filter(
		(bar) => bar.sessionDate >= startDate && bar.sessionDate <= throughSessionDate,
	);
	const mepRatesBySession = new Map(mepRates.map((rate) => [rate.sessionDate, rate.mepRate]));
	const cclRatesBySession = new Map(cclRates.map((rate) => [rate.sessionDate, rate.cclRate]));

	return {
		peso: windowBars.map((bar) => toCandle(bar, (price) => price)),
		mep: convertBars(windowBars, mepRatesBySession, dollarizePrice),
		ccl: convertBars(windowBars, cclRatesBySession, toCclEquivalent),
	};
}

/**
 * Rounds every price to 6 significant digits for the snapshot. That is enough to draw a candle and
 * label an axis in any currency, and roughly halves the serialized series.
 */
export function roundChartSeriesForDisplay(series: ChartSeries): ChartSeries {
	return {
		peso: series.peso.map(roundCandle),
		mep: series.mep.map(roundCandle),
		ccl: series.ccl.map(roundCandle),
	};
}

function convertBars(
	bars: readonly DailyBar[],
	ratesBySession: ReadonlyMap<string, number>,
	convert: (valueInPesos: number, rate: number) => number,
): readonly Candle[] {
	return bars.flatMap((bar) => {
		const rate = ratesBySession.get(bar.sessionDate);

		if (rate === undefined) {
			return [];
		}

		return [toCandle(bar, (price) => convert(price, rate))];
	});
}

function toCandle(bar: DailyBar, convert: (price: number) => number): Candle {
	return {
		sessionDate: bar.sessionDate,
		open: convert(bar.open),
		high: convert(bar.high),
		low: convert(bar.low),
		close: convert(bar.close),
	};
}

function roundCandle(candle: Candle): Candle {
	return {
		sessionDate: candle.sessionDate,
		open: roundToDisplayPrecision(candle.open),
		high: roundToDisplayPrecision(candle.high),
		low: roundToDisplayPrecision(candle.low),
		close: roundToDisplayPrecision(candle.close),
	};
}

function roundToDisplayPrecision(price: number): number {
	return Number(price.toPrecision(DISPLAY_SIGNIFICANT_DIGITS));
}
