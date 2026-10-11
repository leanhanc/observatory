import type { DailyBar } from '#modules/bar-history/index.ts';
import type { DollarizedSeries, MepRateSession } from './dollarized-series.types.ts';

/**
 * Converts peso-line Daily Bars to MEP dollars by dividing open, high, low and
 * close by that same session's MEP rate. Volume is a count of shares or CEDEARs and is copied.
 *
 * The rate is the session's closing rate, so movement of the exchange rate
 * inside the session is ignored. The CCL/MEP difference is neither computed nor
 * corrected; it stays in the series as accepted noise.
 *
 * A zero-volume peso bar is dollarized like any other: Bar History keeps it as
 * valid, and the traded-leg rule applies only to the bonds behind the rate.
 *
 * A peso session without a rate yields no bar and is listed in
 * `sessionsWithoutMepRate`; no earlier or later rate is carried in. Rates for
 * sessions without a peso bar are ignored.
 *
 * Preconditions, not checked: `pesoLineBars` is a validated Daily Bar history
 * (chronological, one bar per session, positive finite prices) and every
 * `mepRate` is positive and finite. Output follows the peso input order.
 *
 * The peso bars and the bond pair behind `mepRates` must share a settlement
 * term. Daily Bars carry no settlement, so this is not checked.
 */
export function dollarizeBarHistory(
	pesoLineBars: readonly DailyBar[],
	mepRates: readonly MepRateSession[],
): DollarizedSeries {
	const mepRatesBySession = new Map(mepRates.map((rate) => [rate.sessionDate, rate.mepRate]));
	const bars: DailyBar[] = [];
	const sessionsWithoutMepRate: string[] = [];

	for (const pesoBar of pesoLineBars) {
		const mepRate = mepRatesBySession.get(pesoBar.sessionDate);

		if (mepRate === undefined) {
			sessionsWithoutMepRate.push(pesoBar.sessionDate);
			continue;
		}

		bars.push(divideBarPrices(pesoBar, mepRate));
	}

	return { bars, sessionsWithoutMepRate };
}

function divideBarPrices(bar: DailyBar, mepRate: number): DailyBar {
	return {
		sessionDate: bar.sessionDate,
		open: bar.open / mepRate,
		high: bar.high / mepRate,
		low: bar.low / mepRate,
		close: bar.close / mepRate,
		volume: bar.volume,
	};
}
