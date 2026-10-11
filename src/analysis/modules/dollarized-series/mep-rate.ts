import type { DailyBar } from '#modules/bar-history/index.ts';
import type { MepRateSession } from './dollarized-series.types.ts';

/**
 * Derives the implied MEP rate of each session from a bond quoted in pesos
 * (for example AL30) and in dollars (AL30D): peso close divided by dollar close.
 *
 * A session has a rate only when both legs traded (volume above zero). A session
 * missing from either leg, or with a zero-volume leg, has no rate; no rate from
 * another session replaces it.
 *
 * Preconditions, not checked: both legs are chronological with one bar per
 * session, and every close is positive and finite. Open, high and low are not
 * read, so a bar whose only defect is in those fields yields a correct rate.
 *
 * Both legs must use the same settlement term as the peso bars later passed to
 * `dollarizeBarHistory`. Daily Bars carry no settlement, so this is not checked.
 *
 * @returns One row per session with a rate, in the peso-bond input order.
 */
export function calculateMepRates(
	pesoBondBars: readonly DailyBar[],
	dollarBondBars: readonly DailyBar[],
): readonly MepRateSession[] {
	const dollarBondBarsBySession = new Map(dollarBondBars.map((bar) => [bar.sessionDate, bar]));
	const rates: MepRateSession[] = [];

	for (const pesoBondBar of pesoBondBars) {
		const dollarBondBar = dollarBondBarsBySession.get(pesoBondBar.sessionDate);

		if (!dollarBondBar) {
			continue;
		}

		const hasBothLegsTraded = pesoBondBar.volume > 0 && dollarBondBar.volume > 0;

		if (!hasBothLegsTraded) {
			continue;
		}

		rates.push({
			sessionDate: pesoBondBar.sessionDate,
			mepRate: pesoBondBar.close / dollarBondBar.close,
		});
	}

	return rates;
}
