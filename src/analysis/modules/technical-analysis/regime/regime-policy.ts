import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';

import type { Regime } from './regime.types.ts';

type ReadableRegime = Exclude<Regime, 'undefined'>;

const ROUNDING_ULPS = 8;

/**
 * Proposes a readable Regime from the completed session's price, EMA, and ATR evidence.
 * Returns null when any required measurement is unavailable or non-finite.
 */
export function proposeRegime(
	close: number | null,
	ema50: number | null,
	ema200: number | null,
	atr14: number | null,
): ReadableRegime | null {
	if (close === null || ema50 === null || ema200 === null || atr14 === null) {
		return null;
	}
	if (
		!Number.isFinite(close) ||
		!Number.isFinite(ema50) ||
		!Number.isFinite(ema200) ||
		!Number.isFinite(atr14)
	) {
		return null;
	}

	const margin = ANALYSIS_CONFIGURATION.regime.atrBandMultiplier * atr14;
	const upperBand = ema200 + margin;
	const lowerBand = ema200 - margin;
	const upperPosition = compareBeyondRoundingNoise(close, upperBand);
	const lowerPosition = compareBeyondRoundingNoise(close, lowerBand);
	const averageAlignment = compareBeyondRoundingNoise(ema50, ema200);

	if (upperPosition > 0 && averageAlignment > 0) {
		return 'bullish';
	}

	if (lowerPosition < 0 && averageAlignment < 0) {
		return 'bearish';
	}

	return 'mixed';
}

/**
 * Compares two measurements while treating scale-relative floating-point drift as equality.
 * This guards indicator arithmetic and does not introduce a market-analysis threshold.
 */
function compareBeyondRoundingNoise(value: number, threshold: number): -1 | 0 | 1 {
	// EMA arithmetic can drift by a few ulps even on a mathematically flat series.
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
