/**
 * The close's percent change over one window of Market Sessions, as of the line's last bar.
 * `fromSessionDate` and `percentChange` are both `null` when the history does not reach back far
 * enough; a readable change of exactly `0` is `0`.
 */
export type PeriodReturn = Readonly<{
	windowMarketSessions: number;
	/** The session of the start close: the line's last bar on or before the window's start. */
	fromSessionDate: string | null;
	/** `(close − start close) / start close × 100`, unrounded. */
	percentChange: number | null;
}>;
