export type DailyBar = Readonly<{
	sessionDate: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}>;

export type BarHistorySource = Readonly<{
	provider: 'open-bymadata';
	symbol: string;
}>;

export type BarHistory = Readonly<{
	schemaVersion: 1;
	tradingLineId: string;
	source: BarHistorySource;
	priceAdjustment: 'none';
	backfilledAt: string;
	lastReconciledAt: string | null;
	checkedThroughSession: string;
	bars: readonly DailyBar[];
}>;

export type SessionDateRange = Readonly<{
	start: string;
	end: string;
}>;

export type BarHistoryCorrection = Readonly<{
	sessionDate: string;
	previousBar: DailyBar;
	correctedBar: DailyBar;
}>;

export type ValidationIssue = Readonly<{
	code:
		| 'bar-after-check-through'
		| 'duplicate-session-date'
		| 'invalid-date'
		| 'invalid-number'
		| 'invalid-price-range'
		| 'invalid-schema-version'
		| 'invalid-type'
		| 'invalid-value'
		| 'negative-number'
		| 'unsorted-session-date';
	path: string;
	message: string;
}>;

export type ReconcileBarHistoryInput = Readonly<{
	existingHistory: BarHistory | null;
	tradingLineId: string;
	source: BarHistorySource;
	incomingBars: readonly DailyBar[];
	throughSession: string;
	checkedAt: string;
	reconciliationWindow: SessionDateRange | null;
}>;

export type BarHistoryStatus = 'created' | 'failed' | 'unchanged' | 'updated';

export type BarHistoryFailureReason =
	| 'check-progress-regression'
	| 'history-shrinkage'
	| 'invalid-existing-history'
	| 'invalid-incoming-bars'
	| 'invalid-request'
	| 'invalid-resulting-history'
	| 'source-mismatch'
	| 'trading-line-mismatch';

export type BarHistorySuccess = Readonly<{
	ok: true;
	status: Exclude<BarHistoryStatus, 'failed'>;
	history: BarHistory;
	corrections: readonly BarHistoryCorrection[];
}>;

export type BarHistoryFailure = Readonly<{
	ok: false;
	status: 'failed';
	reason: BarHistoryFailureReason;
	message: string;
	issues: readonly ValidationIssue[];
	previousHistory: BarHistory | null;
}>;

export type BarHistoryResult = BarHistorySuccess | BarHistoryFailure;
