import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';
import {
	calculateAtr,
	calculateEma,
	calculateMarketStructure,
	calculateRegime,
	calculateRsi,
} from '#modules/technical-analysis/index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type {
	MarketStructureSession,
	Regime,
	StructureClassification,
} from '#modules/technical-analysis/index.ts';
import type { InstrumentState, ReadableRegime } from './instrument-state.types.ts';

const { rsiPeriod, emaPeriod, atrPeriod } = ANALYSIS_CONFIGURATION.instrumentState;

/**
 * Describes one Trading Line at the close of each session: Regime, Structure,
 * RSI and the close's distance from its EMA in ATR units.
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
	const structures = calculateMarketStructure(bars);
	const rsiValues = calculateRsi(closes, rsiPeriod);
	const emaValues = calculateEma(closes, emaPeriod);
	const atrValues = calculateAtr(bars, atrPeriod);

	return bars.map((bar, index) => ({
		sessionDate: bar.sessionDate,
		regime: toReadableRegime(regimes[index]!.regime),
		structure: toAvailableStructure(structures[index]!),
		rsi: toAvailableValue(rsiValues[index]!),
		priceRelativeToEmaInAtr: measurePriceRelativeToEma(
			bar.close,
			emaValues[index]!,
			atrValues[index]!,
		),
	}));
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

function toAvailableValue(value: number | null): number | null {
	if (value === null || !Number.isFinite(value)) {
		return null;
	}

	return value;
}
