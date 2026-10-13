import type { DailyBar } from '#modules/bar-history/index.ts';

export type Regime = 'bullish' | 'bearish' | 'mixed' | 'undefined';

export type RegimeSession = Readonly<{
	sessionDate: DailyBar['sessionDate'];
	regime: Regime;
}>;

/**
 * The band edges a close must be strictly beyond for Regime to propose a direction, as of one
 * session. Each side also needs EMA50 on its side of EMA200, which `isFastEmaAligned` reports.
 * These are conditions of Regime's rule, not price targets.
 */
export type RegimeTippingCloses = Readonly<{
	bullish: Readonly<{ closeAbove: number; isFastEmaAligned: boolean }>;
	bearish: Readonly<{ closeBelow: number; isFastEmaAligned: boolean }>;
}>;

export type RegimeTippingClosesSession = Readonly<{
	sessionDate: DailyBar['sessionDate'];
	tippingCloses: RegimeTippingCloses | null;
}>;
