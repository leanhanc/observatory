import type { ValidationError } from '#lib/utils/validation.ts';
import type { Logger } from '#modules/logger/index.ts';
import type {
	BarHistoryAcquisitionFailureReason,
	BarHistoryAcquisitionMode,
	BarHistoryPause,
} from '../acquisition/index.ts';
import type { OpenBymadataTradingLineDescriptor } from '../adapters/index.ts';
import type {
	BarHistory,
	BarHistoryCorrection,
	BarHistoryFailureReason,
	BarHistoryStatus,
	ValidationIssue,
} from '../bar-history.types.ts';
import type { BarHistoryStorageFailureReason } from '../storage/index.ts';

export type BarHistoryUpdateMode = BarHistoryAcquisitionMode;

export type UpdateBarHistoryLine = Readonly<{
	tradingLine: OpenBymadataTradingLineDescriptor;
	mode: BarHistoryUpdateMode;
}>;

export type UpdateBarHistoriesRequest = Readonly<{
	lines: readonly UpdateBarHistoryLine[];
	requestedThroughSession: string;
}>;

export type BarHistoryUpdateFailureReason =
	| BarHistoryAcquisitionFailureReason
	| BarHistoryFailureReason
	| BarHistoryStorageFailureReason
	| 'mode-conflict';

export type BarHistoryUpdateSuccess = Readonly<{
	status: Exclude<BarHistoryStatus, 'failed'>;
	tradingLineId: string;
	corrections: readonly BarHistoryCorrection[];
}>;

export type BarHistoryUpdateFailure = Readonly<{
	status: 'failed';
	tradingLineId: string;
	reason: BarHistoryUpdateFailureReason;
	message: string;
	issues: readonly ValidationIssue[];
}>;

export type BarHistoryUpdate = BarHistoryUpdateSuccess | BarHistoryUpdateFailure;

export type UpdateBarHistoriesSuccess = Readonly<{
	ok: true;
	results: readonly BarHistoryUpdate[];
}>;

export type UpdateBarHistoriesFailure = Readonly<{
	ok: false;
	reason: 'invalid-request';
	message: string;
	issues: readonly ValidationIssue[];
}>;

export type UpdateBarHistoriesResult = UpdateBarHistoriesSuccess | UpdateBarHistoriesFailure;

export type BarHistoryUpdaterOptions = Readonly<{
	fetchFromProvider?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
	pause?: BarHistoryPause;
	getCurrentInstant?: () => string;
}>;

export type BarHistoryUpdateLogger = Pick<Logger, 'info'>;

export type BarHistoryUpdater = Readonly<{
	update(request: UpdateBarHistoriesRequest): Promise<UpdateBarHistoriesResult>;
}>;

export type PreparedUpdateLine = Readonly<{
	line: UpdateBarHistoryLine;
	existingHistory: BarHistory | null;
}>;

export type PreparedLineResult =
	| Readonly<{ ok: true; value: PreparedUpdateLine }>
	| Readonly<{ ok: false; failure: BarHistoryUpdateFailure }>;

export type UpdateRequestValidationResult =
	| Readonly<{ isValid: true; request: UpdateBarHistoriesRequest }>
	| ValidationError<ValidationIssue>;
