import { calculateBondCloseRatios } from './bond-close-ratio.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { CclRateSession } from './dollarized-series.types.ts';

/**
 * Derives the implied CCL (cable) rate of each session from a bond quoted in pesos (AL30) and in
 * dollars settled abroad (AL30C): peso close divided by cable close. It follows the MEP Rate's
 * rules: a rate only when both legs traded that session, and never a rate from another session.
 *
 * The CCL Rate is for display only and is never used to dollarize or analyze a line.
 *
 * Preconditions, not checked: both legs are chronological with one bar per session, every close
 * is positive and finite, and both legs use the same settlement term.
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
