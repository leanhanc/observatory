import { validateDailyBars } from '#modules/bar-history/index.ts';

import type { DailyBar, ValidationIssue } from '#modules/bar-history/index.ts';
import type { MepRateSource, MepRateSourceBarsValidation } from './dollarized-series.types.ts';

// The provider marks a missing open with 0, which fails both the positive-price and the range check.
const ZERO_OPEN_ISSUE_CODES = new Set<ValidationIssue['code']>([
	'non-positive-price',
	'invalid-price-range',
]);

/**
 * The bond whose peso and local-dollar ("D") closes imply the MEP Rate: AL30
 * and AL30D, per ADR 0005. This selects the bond for the MEP Rate only; the
 * Instrument Catalog describes the lines without choosing them.
 *
 * Settlement is not represented in the Instrument Catalog. Callers must fetch
 * both lines with the same settlement term as the peso bars they dollarize.
 */
export const MEP_RATE_SOURCE: MepRateSource = Object.freeze({
	pesoBondTradingLineId: 'al30-bond-byma-ars',
	dollarBondTradingLineId: 'al30-bond-byma-usd-mep',
});

/**
 * Validates one MEP rate source line as a chronological Daily Bar history, with one exception: a
 * bar whose open is `0` is accepted when the open is its only invalid field.
 *
 * The provider has served traded AL30 and AL30D sessions with `open: 0` and a valid range and
 * close. The MEP Rate reads only close and volume, so the zero open is harmless there, while every
 * other field, including the close's place in the range, is still validated. Lines that are
 * analyzed get no such exception.
 *
 * @returns The remaining issues, empty when the line is usable, and the sessions accepted with a
 * zero open.
 */
export function validateMepRateSourceBars(bars: readonly DailyBar[]): MepRateSourceBarsValidation {
	const validation = validateDailyBars(bars, true, 'bars');
	const zeroOpenIndexes = bars.flatMap((bar, index) => (bar.open === 0 ? [index] : []));
	const zeroOpenPaths = new Set(zeroOpenIndexes.map((index) => `bars[${index}].open`));
	const issues = validation.issues.filter(
		(issue) => !(zeroOpenPaths.has(issue.path) && ZERO_OPEN_ISSUE_CODES.has(issue.code)),
	);

	return {
		issues,
		zeroOpenSessions: zeroOpenIndexes.map((index) => bars[index]!.sessionDate),
	};
}
