import type { OpenBymadataFailure, OpenBymadataTradingLineDescriptor } from '../adapters/index.ts';
import type {
	BarHistory,
	BarHistorySource,
	DailyBar,
	SessionDateRange,
	ValidationIssue,
} from '../bar-history.types.ts';

export type BarHistoryAcquisitionMode =
	| 'catch-up'
	| 'initial-backfill'
	| 'ordinary-refresh'
	| 'reconciliation';

export type BarHistoryAcquisitionLine = Readonly<{
	tradingLine: OpenBymadataTradingLineDescriptor;
	existingHistory: BarHistory | null;
	mode: BarHistoryAcquisitionMode;
}>;

export type BarHistoryAcquisitionRequest = Readonly<{
	lines: readonly BarHistoryAcquisitionLine[];
	throughSession: string;
}>;

export type BarHistoryAcquisitionFailureReason =
	| OpenBymadataFailure['reason']
	| 'missing-provider-line';

export type BarHistoryAcquisitionLineResult =
	| Readonly<{
			status: 'available';
			tradingLineId: string;
			source: BarHistorySource;
			bars: readonly DailyBar[];
			reconciliationWindow: SessionDateRange | null;
	  }>
	| Readonly<{
			status: 'failed';
			tradingLineId: string;
			reason: BarHistoryAcquisitionFailureReason;
			message: string;
	  }>
	| Readonly<{
			status: 'not-required';
			tradingLineId: string;
	  }>;

export type BarHistoryAcquisitionSuccess = Readonly<{
	ok: true;
	lines: readonly BarHistoryAcquisitionLineResult[];
}>;

export type BarHistoryAcquisitionFailure = Readonly<{
	ok: false;
	reason: 'invalid-request';
	message: string;
	issues: readonly ValidationIssue[];
}>;

export type BarHistoryAcquisitionResult =
	| BarHistoryAcquisitionSuccess
	| BarHistoryAcquisitionFailure;

export type BarHistoryPause = (milliseconds: number) => Promise<void>;

export type BarHistoryAcquirer = Readonly<{
	acquire(request: BarHistoryAcquisitionRequest): Promise<BarHistoryAcquisitionResult>;
}>;
