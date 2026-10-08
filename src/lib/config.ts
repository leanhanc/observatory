/**
 * The project-wide Analysis Configuration: measurement conventions and thresholds that make
 * analysis comparable across Instruments and runs. Changing any value changes what results
 * mean, so it requires a new `version`.
 *
 * Each concept owns its periods, even where values coincide: Regime's band width, Volatility
 * Expansion's baseline and the Instrument State's distance unit are separate conventions.
 */
export const ANALYSIS_CONFIGURATION = {
	version: 3,
	regime: {
		fastEmaPeriod: 50,
		slowEmaPeriod: 200,
		atrPeriod: 14,
		atrBandMultiplier: 0.5,
		transitionConfirmations: 3,
	},
	volatilityExpansion: {
		atrPeriod: 14,
		expansionThreshold: 1.8,
	},
	marketStructure: {
		confirmationBars: 3,
	},
	instrumentState: {
		rsiPeriod: 14,
		emaPeriod: 20,
		atrPeriod: 14,
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
	// A listed Corporate Action is applied only while the fetched close ratio across its ex-date is
	// within this factor of the action's price factor, so a history the provider has since adjusted
	// is not adjusted twice. A listed price factor must be at least this factor squared away from 1,
	// so re-adjusting an adjusted history always takes a real move of at least this factor.
	corporateActions: {
		maximumStepDeviation: 1.25,
	},
} as const;
