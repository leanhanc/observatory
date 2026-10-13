import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { PeriodReturn } from './period-returns.types.ts';

/**
 * Measures how far the last bar's close moved over each configured window of calendar months: one
 * month, three months and one year. For peso lines, pass the Dollarized Series, so the change is in
 * MEP dollars.
 *
 * A window starts on the anchor's date minus its months; a day the target month lacks becomes that
 * month's last day. The start close is the line's last close on or before that date, the close
 * already known on it when the date was not a session or the line did not trade.
 *
 * Expects validated Daily Bars ordered oldest to newest.
 */
export function calculatePeriodReturns(bars: readonly DailyBar[]): readonly PeriodReturn[] {
	const { windowMonths } = ANALYSIS_CONFIGURATION.periodReturns;
	const anchorBar = bars.at(-1);

	if (anchorBar === undefined) {
		return windowMonths.map(createUnavailableReturn);
	}

	const anchorDate = Temporal.PlainDate.from(anchorBar.sessionDate);

	return windowMonths.map((months) => {
		// `subtract` constrains by default, so 31 March minus one month is 28 or 29 February.
		const startDate = anchorDate.subtract({ months }).toString();
		return measureReturn(bars, anchorBar, startDate, months);
	});
}

function measureReturn(
	bars: readonly DailyBar[],
	anchorBar: DailyBar,
	startDate: string,
	windowMonths: number,
): PeriodReturn {
	const startBar = bars.findLast((bar) => bar.sessionDate <= startDate);

	// Validated prices are positive, so a zero start close is not expected; dividing by it is undefined.
	if (startBar === undefined || startBar.close === 0) {
		return createUnavailableReturn(windowMonths);
	}

	const percentChange = ((anchorBar.close - startBar.close) / startBar.close) * 100;

	if (!Number.isFinite(percentChange)) {
		return createUnavailableReturn(windowMonths);
	}

	return { windowMonths, fromSessionDate: startBar.sessionDate, percentChange };
}

function createUnavailableReturn(windowMonths: number): PeriodReturn {
	return { windowMonths, fromSessionDate: null, percentChange: null };
}
