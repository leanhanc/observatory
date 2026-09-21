import { calculateTrueRange } from '../true-range/index.ts';
import { assertIndicatorPeriod } from '../utils/indicator-period/index.ts';
import { calculateWilderAverage } from '../utils/wilder-average/index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';

const DEFAULT_PERIOD = 14;

/**
 * Calculates Average True Range using Wilder's smoothing.
 *
 * The first value is the simple mean of the first period True Ranges. Earlier
 * positions are `null`.
 *
 * @param period Number of True Ranges used by the initial average and each
 * subsequent Wilder-smoothed update; it does not slice the input.
 */
export function calculateAtr(
	bars: readonly DailyBar[],
	period = DEFAULT_PERIOD,
): readonly (number | null)[] {
	assertIndicatorPeriod(period);

	const output = Array<number | null>(bars.length).fill(null);

	if (bars.length < period) {
		return output;
	}

	const ranges = calculateTrueRange(bars);
	let currentAtr = ranges.slice(0, period).reduce((total, range) => total + range, 0) / period;
	output[period - 1] = currentAtr;

	for (let index = period; index < ranges.length; index += 1) {
		const currentTrueRange = ranges[index]!;
		currentAtr = calculateWilderAverage(currentAtr, currentTrueRange, period);
		output[index] = currentAtr;
	}

	return output;
}
