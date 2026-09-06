import type {
	BarHistorySource,
	DailyBar,
	SessionDateRange,
	ValidationIssue,
} from '../bar-history.types.ts';
import type { BarHistoryStorageFailureReason } from '../storage/index.ts';

export type ReadBarHistoriesRequest = Readonly<{
	tradingLineIds: readonly string[];
	range?: SessionDateRange | null;
}>;

export type BarHistoryReadSuccess = Readonly<{
	ok: true;
	tradingLineId: string;
	source: BarHistorySource;
	priceAdjustment: 'none';
	checkedThroughSession: string;
	bars: readonly DailyBar[];
}>;

export type BarHistoryReadFailure = Readonly<{
	ok: false;
	tradingLineId: string;
	reason: BarHistoryStorageFailureReason;
	message: string;
	issues: readonly ValidationIssue[];
}>;

export type BarHistoryRead = BarHistoryReadSuccess | BarHistoryReadFailure;

export type ReadBarHistoriesSuccess = Readonly<{
	ok: true;
	results: readonly BarHistoryRead[];
}>;

export type ReadBarHistoriesFailure = Readonly<{
	ok: false;
	reason: 'invalid-request';
	message: string;
	issues: readonly ValidationIssue[];
}>;

export type ReadBarHistoriesResult = ReadBarHistoriesSuccess | ReadBarHistoriesFailure;

export type BarHistoryReader = Readonly<{
	read(request: ReadBarHistoriesRequest): Promise<ReadBarHistoriesResult>;
}>;
