// A few ulps of the larger magnitude: EMA arithmetic can drift that much even on a flat series.
const ROUNDING_ULPS = 8;

/**
 * Compares two measurements while treating scale-relative floating-point drift as equality.
 * This guards indicator arithmetic and does not introduce a market-analysis threshold.
 */
export function compareBeyondRoundingNoise(value: number, threshold: number): -1 | 0 | 1 {
	const scale = Math.max(Math.abs(value), Math.abs(threshold));
	const roundingTolerance = ROUNDING_ULPS * Number.EPSILON * scale;

	if (value > threshold + roundingTolerance) {
		return 1;
	}

	if (value < threshold - roundingTolerance) {
		return -1;
	}

	return 0;
}
