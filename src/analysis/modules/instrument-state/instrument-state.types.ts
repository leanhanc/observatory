import type { DailyBar } from '#modules/bar-history/index.ts';
import type { Regime, StructureClassification } from '#modules/technical-analysis/index.ts';

export type ReadableRegime = Exclude<Regime, 'undefined'>;

/**
 * What is true about one Trading Line at the close of one session.
 * `null` marks a part that could not be evaluated for lack of history or a readable input.
 */
export type InstrumentState = Readonly<{
	sessionDate: DailyBar['sessionDate'];
	regime: ReadableRegime | null;
	/**
	 * Market Structure's classification, or `null` before two confirmed swings of each kind exist.
	 * Once available, `undefined` is a reading: the last trend expired.
	 */
	structure: StructureClassification | null;
	rsi: number | null;
	/** `(close − EMA) / ATR`: how far the close sits from its average, in typical daily ranges. */
	priceRelativeToEmaInAtr: number | null;
}>;
