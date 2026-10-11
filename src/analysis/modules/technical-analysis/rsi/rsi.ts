import { assertIndicatorPeriod } from '../utils/indicator-period/index.ts';
import { calculateWilderAverage } from '../utils/wilder-average/index.ts';

const DEFAULT_PERIOD = 14;

/**
 * Calculates Relative Strength Index using Wilder's smoothing.
 *
 * RSI needs one more close than its period because it measures changes between
 * closes. Positions before index `period` are `null`.
 *
 * @param period Number of close-to-close changes used by the initial gain and
 * loss averages and each subsequent Wilder-smoothed update.
 */
export function calculateRsi(
	closes: readonly number[],
	period = DEFAULT_PERIOD,
): readonly (number | null)[] {
	assertIndicatorPeriod(period);

	const output = Array<number | null>(closes.length).fill(null);
	let averageGain = 0;
	let averageLoss = 0;

	for (let index = 1; index < closes.length; index += 1) {
		const currentClose = closes[index]!;
		const previousClose = closes[index - 1]!;
		const change = currentClose - previousClose;
		const gain = Math.max(change, 0);
		const loss = Math.max(-change, 0);

		if (index <= period) {
			averageGain += gain;
			averageLoss += loss;
			if (index === period) {
				averageGain /= period;
				averageLoss /= period;
			}
		} else {
			averageGain = calculateWilderAverage(averageGain, gain, period);
			averageLoss = calculateWilderAverage(averageLoss, loss, period);
		}

		if (index >= period) {
			output[index] = calculateRsiValue(averageGain, averageLoss);
		}
	}

	return output;
}

function calculateRsiValue(averageGain: number, averageLoss: number): number | null {
	if (averageGain === 0 && averageLoss === 0) {
		return null;
	}

	if (averageLoss === 0) {
		return 100;
	}

	return 100 - 100 / (1 + averageGain / averageLoss);
}
