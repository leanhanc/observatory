import { calculateBondCloseRatios } from './bond-close-ratio.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { CclRateSession } from './dollarized-series.types.ts';

/**
 * Derives the implied CCL (cable) rate of each session from a bond quoted in pesos (AL30) and in
 * dollars settled abroad (AL30C): peso close divided by cable close, under the same-session rules
 * and preconditions of `calculateBondCloseRatios`. Both legs must use the same settlement term.
 *
 * The CCL Rate is for display only and is never used to dollarize or analyze a line.
 *
 * @returns One row per session with a rate, in the peso-bond input order.
 */
export function calculateCclRates(
	pesoBondBars: readonly DailyBar[],
	cableBondBars: readonly DailyBar[],
): readonly CclRateSession[] {
	return calculateBondCloseRatios(pesoBondBars, cableBondBars).map(
		({ sessionDate, closeRatio }) => ({ sessionDate, cclRate: closeRatio }),
	);
}
