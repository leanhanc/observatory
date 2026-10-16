import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';

import type { PeriodReturn, SessionClose } from './period-returns.types.ts';

/**
 * Measures how far the last session's close moved over each configured window of calendar months:
 * one month, three months and one year. The currency is the caller's: for peso lines, pass the
 * Dollarized Series for MEP dollars, or the same sessions' closes in pesos or CCL dollars.
 *
 * A window starts on the anchor's date minus its months; a day the target month lacks becomes that
 * month's last day. The start session is the last one on or before that date, so the start close is
 * the one already known on it when the date was not a session or the line did not trade.
 *
 * A session whose close is `null` stays in the calendar: when it is the start or the anchor, the
 * return is unavailable, and no other session's close stands in for it.
 *
 * Expects one line's sessions ordered oldest to newest, with validated prices where not `null`.
 */
export function calculatePeriodReturns(
	sessionCloses: readonly SessionClose[],
): readonly PeriodReturn[] {
	const { windowMonths } = ANALYSIS_CONFIGURATION.periodReturns;
	const anchor = sessionCloses.at(-1);

	if (anchor === undefined) {
		return windowMonths.map(createUnavailableReturn);
	}

	const anchorDate = Temporal.PlainDate.from(anchor.sessionDate);

	return windowMonths.map((months) => {
		// `subtract` constrains by default, so 31 March minus one month is 28 or 29 February.
		const startDate = anchorDate.subtract({ months }).toString();
		return measureReturn(sessionCloses, anchor, startDate, months);
	});
}

function measureReturn(
	sessionCloses: readonly SessionClose[],
	anchor: SessionClose,
	startDate: string,
	windowMonths: number,
): PeriodReturn {
	const start = sessionCloses.findLast((session) => session.sessionDate <= startDate);
	const startClose = start?.close ?? null;
	const anchorClose = anchor.close;

	// Validated prices are positive, so a zero start close is not expected; dividing by it is undefined.
	if (start === undefined || startClose === null || anchorClose === null || startClose === 0) {
		return createUnavailableReturn(windowMonths);
	}

	const percentChange = ((anchorClose - startClose) / startClose) * 100;

	if (!Number.isFinite(percentChange)) {
		return createUnavailableReturn(windowMonths);
	}

	return { windowMonths, fromSessionDate: start.sessionDate, percentChange };
}

function createUnavailableReturn(windowMonths: number): PeriodReturn {
	return { windowMonths, fromSessionDate: null, percentChange: null };
}
