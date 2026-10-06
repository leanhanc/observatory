/**
 * The project-wide Analysis Configuration: measurement conventions and thresholds that make
 * analysis comparable across Instruments and runs. Changing any value changes what results
 * mean, so it requires a new `version`.
 *
 * Each concept owns its periods, even where values coincide: Regime's band width, Volatility
 * Expansion's baseline and the Instrument State's distance unit are separate conventions.
 */
export const ANALYSIS_CONFIGURATION = {
	version: 2,
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
} as const;
