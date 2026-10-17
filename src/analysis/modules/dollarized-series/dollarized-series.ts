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
		open: dollarizePrice(bar.open, mepRate),
		high: dollarizePrice(bar.high, mepRate),
		low: dollarizePrice(bar.low, mepRate),
		close: dollarizePrice(bar.close, mepRate),
		volume: bar.volume,
	};
}

/**
 * Expresses a peso price in MEP dollars at one session's MEP Rate, as dollarization does. The
 * result describes that session only, so callers state the session whose rate they pass and never
 * pass another session's rate when that one has none.
 *
 * Precondition, not checked: `mepRate` is positive and finite.
 */
export function dollarizePrice(valueInPesos: number, mepRate: number): number {
	return valueInPesos / mepRate;
}

/**
 * Expresses a MEP-dollar price in pesos at one session's MEP Rate, the reverse of dollarization.
 * The result describes that session only: the same price has a different peso equivalent at every
 * other rate, so callers state the session whose rate they pass.
 *
 * Precondition, not checked: `mepRate` is positive and finite.
 */
export function toPesoEquivalent(valueInMepDollars: number, mepRate: number): number {
	return valueInMepDollars * mepRate;
}

/**
 * Expresses a peso price in CCL dollars at one session's CCL Rate. A MEP-dollar price gets there
 * through pesos at the same session: `toCclEquivalent(toPesoEquivalent(price, mepRate), cclRate)`.
 * The result describes that session only, so callers state the session whose rate they pass and
 * never pass another session's rate when that one has none.
 *
 * For display only: a CCL equivalent never enters the Dollarized Series or any analysis.
 *
 * Precondition, not checked: `cclRate` is positive and finite.
 */
export function toCclEquivalent(valueInPesos: number, cclRate: number): number {
	return valueInPesos / cclRate;
}
