import type { DailyBar } from '#modules/bar-history/index.ts';

export type Regime = 'bullish' | 'bearish' | 'mixed' | 'undefined';

export type RegimeSession = Readonly<{
	sessionDate: DailyBar['sessionDate'];
	regime: Regime;
}>;
