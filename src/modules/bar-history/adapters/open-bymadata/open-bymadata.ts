import * as v from 'valibot';

import type { BarHistorySource, DailyBar } from '../../bar-history.types.ts';
import type {
	OpenBymadataAdapter,
	OpenBymadataFailure,
	OpenBymadataFetch,
	OpenBymadataHistoryRequest,
	OpenBymadataHistoryResult,
	OpenBymadataHistorySeries,
	OpenBymadataPanel,
	OpenBymadataPanelLineResult,
	OpenBymadataPanelRequest,
	OpenBymadataPanelResult,
	OpenBymadataPanelRow,
	OpenBymadataTradingLineDescriptor,
} from './open-bymadata.types.ts';

const BASE_URL = 'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free';
const SETTLEMENT = '24HS';

const finiteNumberSchema = v.pipe(v.number(), v.finite());
const finiteNumberArraySchema = v.array(finiteNumberSchema);

const historyResponseSchema = v.object({
	s: v.string(),
	t: finiteNumberArraySchema,
	o: finiteNumberArraySchema,
	h: finiteNumberArraySchema,
	l: finiteNumberArraySchema,
	c: finiteNumberArraySchema,
	v: finiteNumberArraySchema,
});

const panelRowSchema = v.object({
	symbol: v.pipe(v.string(), v.nonEmpty()),
	openingPrice: finiteNumberSchema,
	tradingHighPrice: finiteNumberSchema,
	tradingLowPrice: finiteNumberSchema,
	closingPrice: finiteNumberSchema,
	volume: finiteNumberSchema,
});

const directPanelResponseSchema = v.array(panelRowSchema);
const wrappedPanelResponseSchema = v.object({
	content: v.object({
		page_number: v.pipe(v.number(), v.integer(), v.minValue(1)),
		page_count: v.pipe(v.number(), v.integer(), v.minValue(0)),
		page_size: v.pipe(v.number(), v.integer(), v.minValue(0)),
		total_elements_count: v.pipe(v.number(), v.integer(), v.minValue(0)),
	}),
	data: v.array(panelRowSchema),
});

/**
 * Creates the Open BYMADATA adapter used internally by Bar History.
 *
 * The fetch dependency is replaceable so provider behavior can be tested from captured fixtures
 * without network access.
 */
export function createOpenBymadataAdapter(
	fetchFromProvider: OpenBymadataFetch = fetch,
): OpenBymadataAdapter {
	return {
		fetchHistory: (request) => fetchHistory(fetchFromProvider, request),
		fetchPanel: (request) => fetchPanel(fetchFromProvider, request),
	};
}

async function fetchHistory(
	fetchFromProvider: OpenBymadataFetch,
	request: OpenBymadataHistoryRequest,
): Promise<OpenBymadataHistoryResult> {
	const source = createSource(request.tradingLine);
	const url = createHistoryUrl(source.symbol, request);
	const response = await fetchJson(fetchFromProvider, url);

	if (!response.ok) {
		return response;
	}

	const parsedResponse = v.safeParse(historyResponseSchema, response.value);

	if (!parsedResponse.success) {
		return createFailure('invalid-response', 'Open BYMADATA returned malformed history.');
	}

	if (parsedResponse.output.s === 'no_data') {
		return { ok: true, source, bars: [] };
	}

	if (parsedResponse.output.s !== 'ok') {
		return createFailure('provider-error', 'Open BYMADATA rejected the history request.');
	}

	const series = createHistorySeries(parsedResponse.output);
	const hasAlignedSeries = checkIfHistorySeriesAreAligned(series);

	if (!hasAlignedSeries) {
		return createFailure(
			'invalid-response',
			'Open BYMADATA returned history arrays with different lengths.',
		);
	}

	const bars = normalizeHistorySeries(series, request.throughSession);

	if (!bars) {
		return createFailure(
			'invalid-response',
			'Open BYMADATA returned a timestamp outside the supported date range.',
		);
	}

	return { ok: true, source, bars };
}

