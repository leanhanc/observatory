import { assertIndicatorPeriod } from '../utils/indicator-period/index.ts';

/**
 * Calculates an exponential moving average aligned with the input values.
 *
 * The first observation seeds the calculation. Positions before the requested
 * period is complete are `null`.
 *
 * @param period Nominal EMA period. It sets the warm-up length and smoothing
 * factor `2 / (period + 1)`; it does not slice the input.
 */
export function calculateEma(
	values: readonly number[],
	period: number,
): readonly (number | null)[] {
	assertIndicatorPeriod(period);

	const output = Array<number | null>(values.length).fill(null);
	let current = values[0];

	if (current === undefined) {
		return output;
	}

	const smoothingFactor = 2 / (period + 1);

	for (const [index, value] of values.entries()) {
		if (index > 0) {
			current = value * smoothingFactor + current * (1 - smoothingFactor);
		}
		if (index >= period - 1) {
			output[index] = current;
		}
	}

	return output;
}
