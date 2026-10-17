import type { DailyBar } from '#modules/bar-history/index.ts';
import type { CclRateSession, MepRateSession } from '#modules/dollarized-series/index.ts';

/** One session's open, high, low and close in one currency, for drawing a Candlestick. */
export type Candle = Readonly<{
	sessionDate: string;
	open: number;
	high: number;
	low: number;
	close: number;
}>;

/**
 * One line's candles in pesos, MEP dollars and CCL dollars, oldest to newest. Each list holds only
 * the sessions that have a price in its currency, so the three can differ in length.
 */
export type ChartSeries = Readonly<{
	peso: readonly Candle[];
	mep: readonly Candle[];
	ccl: readonly Candle[];
}>;

export type ChartSeriesInput = Readonly<{
	/** The line's validated Daily Bars after Corporate Action correction, oldest to newest. */
	pesoBars: readonly DailyBar[];
	mepRates: readonly MepRateSession[];
	cclRates: readonly CclRateSession[];
	/** The latest State's session: the session the line page says it describes. */
	throughSessionDate: string;
}>;