async function fetchPanel(
	fetchFromProvider: OpenBymadataFetch,
	request: OpenBymadataPanelRequest,
): Promise<OpenBymadataPanelResult> {
	if (request.tradingLines.length === 0) {
		return { ok: true, lines: [] };
	}

	const requestValidationFailure = validatePanelRequest(request.tradingLines);

	if (requestValidationFailure) {
		return requestValidationFailure;
	}

	const panel = request.tradingLines[0]?.panel;

	if (!panel) {
		return createFailure('invalid-request', 'Open BYMADATA panel was not specified.');
	}

	const url = `${BASE_URL}/${panel}`;
	const response = await fetchJson(fetchFromProvider, url, createPanelRequest());

	if (!response.ok) {
		return response;
	}

	const parsedRows = parsePanelRows(panel, response.value);

	if (!parsedRows.ok) {
		return parsedRows;
	}

	if (!checkIfPanelRowsHaveUniqueSymbols(parsedRows.rows)) {
		return createFailure(
			'invalid-response',
			'Open BYMADATA returned duplicate symbols in one panel.',
		);
	}

	const lines = matchPanelRows(request.tradingLines, parsedRows.rows, request.throughSession);
	return { ok: true, lines };
}

function validatePanelRequest(
	tradingLines: readonly OpenBymadataTradingLineDescriptor[],
): OpenBymadataFailure | null {
	const panels = new Set(tradingLines.map((tradingLine) => tradingLine.panel));
	const symbols = new Set(tradingLines.map((tradingLine) => tradingLine.symbol));
	const tradingLineIds = new Set(tradingLines.map((tradingLine) => tradingLine.tradingLineId));

	if (panels.size !== 1) {
		return createFailure(
			'invalid-request',
			'Open BYMADATA panel requests must contain Trading Lines from one panel.',
		);
	}

	if (symbols.size !== tradingLines.length) {
		return createFailure(
			'invalid-request',
			'Open BYMADATA panel requests must not contain duplicate provider symbols.',
		);
	}

	if (tradingLineIds.size !== tradingLines.length) {
		return createFailure(
			'invalid-request',
			'Open BYMADATA panel requests must not contain duplicate Trading Line IDs.',
		);
	}

	return null;
}

function createHistoryUrl(symbol: string, request: OpenBymadataHistoryRequest): URL {
	const url = new URL(`${BASE_URL}/chart/historical-series/history`);
	url.searchParams.set('symbol', symbol);
	url.searchParams.set('resolution', 'D');
	url.searchParams.set('from', String(request.fromEpochSeconds));
	url.searchParams.set('to', String(request.toEpochSeconds));
	return url;
}

function createPanelRequest(): RequestInit {
	return {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			excludeZeroPxAndQty: false,
			T1: true,
			T0: false,
			page_size: 5_000,
		}),
	};
}

async function fetchJson(
	fetchFromProvider: OpenBymadataFetch,
	input: string | URL,
	init?: RequestInit,
): Promise<Readonly<{ ok: true; value: unknown }> | OpenBymadataFailure> {
	try {
		const response = await fetchFromProvider(input, init);

		if (!response.ok) {
			return createFailure(
				'request-failed',
				`Open BYMADATA returned HTTP ${response.status}.`,
			);
		}

		const value: unknown = await response.json();
		return { ok: true, value };
	} catch {
		return createFailure('request-failed', 'Open BYMADATA could not be reached or read.');
	}
}

function parsePanelRows(
	panel: OpenBymadataPanel,
	value: unknown,
): Readonly<{ ok: true; rows: readonly OpenBymadataPanelRow[] }> | OpenBymadataFailure {
	if (panel === 'cedears') {
		const parsedResponse = v.safeParse(directPanelResponseSchema, value);
		return parsedResponse.success
			? { ok: true, rows: parsedResponse.output }
			: createFailure('invalid-response', 'Open BYMADATA returned a malformed CEDEAR panel.');
	}

	const parsedResponse = v.safeParse(wrappedPanelResponseSchema, value);

	if (!parsedResponse.success) {
		return createFailure(
			'invalid-response',
			'Open BYMADATA returned a malformed equity panel.',
		);
	}

	const { content, data } = parsedResponse.output;
	const hasCompletePage =
		content.page_count <= 1 &&
		content.page_number === 1 &&
		data.length === content.total_elements_count;

	if (!hasCompletePage) {
		return createFailure(
			'incomplete-response',
			'Open BYMADATA returned only part of the requested equity panel.',
		);
	}

	return { ok: true, rows: parsedResponse.output.data };
}

