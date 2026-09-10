import * as v from 'valibot';

import type { BarHistorySource, DailyBar } from '../../bar-history.types.ts';
import type {
	OpenBymadataAdapter,
	OpenBymadataFailure,
	OpenBymadataFetch,
	OpenBymadataHistoryRequest,
	OpenBymadataHistoryResult,
	OpenBymadataHistorySeries,
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
	};
}

async function fetchHistory(
	fetchFromProvider: OpenBymadataFetch,
	request: OpenBymadataHistoryRequest,
): Promise<OpenBymadataHistoryResult> {
	const source = buildOpenBymadataSource(request.tradingLine);
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

	const bars = normalizeHistorySeries(series, request.requestedThroughSession);

	if (!bars) {
		return createFailure(
			'invalid-response',
			'Open BYMADATA returned a timestamp outside the supported date range.',
		);
	}

	const realBars = bars.filter((bar) => !checkIfDailyBarIsContinuityData(bar));
	return { ok: true, source, bars: realBars };
}

function checkIfDailyBarIsContinuityData(bar: DailyBar): boolean {
	const hasNoVolume = bar.volume === 0;
	const hasRetainedClose = bar.close > 0;
	const hasMissingRangePrice = bar.open === 0 || bar.high === 0 || bar.low === 0;

	return hasNoVolume && hasRetainedClose && hasMissingRangePrice;
}

function createHistoryUrl(symbol: string, request: OpenBymadataHistoryRequest): URL {
	const url = new URL(`${BASE_URL}/chart/historical-series/history`);
	url.searchParams.set('symbol', symbol);
	url.searchParams.set('resolution', 'D');
	url.searchParams.set('from', String(request.fromEpochSeconds));
	url.searchParams.set('to', String(request.toEpochSeconds));
	return url;
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

export function buildOpenBymadataSource(
	tradingLine: OpenBymadataTradingLineDescriptor,
): BarHistorySource {
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
	requestedThroughSession: string,
): DailyBar[] | null {
	try {
		return series.timestamps.flatMap((timestamp, index) => {
			const sessionDate = convertTimestampToSessionDate(timestamp);

			if (sessionDate > requestedThroughSession) {
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
