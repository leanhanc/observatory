import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';

import type { Regime } from './regime.types.ts';

type ReadableRegime = Exclude<Regime, 'undefined'>;

/** Which side of the slow average the fast average is on; `0` is equality within rounding noise. */
type AverageAlignment = -1 | 0 | 1;

/**
 * The band around EMA200 that Regime compares the close with, and which side of EMA200 EMA50 is
 * on. Every reader of Regime's rule takes its edges from here.
 */
export type RegimeBand = Readonly<{
	upperEdge: number;
	lowerEdge: number;
	averageAlignment: AverageAlignment;
}>;

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
	const band = measureRegimeBand(ema50, ema200, atr14);

	if (close === null || !Number.isFinite(close) || band === null) {
		return null;
	}

	const upperPosition = compareBeyondRoundingNoise(close, band.upperEdge);
	const lowerPosition = compareBeyondRoundingNoise(close, band.lowerEdge);

	if (upperPosition > 0 && band.averageAlignment > 0) {
		return 'bullish';
	}

	if (lowerPosition < 0 && band.averageAlignment < 0) {
		return 'bearish';
	}

	return 'mixed';
}

/**
 * Measures Regime's band, `EMA200 ± 0.5 × ATR14`, and EMA50's side of EMA200 for one session.
 * Returns null when any measurement is unavailable or non-finite.
 */
export function measureRegimeBand(
	ema50: number | null,
	ema200: number | null,
	atr14: number | null,
): RegimeBand | null {
	if (ema50 === null || ema200 === null || atr14 === null) {
		return null;
	}

	if (!Number.isFinite(ema50) || !Number.isFinite(ema200) || !Number.isFinite(atr14)) {
		return null;
	}

	const margin = ANALYSIS_CONFIGURATION.regime.atrBandMultiplier * atr14;

	return {
		upperEdge: ema200 + margin,
		lowerEdge: ema200 - margin,
		averageAlignment: compareBeyondRoundingNoise(ema50, ema200),
	};
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
