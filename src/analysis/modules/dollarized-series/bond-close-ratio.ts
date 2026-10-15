import type { DailyBar } from '#modules/bar-history/index.ts';

type BondCloseRatio = Readonly<{
	sessionDate: string;
	closeRatio: number;
}>;

/**
 * Divides each session's peso-bond close by the same session's dollar-bond close: the pesos per
 * dollar implied by one bond quoted in both currencies. The dollar leg decides which dollar: the
 * local-dollar line implies the MEP Rate and the cable line the CCL Rate.
 *
 * A session has a ratio only when both legs traded (volume above zero). A session missing from
 * either leg, or with a zero-volume leg, has no ratio; no ratio from another session replaces it.
 *
 * Preconditions, not checked: both legs are chronological with one bar per session, and every
 * close is positive and finite. Open, high and low are not read, so a bar whose only defect is in
 * those fields yields a correct ratio.
 *
 * @returns One row per session with a ratio, in the peso-bond input order.
 */
export function calculateBondCloseRatios(
	pesoBondBars: readonly DailyBar[],
	dollarBondBars: readonly DailyBar[],
): readonly BondCloseRatio[] {
	const dollarBondBarsBySession = new Map(dollarBondBars.map((bar) => [bar.sessionDate, bar]));
	const ratios: BondCloseRatio[] = [];

	for (const pesoBondBar of pesoBondBars) {
		const dollarBondBar = dollarBondBarsBySession.get(pesoBondBar.sessionDate);

		if (!dollarBondBar) {
			continue;
		}

		const hasBothLegsTraded = pesoBondBar.volume > 0 && dollarBondBar.volume > 0;

		if (!hasBothLegsTraded) {
			continue;
		}

		ratios.push({
			sessionDate: pesoBondBar.sessionDate,
			closeRatio: pesoBondBar.close / dollarBondBar.close,
		});
	}

	return ratios;
}
