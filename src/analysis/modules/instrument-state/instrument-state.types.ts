import type { DailyBar } from '#modules/bar-history/index.ts';
import type {
	ConfirmedHigh,
	ConfirmedLow,
	PendingRegimeTransition,
	Regime,
	StructureClassification,
} from '#modules/technical-analysis/index.ts';

export type ReadableRegime = Exclude<Regime, 'undefined'>;

/**
 * The latest confirmed swing of one kind and how far the session's close is from it: Evidence
 * about Structure, with the fields of a Structure Break's defining swing.
 */
export type ConfirmedSwingLevel<Swing extends ConfirmedHigh | ConfirmedLow> = Swing &
	Readonly<{
		/**
		 * `(close − price) / price × 100`, unrounded: positive when the close is above the swing,
		 * negative below.
		 */
		priceRelativeToSwingInPercent: number | null;
	}>;

/**
 * What is true about one Trading Line at the close of one session.
 * `null` marks a part that could not be evaluated for lack of history or a readable input.
 */
export type InstrumentState = Readonly<{
	sessionDate: DailyBar['sessionDate'];
	regime: ReadableRegime | null;
	/**
	 * A different Regime proposal still gathering confirmations, or `null` when there is none or
	 * Regime is unavailable. It may be cleared or replaced; it is not an Event.
	 */
	pendingRegimeTransition: PendingRegimeTransition | null;
	/**
	 * Market Structure's classification, or `null` before two confirmed swings of each kind exist.
	 * Once available, `undefined` is a reading: the last trend or range expired.
	 */
	structure: StructureClassification | null;
	/** `null` until a swing high has been confirmed; never an unconfirmed candidate. */
	lastConfirmedSwingHigh: ConfirmedSwingLevel<ConfirmedHigh> | null;
	/** `null` until a swing low has been confirmed; never an unconfirmed candidate. */
	lastConfirmedSwingLow: ConfirmedSwingLevel<ConfirmedLow> | null;
	rsi: number | null;
	/** `(close − EMA) / ATR`: how far the close sits from its average, in typical daily ranges. */
	priceRelativeToEmaInAtr: number | null;
	/**
	 * `(close − long-term EMA) / long-term EMA × 100`, unrounded: how far the close sits from its
	 * long-term average, in percent of it. `null` until that average is readable.
	 */
	priceRelativeToLongTermEmaInPercent: number | null;
}>;