function checkIfPanelRowsHaveUniqueSymbols(rows: readonly OpenBymadataPanelRow[]): boolean {
	return new Set(rows.map((row) => row.symbol)).size === rows.length;
}

function matchPanelRows(
	tradingLines: readonly OpenBymadataTradingLineDescriptor[],
	rows: readonly OpenBymadataPanelRow[],
	sessionDate: string,
): OpenBymadataPanelLineResult[] {
	const rowsBySymbol = new Map(rows.map((row) => [row.symbol, row]));

	return tradingLines.map((tradingLine) => {
		const source = createSource(tradingLine);
		const row = rowsBySymbol.get(tradingLine.symbol);

		if (!row) {
			return {
				status: 'missing',
				tradingLineId: tradingLine.tradingLineId,
				source,
			};
		}

		return {
			status: 'found',
			tradingLineId: tradingLine.tradingLineId,
			source,
			bar: {
				sessionDate,
				open: row.openingPrice,
				high: row.tradingHighPrice,
				low: row.tradingLowPrice,
				close: row.closingPrice,
				volume: row.volume,
			},
		};
	});
}

function createSource(tradingLine: OpenBymadataTradingLineDescriptor): BarHistorySource {
	return {
		provider: 'open-bymadata',
		symbol: `${tradingLine.symbol} ${SETTLEMENT}`,
	};
}

function createHistorySeries(
	response: v.InferOutput<typeof historyResponseSchema>,
): OpenBymadataHistorySeries {
	return {
		timestamps: response.t,
		openPrices: response.o,
		highPrices: response.h,
		lowPrices: response.l,
		closePrices: response.c,
		volumes: response.v,
	};
}

function checkIfHistorySeriesAreAligned(series: OpenBymadataHistorySeries): boolean {
	const seriesLength = series.timestamps.length;
	return (
		series.openPrices.length === seriesLength &&
		series.highPrices.length === seriesLength &&
		series.lowPrices.length === seriesLength &&
		series.closePrices.length === seriesLength &&
		series.volumes.length === seriesLength
	);
}

function normalizeHistorySeries(
	series: OpenBymadataHistorySeries,
	throughSession: string,
): DailyBar[] | null {
	try {
		return series.timestamps.flatMap((timestamp, index) => {
			const sessionDate = convertTimestampToSessionDate(timestamp);

			if (sessionDate > throughSession) {
				return [];
			}

			return [createDailyBar(series, index, sessionDate)];
		});
	} catch {
		return null;
	}
}

function convertTimestampToSessionDate(timestamp: number): string {
	const instant = Temporal.Instant.fromEpochMilliseconds(timestamp * 1_000);
	return instant.toZonedDateTimeISO('America/Argentina/Buenos_Aires').toPlainDate().toString();
}

function createDailyBar(
	series: OpenBymadataHistorySeries,
	index: number,
	sessionDate: string,
): DailyBar {
	return {
		sessionDate,
		open: getSeriesValue(series.openPrices, index),
		high: getSeriesValue(series.highPrices, index),
		low: getSeriesValue(series.lowPrices, index),
		close: getSeriesValue(series.closePrices, index),
		volume: getSeriesValue(series.volumes, index),
	};
}

function getSeriesValue(values: readonly number[], index: number): number {
	const value = values[index];

	if (value === undefined) {
		throw new Error('Open BYMADATA history arrays are not aligned.');
	}

	return value;
}

function createFailure(
	reason: OpenBymadataFailure['reason'],
	message: string,
): OpenBymadataFailure {
	return { ok: false, reason, message };
}
