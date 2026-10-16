/**
 * One session's close in the currency of the series being measured. `close` is `null` when the
 * session belongs to the series' calendar but has no price in that currency, such as a session
 * without a CCL Rate when the series is in CCL dollars. Daily Bars qualify.
 */
export type SessionClose = Readonly<{
	sessionDate: string;
	close: number | null;
}>;

/**
 * The close's percent change over one window of calendar months, as of the line's last bar.
 * `fromSessionDate` and `percentChange` are both `null` when the history does not reach back far
 * enough; a readable change of exactly `0` is `0`.
 */
export type PeriodReturn = Readonly<{
	windowMonths: number;
	/** The session of the start close: the line's last bar on or before the window's start date. */
	fromSessionDate: string | null;
	/** `(close − start close) / start close × 100`, unrounded. */
	percentChange: number | null;
}>;
