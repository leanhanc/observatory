import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';
import {
	calculateAtr,
	calculateEma,
	calculateMarketStructure,
	calculatePendingRegimeTransitions,
	calculateRegime,
	calculateRegimeTippingCloses,
	calculateRsi,
	trackLatestConfirmedSwings,
} from '#modules/technical-analysis/index.ts';

import { trackSituations } from './situation-tracker.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type {
	ConfirmedHigh,
	ConfirmedLow,
	MarketStructureSession,
	Regime,
	StructureClassification,
} from '#modules/technical-analysis/index.ts';
import type {
	ConfirmedHighLevel,
	ConfirmedLowLevel,
	InstrumentState,
	ReadableRegime,
} from './instrument-state.types.ts';

const { rsiPeriod, emaPeriod, atrPeriod, longTermEmaPeriod } =
	ANALYSIS_CONFIGURATION.instrumentState;

/**
 * Describes one Trading Line at the close of each session: Regime, any pending change of it and
 * the closes its price condition needs, Structure and the last confirmed swing high and low with
 * the close's distance and position relative to them, RSI, the close's distance from its EMA in
 * ATR units, its distance from its long-term EMA in percent, and the active Situations.
 *
 * Returns one State per bar, in input order. Every bar gets a State; a part
 * that lacks history or a readable input is `null` rather than a fabricated value.
 * Each State depends only on bars through its own session.
 *
 * Expects validated completed Daily Bars of one Trading Line, ordered oldest to
 * newest; for peso lines, the bars of a Dollarized Series.
 */
export function calculateInstrumentStates(bars: readonly DailyBar[]): readonly InstrumentState[] {
	const closes = bars.map((bar) => bar.close);
	const regimes = calculateRegime(bars);
	const pendingRegimeTransitions = calculatePendingRegimeTransitions(bars);
	const regimeTippingCloses = calculateRegimeTippingCloses(bars);
	const structures = calculateMarketStructure(bars);
	const latestConfirmedSwings = trackLatestConfirmedSwings(structures);
	const rsiValues = calculateRsi(closes, rsiPeriod);
	const emaValues = calculateEma(closes, emaPeriod);
	const atrValues = calculateAtr(bars, atrPeriod);
	const longTermEmaValues = calculateEma(closes, longTermEmaPeriod);

	const stateParts = bars.map((bar, index) => ({
		sessionDate: bar.sessionDate,
		regime: toReadableRegime(regimes[index]!.regime),
		pendingRegimeTransition: pendingRegimeTransitions[index]!.pending,
		regimeTippingCloses: regimeTippingCloses[index]!.tippingCloses,
		structure: toAvailableStructure(structures[index]!),
		lastConfirmedSwingHigh: measureHighLevel(bar.close, latestConfirmedSwings[index]!.high),
		lastConfirmedSwingLow: measureLowLevel(bar.close, latestConfirmedSwings[index]!.low),
		rsi: toAvailableValue(rsiValues[index]!),
		priceRelativeToEmaInAtr: measurePriceRelativeToEma(
			bar.close,
			emaValues[index]!,
			atrValues[index]!,
		),
		priceRelativeToLongTermEmaInPercent: measurePriceRelativeToLongTermEma(
			bar.close,
			longTermEmaValues[index]!,
		),
	}));
	const situations = trackSituations(stateParts);

	return stateParts.map((parts, index) => ({ ...parts, situations: situations[index]! }));
}

function toReadableRegime(regime: Regime): ReadableRegime | null {
	if (regime === 'undefined') {
		return null;
	}

	return regime;
}

function toAvailableStructure(session: MarketStructureSession): StructureClassification | null {
	if (!session.hasSwingPairs) {
		return null;
	}

	return session.structure;
}

function measurePriceRelativeToEma(
	close: number,
	ema: number | null,
	atr: number | null,
): number | null {
	// A zero ATR has no typical range to measure distance in; the ratio is undefined, not zero.
	if (ema === null || atr === null || atr === 0) {
		return null;
	}

	return toAvailableValue((close - ema) / atr);
}

// A close exactly at a level counts as on its side, as it preserves a trend or a range. The
// comparison is exact, as Market Structure's is.
function measureLowLevel(close: number, swing: ConfirmedLow | null): ConfirmedLowLevel | null {
	if (swing === null) {
		return null;
	}

	return {
		...swing,
		priceRelativeToSwingInPercent: measurePriceRelativeInPercent(close, swing.price),
		closePosition: close < swing.price ? 'below' : 'at-or-above',
	};
}

function measureHighLevel(close: number, swing: ConfirmedHigh | null): ConfirmedHighLevel | null {
	if (swing === null) {
		return null;
	}

	return {
		...swing,
		priceRelativeToSwingInPercent: measurePriceRelativeInPercent(close, swing.price),
		closePosition: close > swing.price ? 'above' : 'at-or-below',
	};
}

function measurePriceRelativeToLongTermEma(close: number, ema: number | null): number | null {
	if (ema === null) {
		return null;
	}

	return measurePriceRelativeInPercent(close, ema);
}

function measurePriceRelativeInPercent(close: number, reference: number): number | null {
	// Validated prices are positive, so a zero reference is not expected; dividing by it is undefined.
	if (reference === 0) {
		return null;
	}

	return toAvailableValue(((close - reference) / reference) * 100);
}

function toAvailableValue(value: number | null): number | null {
	if (value === null || !Number.isFinite(value)) {
		return null;
	}

	return value;
}
