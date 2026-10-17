import type { DailyBar } from '#modules/bar-history/index.ts';
import type {
	ConfirmedHigh,
	ConfirmedLow,
	PendingRegimeTransition,
	Regime,
	RegimeTippingCloses,
	StructureClassification,
} from '#modules/technical-analysis/index.ts';

export type ReadableRegime = Exclude<Regime, 'undefined'>;

/** How far the session's close is from a confirmed swing, unrounded. */
type SwingDistance = Readonly<{
	/**
	 * `(close − price) / price × 100`, unrounded: positive when the close is above the swing,
	 * negative below.
	 */
	priceRelativeToSwingInPercent: number | null;
}>;

/**
 * The latest confirmed swing low and where the close is relative to it: Evidence about Structure,
 * with the fields of a Structure Break's defining swing. It is Support while the close is
 * `at-or-above` it; equality counts as Support.
 */
export type ConfirmedLowLevel = ConfirmedLow &
	SwingDistance &
	Readonly<{ closePosition: 'at-or-above' | 'below' }>;

/**
 * The latest confirmed swing high and where the close is relative to it. It is Resistance while the
 * close is `at-or-below` it; equality counts as Resistance.
 */
export type ConfirmedHighLevel = ConfirmedHigh &
	SwingDistance &
	Readonly<{ closePosition: 'at-or-below' | 'above' }>;

export type SituationType =
	| 'below-last-confirmed-low-in-bearish-regime'
	| 'above-last-confirmed-high-in-bullish-regime';

/**
 * A Situation active at the session: a named conjunction of State parts, with no threshold of its
 * own. `level` is the confirmed swing the close is beyond. `activeSinceSession` is the first
 * session of the current unbroken run of sessions on which it holds; an interruption restarts it.
 * `isBeyondNoiseBand` says whether the close is past `level` by more than the noise band, half the
 * session's ATR(14), and is `null` while ATR(14) is unavailable. It selects wording only: it is not
 * a condition of the Situation and does not affect `activeSinceSession`.
 */
export type Situation =
	| Readonly<{
			type: 'below-last-confirmed-low-in-bearish-regime';
			activeSinceSession: DailyBar['sessionDate'];
			level: ConfirmedLow;
			isBeyondNoiseBand: boolean | null;
	  }>
	| Readonly<{
			type: 'above-last-confirmed-high-in-bullish-regime';
			activeSinceSession: DailyBar['sessionDate'];
			level: ConfirmedHigh;
			isBeyondNoiseBand: boolean | null;
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
	 * The closes Regime's price condition needs as of this session, or `null` while Regime is
	 * unavailable. Conditions of Observatory's rule, not targets; approximate for later sessions.
	 */
	regimeTippingCloses: RegimeTippingCloses | null;
	/**
	 * Market Structure's classification, or `null` before two confirmed swings of each kind exist.
	 * Once available, `undefined` is a reading: the last trend or range expired.
	 */
	structure: StructureClassification | null;
	/** `null` until a swing high has been confirmed; never an unconfirmed candidate. */
	lastConfirmedSwingHigh: ConfirmedHighLevel | null;
	/** `null` until a swing low has been confirmed; never an unconfirmed candidate. */
	lastConfirmedSwingLow: ConfirmedLowLevel | null;
	rsi: number | null;
	/** `(close − EMA) / ATR`: how far the close sits from its average, in typical daily ranges. */
	priceRelativeToEmaInAtr: number | null;
	/**
	 * `(close − long-term EMA) / long-term EMA × 100`, unrounded: how far the close sits from its
	 * long-term average, in percent of it. `null` until that average is readable.
	 */
	priceRelativeToLongTermEmaInPercent: number | null;
	/**
	 * The long-term EMA itself, in the bars' unit: the center of Regime's noise band, whose edges are
	 * the Regime tipping closes. `null` until it is readable.
	 */
	longTermEma: number | null;
	/** The active Situations, in a fixed order; empty when none is active. */
	situations: readonly Situation[];
}>;
