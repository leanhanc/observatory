import type { BarHistory, ValidationIssue } from '../bar-history.types.ts';

export type BarHistoryStorageConfiguration = Readonly<{
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
	endpoint: string;
	region: string;
	virtualHostedStyle: boolean;
}>;

export type BarHistoryStorageFailureReason =
	| 'invalid-history'
	| 'invalid-stored-history'
	| 'not-found'
	| 'unreadable'
	| 'write-failed';

export type BarHistoryStorageReadSuccess = Readonly<{
	ok: true;
	history: BarHistory;
}>;

export type BarHistoryStorageWriteSuccess = Readonly<{
	ok: true;
	history: BarHistory;
}>;

export type BarHistoryStorageFailure = Readonly<{
	ok: false;
	reason: BarHistoryStorageFailureReason;
	message: string;
	issues: readonly ValidationIssue[];
}>;

export type BarHistoryStorageReadResult = BarHistoryStorageReadSuccess | BarHistoryStorageFailure;

export type BarHistoryStorageWriteResult = BarHistoryStorageWriteSuccess | BarHistoryStorageFailure;

export type BarHistoryStorage = Readonly<{
	read(tradingLineId: string): Promise<BarHistoryStorageReadResult>;
	write(history: BarHistory): Promise<BarHistoryStorageWriteResult>;
}>;
