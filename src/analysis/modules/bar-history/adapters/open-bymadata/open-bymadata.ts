import * as v from 'valibot';

import type { BarHistorySource, DailyBar } from '../../bar-history.types.ts';
import type {
	DailyBarRangeRepair,
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
// Largest relative distance an open or close may sit outside the high-low range and still be
// treated as a provider adjustment artifact. The observed GGAL case was 0.26%.
const RANGE_REPAIR_TOLERANCE = 0.01;
// Request timeout, rate limit; 5xx statuses are transient too.
const TRANSIENT_HTTP_STATUSES = new Set([408, 429]);

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
 * Creates the Open BYMADATA adapter. Bar History acquisition and the Analysis Run fetch through it.
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
		return { ok: true, source, bars: [], repairs: [] };
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
	const repairs: DailyBarRangeRepair[] = [];
	const acceptedBars = realBars.map((bar) => {
		const repair = repairDailyBarRange(bar);

		if (!repair) {
			return bar;
		}

		repairs.push(repair);
		return repair.repairedBar;
	});

	return { ok: true, source, bars: acceptedBars, repairs };
}

/**
 * Widens a bar's range when the provider reports an open or close slightly outside it.
 *
 * Open BYMADATA appears to back-adjust history for cash distributions, and adjusted bars can
 * place the close just outside the adjusted high-low range. Open and close stay untouched because the
 * close is the official session price. Gaps larger than the tolerance, or a low above the high,
 * are left for validation to reject.
 */
function repairDailyBarRange(bar: DailyBar): DailyBarRangeRepair | null {
	const isRangeInverted = bar.low > bar.high;

	if (isRangeInverted) {
		return null;
	}

	const lowestPrice = Math.min(bar.open, bar.close);
	const highestPrice = Math.max(bar.open, bar.close);
	const isBelowRange = lowestPrice < bar.low;
	const isAboveRange = highestPrice > bar.high;

	if (!isBelowRange && !isAboveRange) {
		return null;
	}

	const lowGapRatio = (bar.low - lowestPrice) / bar.low;
	const highGapRatio = (highestPrice - bar.high) / bar.high;
	const exceedsTolerance =
		lowGapRatio > RANGE_REPAIR_TOLERANCE || highGapRatio > RANGE_REPAIR_TOLERANCE;

	if (exceedsTolerance) {
		return null;
	}

	return {
		sessionDate: bar.sessionDate,
		providerBar: bar,
		repairedBar: {
			...bar,
			low: Math.min(bar.low, lowestPrice),
			high: Math.max(bar.high, highestPrice),
		},
	};
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

/**
 * `request-failed` means the provider may answer if asked again: the request did not complete, or
 * the provider reported an outage or a rate limit. Every other failure is the provider's answer.
 */
async function fetchJson(
	fetchFromProvider: OpenBymadataFetch,
	input: string | URL,
	init?: RequestInit,
): Promise<Readonly<{ ok: true; value: unknown }> | OpenBymadataFailure> {
	let response: Response;

	try {
		response = await fetchFromProvider(input, init);
	} catch {
		return createFailure('request-failed', 'Open BYMADATA could not be reached.');
	}

	if (!response.ok) {
		const isTransientStatus =
			response.status >= 500 || TRANSIENT_HTTP_STATUSES.has(response.status);
		const reason = isTransientStatus ? 'request-failed' : 'request-rejected';
		return createFailure(reason, `Open BYMADATA returned HTTP ${response.status}.`);
	}

	try {
		const value: unknown = await response.json();
		return { ok: true, value };
	} catch (error) {
		if (error instanceof SyntaxError) {
			return createFailure(
				'invalid-response',
				'Open BYMADATA returned a body that is not JSON.',
			);
		}

		return createFailure('request-failed', 'Open BYMADATA could not be read.');
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
