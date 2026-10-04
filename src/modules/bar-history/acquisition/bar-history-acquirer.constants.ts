/** Pause between historical requests; Open BYMADATA's anonymous rate limit is undocumented. */
export const HISTORICAL_REQUEST_PAUSE_MS = 2_000;

export const BAR_HISTORY_ACQUISITION_MODES = [
	'initial-backfill',
	'refresh',
	'reconciliation',
] as const;
