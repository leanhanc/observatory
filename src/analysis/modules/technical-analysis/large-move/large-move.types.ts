/**
 * A session whose close moved by at least the configured factor from the previous bar's close.
 * `closeRatio` is `close_i / close_{i−1}`, so a fall is below 1.
 */
export type LargeOneSessionMove = Readonly<{
	sessionDate: string;
	closeRatio: number;
}>;
