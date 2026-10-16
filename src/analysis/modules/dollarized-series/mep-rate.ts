import { calculateBondCloseRatios } from './bond-close-ratio.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { MepRateSession } from './dollarized-series.types.ts';

/**
 * Derives the implied MEP rate of each session from a bond quoted in pesos (for example AL30) and in
 * local dollars (AL30D): peso close divided by dollar close, under the same-session rules and
 * preconditions of `calculateBondCloseRatios`.
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
	return calculateBondCloseRatios(pesoBondBars, dollarBondBars).map(
		({ sessionDate, closeRatio }) => ({ sessionDate, mepRate: closeRatio }),
	);
}
