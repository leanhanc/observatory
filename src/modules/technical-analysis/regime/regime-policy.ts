import { REGIME_CONFIGURATION_V1 } from './regime-configuration.ts';

import type { Regime } from './regime.types.ts';

type ReadableRegime = Exclude<Regime, 'undefined'>;

const ROUNDING_ULPS = 8;

export type RegimeState = Readonly<{
	settled: ReadableRegime | null;
	pending: ReadableRegime | null;
	pendingCount: number;
}>;

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

	const margin = REGIME_CONFIGURATION_V1.atrBandMultiplier * atr14;
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

export function advanceRegimeState(
	state: RegimeState,
	proposal: ReadableRegime | null,
): RegimeState {
	if (proposal === null) {
		return state;
	}

	if (state.settled === null || proposal === state.settled) {
		return { settled: proposal, pending: null, pendingCount: 0 };
	}

	const pendingCount = proposal === state.pending ? state.pendingCount + 1 : 1;

	if (pendingCount >= REGIME_CONFIGURATION_V1.transitionConfirmations) {
		return { settled: proposal, pending: null, pendingCount: 0 };
	}

	return { settled: state.settled, pending: proposal, pendingCount };
}
