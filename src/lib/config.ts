/**
 * The project-wide Analysis Configuration: measurement conventions and thresholds that make
 * analysis comparable across Instruments and runs. Changing any value changes what results
 * mean, so it requires a new `version`.
 *
 * Each concept owns its periods, even where values coincide: Regime's band width, Volatility
 * Expansion's baseline and the Instrument State's distance unit are separate conventions.
 */
export const ANALYSIS_CONFIGURATION = {
	version: 1,
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
} as const;
