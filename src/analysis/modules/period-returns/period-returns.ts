import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { PeriodReturn } from './period-returns.types.ts';

/**
 * Measures how far the last bar's close moved over each configured window of Market Sessions:
 * about one month, three months and one year. For peso lines, pass the Dollarized Series, so the
 * change is in MEP dollars.
 *
 * Windows count Market Sessions rather than the line's bars, so a window spans the same dates for
 * every line. When the line did not trade on a window's start session, the start close is its last
 * close before it, which was already known on that session.
 *
 * Expects validated Daily Bars and Market Session dates, each ordered oldest to newest.
 */
export function calculatePeriodReturns(
	bars: readonly DailyBar[],
	marketSessionDates: readonly string[],
): readonly PeriodReturn[] {
	const { windowMarketSessions } = ANALYSIS_CONFIGURATION.periodReturns;
	const anchorBar = bars.at(-1);
	const anchorPosition = anchorBar ? marketSessionDates.indexOf(anchorBar.sessionDate) : -1;

	// Dollarized bars exist only on Market Sessions, so an anchor outside them is not expected.
	if (anchorBar === undefined || anchorPosition < 0) {
		return windowMarketSessions.map(createUnavailableReturn);
	}

	return windowMarketSessions.map((window) => {
		const startSessionDate = marketSessionDates[anchorPosition - window];

		if (startSessionDate === undefined) {
			return createUnavailableReturn(window);
		}

		return measureReturn(bars, anchorBar, startSessionDate, window);
	});
}

function measureReturn(
	bars: readonly DailyBar[],
	anchorBar: DailyBar,
	startSessionDate: string,
	windowMarketSessions: number,
): PeriodReturn {
	const startBar = bars.findLast((bar) => bar.sessionDate <= startSessionDate);

	// Validated prices are positive, so a zero start close is not expected; dividing by it is undefined.
	if (startBar === undefined || startBar.close === 0) {
		return createUnavailableReturn(windowMarketSessions);
	}

	const percentChange = ((anchorBar.close - startBar.close) / startBar.close) * 100;

	if (!Number.isFinite(percentChange)) {
		return createUnavailableReturn(windowMarketSessions);
	}

	return { windowMarketSessions, fromSessionDate: startBar.sessionDate, percentChange };
}

function createUnavailableReturn(windowMarketSessions: number): PeriodReturn {
	return { windowMarketSessions, fromSessionDate: null, percentChange: null };
}
