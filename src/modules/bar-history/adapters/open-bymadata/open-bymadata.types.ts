import type { BarHistorySource, DailyBar } from '../../bar-history.types.ts';

export type OpenBymadataTradingLineDescriptor = Readonly<{
	tradingLineId: string;
	symbol: string;
}>;

export type OpenBymadataHistoryRequest = Readonly<{
	tradingLine: OpenBymadataTradingLineDescriptor;
	fromEpochSeconds: number;
	toEpochSeconds: number;
	requestedThroughSession: string;
}>;

export type OpenBymadataHistorySeries = Readonly<{
	timestamps: readonly number[];
	openPrices: readonly number[];
	highPrices: readonly number[];
	lowPrices: readonly number[];
	closePrices: readonly number[];
	volumes: readonly number[];
}>;

export type OpenBymadataFailure = Readonly<{
	ok: false;
	reason: 'invalid-response' | 'provider-error' | 'request-failed';
	message: string;
}>;

export type OpenBymadataHistoryResult =
	| Readonly<{
			ok: true;
			source: BarHistorySource;
			bars: readonly DailyBar[];
	  }>
	| OpenBymadataFailure;

export type OpenBymadataFetch = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export type OpenBymadataAdapter = Readonly<{
	fetchHistory(request: OpenBymadataHistoryRequest): Promise<OpenBymadataHistoryResult>;
}>;
