import type { DailyBar } from '#modules/bar-history/index.ts';

/** The peso price of one dollar implied by a bond pair on one session. */
export type MepRateSession = Readonly<{
	sessionDate: string;
	mepRate: number;
}>;

export type DollarizedSeries = Readonly<{
	bars: readonly DailyBar[];
	sessionsWithoutMepRate: readonly string[];
}>;
