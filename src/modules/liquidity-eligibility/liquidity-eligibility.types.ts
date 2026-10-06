import type { MepRateSession } from '#modules/dollarized-series/index.ts';

export type LiquidityCriteria = Readonly<{
	windowSessions: number;
	minimumParticipation: number;
	minimumMedianTradedValueUsd: number;
}>;

/** The market sessions, each with its MEP Rate, over which liquidity is measured. */
export type LiquidityWindow = Readonly<{
	marketSessions: readonly MepRateSession[];
}>;

export type LiquidityWindowSelection =
	| Readonly<{ ok: true; window: LiquidityWindow }>
	| Readonly<{
			ok: false;
			reason: 'insufficient-market-sessions';
			marketSessionCount: number;
	  }>;

export type LiquidityMeasures = Readonly<{
	/** Traded sessions ÷ window sessions, counted from the window start. */
	participation: number;
	/** `null` when the line did not trade in the window: there is no value to take a median of. */
	medianDailyTradedValueUsd: number | null;
}>;

export type LiquidityEligibility = Readonly<{
	isEligible: boolean;
	measures: LiquidityMeasures;
}>;
