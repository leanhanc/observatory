import type { BarHistorySource, DailyBar } from '../../bar-history.types.ts';

export type OpenBymadataPanel = 'cedears' | 'general-equity' | 'leading-equity';

export type OpenBymadataTradingLineDescriptor = Readonly<{
	tradingLineId: string;
	symbol: string;
	panel: OpenBymadataPanel;
}>;

export type OpenBymadataHistoryRequest = Readonly<{
	tradingLine: OpenBymadataTradingLineDescriptor;
	fromEpochSeconds: number;
	toEpochSeconds: number;
	throughSession: string;
}>;

export type OpenBymadataPanelRequest = Readonly<{
	tradingLines: readonly OpenBymadataTradingLineDescriptor[];
	throughSession: string;
}>;

export type OpenBymadataHistorySeries = Readonly<{
	timestamps: readonly number[];
	openPrices: readonly number[];
	highPrices: readonly number[];
	lowPrices: readonly number[];
	closePrices: readonly number[];
	volumes: readonly number[];
}>;

export type OpenBymadataPanelRow = Readonly<{
	symbol: string;
	openingPrice: number;
	tradingHighPrice: number;
	tradingLowPrice: number;
	closingPrice: number;
	volume: number;
}>;

export type OpenBymadataPanelLineResult =
	| Readonly<{
			status: 'found';
			tradingLineId: string;
			source: BarHistorySource;
			bar: DailyBar;
	  }>
	| Readonly<{
			status: 'missing';
			tradingLineId: string;
			source: BarHistorySource;
	  }>;

export type OpenBymadataFailure = Readonly<{
	ok: false;
	reason:
		| 'incomplete-response'
		| 'invalid-request'
		| 'invalid-response'
		| 'provider-error'
		| 'request-failed';
	message: string;
}>;

export type OpenBymadataHistoryResult =
	| Readonly<{
			ok: true;
			source: BarHistorySource;
			bars: readonly DailyBar[];
	  }>
	| OpenBymadataFailure;

export type OpenBymadataPanelResult =
	| Readonly<{
			ok: true;
			lines: readonly OpenBymadataPanelLineResult[];
	  }>
	| OpenBymadataFailure;

export type OpenBymadataFetch = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export type OpenBymadataAdapter = Readonly<{
	fetchHistory(request: OpenBymadataHistoryRequest): Promise<OpenBymadataHistoryResult>;
	fetchPanel(request: OpenBymadataPanelRequest): Promise<OpenBymadataPanelResult>;
}>;
