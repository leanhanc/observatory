import type { DailyBar, ValidationIssue } from '#modules/bar-history/index.ts';

/** The peso price of one dollar implied by a bond pair on one session. */
export type MepRateSession = Readonly<{
	sessionDate: string;
	mepRate: number;
}>;

/**
 * The peso price of one dollar settled abroad (CCL, cable) implied by a bond pair on one session.
 * For display only.
 */
export type CclRateSession = Readonly<{
	sessionDate: string;
	cclRate: number;
}>;

export type DollarizedSeries = Readonly<{
	bars: readonly DailyBar[];
	sessionsWithoutMepRate: readonly string[];
}>;

/** The Trading Lines of the bond whose peso and dollar closes imply the MEP Rate. */
export type MepRateSource = Readonly<{
	pesoBondTradingLineId: string;
	dollarBondTradingLineId: string;
}>;

/** The Trading Lines of the bond whose peso and cable closes imply the CCL Rate. */
export type CclRateSource = Readonly<{
	pesoBondTradingLineId: string;
	cableBondTradingLineId: string;
}>;

export type RateSourceBarsValidation = Readonly<{
	issues: readonly ValidationIssue[];
	zeroOpenSessions: readonly string[];
}>;
