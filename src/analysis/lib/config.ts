/**
 * The project-wide Analysis Configuration: measurement conventions and thresholds that make
 * analysis comparable across Instruments and runs. Changing any value changes what results
 * mean, so it requires a new `version`.
 *
 * Each concept owns its periods, even where values coincide: Regime's band width, a Volatile
 * Session's baseline and the Instrument State's distance unit and long-term average are
 * separate conventions.
 */
export const ANALYSIS_CONFIGURATION = {
	version: 8,
	regime: {
		fastEmaPeriod: 50,
		slowEmaPeriod: 200,
		atrPeriod: 14,
		atrBandMultiplier: 0.5,
		transitionConfirmations: 3,
	},
	volatileSession: {
		atrPeriod: 14,
		atrMultipleThreshold: 1.8,
	},
	marketStructure: {
		confirmationBars: 3,
	},
	instrumentState: {
		rsiPeriod: 14,
		emaPeriod: 20,
		atrPeriod: 14,
		// The most widely watched long-term trend reference. Equal to Regime's slow EMA by
		// convention, not by reuse.
		longTermEmaPeriod: 200,
	},
	// A Situation's close is beyond the noise band when its distance past the level exceeds this
	// multiple of the State's ATR(14). Equal to Regime's band by convention, not by reuse: the same
	// half a typical daily move that Regime treats as noise around EMA200. It only marks a Situation
	// for wording and is never one of its conditions (ADR 0011).
	situations: {
		noiseBandAtrMultiplier: 0.5,
	},
	// One month, three months and one year, counted in calendar months as brokers count them. A
	// session count would drift: BYMA trades fewer sessions a year than the 252 of the US convention.
	periodReturns: {
		windowMonths: [1, 3, 12],
	},
	// A Trading Line is analyzed only when, over the last `windowSessions` market sessions, it
	// traded on at least `minimumParticipation` of them and its median traded value in MEP dollars
	// reached `minimumMedianTradedValueUsd`. See docs/research/cedear-liquidity-distribution.md.
	liquidityEligibility: {
		windowSessions: 125,
		minimumParticipation: 0.9,
		minimumMedianTradedValueUsd: 50_000,
	},
	// A session whose dollarized close moved by this factor or more from the previous bar, up or
	// down, is a Large One-Session Move: large enough to be a split or a CEDEAR ratio change. See
	// docs/research/large-one-session-moves.md.
	largeMove: {
		minimumCloseRatio: 1.8,
	},
	// A listed Corporate Action that corrects prices and volume is applied only while the fetched
	// close ratio across its ex-date is within this factor of the action's price factor, so a history
	// the provider has since adjusted is not adjusted twice. One that corrects only volume is applied
	// only while the ratio is within this factor of 1, so the provider has visibly adjusted the price.
	// A listed factor must be at least this factor squared away from 1, so the two bands stay apart.
	// A volume-only correction is skipped when the last `volumeRescaleCheckBars` traded bars before
	// the ex-date all have volumes that are multiples of an integer share factor: the provider may
	// already have rescaled them. See docs/research/open-bymadata-relevant-facts.md.
	corporateActions: {
		maximumStepDeviation: 1.25,
		volumeRescaleCheckBars: 20,
	},
} as const;
