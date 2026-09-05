import { describe, expect, test } from 'bun:test';

import { createOpenBymadataAdapter } from './open-bymadata.ts';

import type {
	OpenBymadataFetch,
	OpenBymadataPanel,
	OpenBymadataTradingLineDescriptor,
} from './open-bymadata.types.ts';

const aaplArs = createTradingLine('cedear-aapl-ars', 'AAPL', 'cedears');
const aaplMep = createTradingLine('cedear-aapl-mep', 'AAPLD', 'cedears');
const aaplCcl = createTradingLine('cedear-aapl-ccl', 'AAPLC', 'cedears');

describe('Open BYMADATA adapter', () => {
	test('builds a daily 24HS request and normalizes parallel history series', async () => {
		const fixture = await readFixture('history.json');
		const requests: Request[] = [];
		const adapter = createOpenBymadataAdapter(createFixtureFetch(fixture, requests));
		const result = await adapter.fetchHistory({
			tradingLine: aaplArs,
			fromEpochSeconds: 1_788_231_600,
			toEpochSeconds: 1_788_404_400,
			throughSession: '2026-09-03',
		});

		expect(requests).toHaveLength(1);
		expect(requests[0]?.url).toBe(
			'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/chart/historical-series/history?symbol=AAPL+24HS&resolution=D&from=1788231600&to=1788404400',
		);
		expect(result).toEqual({
			ok: true,
			source: { provider: 'open-bymadata', symbol: 'AAPL 24HS' },
			bars: [
				{
					sessionDate: '2026-09-01',
					open: 25_440,
					high: 26_140,
					low: 25_180,
					close: 25_840,
					volume: 135_252,
				},
				{
					sessionDate: '2026-09-02',
					open: 26_000,
					high: 26_180,
					low: 25_740,
					close: 25_860,
					volume: 108_748,
				},
				{
					sessionDate: '2026-09-03',
					open: 25_920,
					high: 26_280,
					low: 25_800,
					close: 26_060,
					volume: 86_652,
				},
			],
		});
	});

	test('matches ARS, MEP, and CCL lines from one CEDEAR panel request', async () => {
		const fixture = await readFixture('cedears-panel.json');
		const requests: Request[] = [];
		const adapter = createOpenBymadataAdapter(createFixtureFetch(fixture, requests));
		const result = await adapter.fetchPanel({
			tradingLines: [aaplArs, aaplMep, aaplCcl],
			throughSession: '2026-09-03',
		});

		expect(requests).toHaveLength(1);
		expect(await requests[0]?.json()).toEqual({
			excludeZeroPxAndQty: false,
			T1: true,
			T0: false,
			page_size: 5_000,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.lines.map((line) => [line.tradingLineId, line.status])).toEqual([
			['cedear-aapl-ars', 'found'],
			['cedear-aapl-mep', 'found'],
			['cedear-aapl-ccl', 'found'],
		]);
		expect(result.lines[0]).toMatchObject({
			status: 'found',
			bar: {
				sessionDate: '2026-09-03',
				open: 25_960,
				high: 26_200,
				low: 25_240,
				close: 25_380,
				volume: 134_573,
			},
		});
	});

	test('reads both wrapped equity panels', async () => {
		const leadingFixture = await readFixture('leading-equity-panel.json');
		const generalFixture = await readFixture('general-equity-panel.json');
		const adapter = createOpenBymadataAdapter(
			createPanelFixtureFetch({
				'leading-equity': leadingFixture,
				'general-equity': generalFixture,
			}),
		);

		const leadingResult = await adapter.fetchPanel({
			tradingLines: [createTradingLine('equity-ggal-ars', 'GGAL', 'leading-equity')],
			throughSession: '2026-09-03',
		});
		const generalResult = await adapter.fetchPanel({
			tradingLines: [createTradingLine('equity-a3-ars', 'A3', 'general-equity')],
			throughSession: '2026-09-03',
		});

		expect(leadingResult).toMatchObject({
			ok: true,
			lines: [{ status: 'found', tradingLineId: 'equity-ggal-ars' }],
		});
		expect(generalResult).toMatchObject({
			ok: true,
			lines: [{ status: 'found', tradingLineId: 'equity-a3-ars' }],
		});
	});

	test('reports a requested line missing from an otherwise valid panel', async () => {
		const fixture = await readFixture('cedears-panel.json');
		const adapter = createOpenBymadataAdapter(createFixtureFetch(fixture));
		const result = await adapter.fetchPanel({
			tradingLines: [createTradingLine('cedear-missing-ars', 'MISSING', 'cedears')],
			throughSession: '2026-09-03',
		});

		expect(result).toEqual({
			ok: true,
			lines: [
				{
					status: 'missing',
					tradingLineId: 'cedear-missing-ars',
					source: { provider: 'open-bymadata', symbol: 'MISSING 24HS' },
				},
			],
		});
	});

	test('treats a successful no-data history as an empty series', async () => {
		const fixture = await readFixture('history-no-data.json');
		const adapter = createOpenBymadataAdapter(createFixtureFetch(fixture));
		const result = await adapter.fetchHistory({
			tradingLine: createTradingLine('cedear-inactive-ars', 'INACTIVE', 'cedears'),
			fromEpochSeconds: 1,
			toEpochSeconds: 2,
			throughSession: '2026-09-03',
		});

		expect(result).toEqual({
			ok: true,
			source: { provider: 'open-bymadata', symbol: 'INACTIVE 24HS' },
			bars: [],
		});
	});

	test('uses the Buenos Aires date and excludes sessions beyond completed progress', async () => {
		const boundaryTimestamp = toEpochSeconds('2026-09-04T02:30:00Z');
		const incompleteSessionTimestamp = toEpochSeconds('2026-09-04T03:00:00Z');
		const fixture = {
			s: 'ok',
			t: [boundaryTimestamp, incompleteSessionTimestamp],
			o: [100, 100],
			h: [103, 103],
			l: [99, 99],
			c: [102, 102],
			v: [1_000, 1_000],
		};
		const adapter = createOpenBymadataAdapter(createFixtureFetch(fixture));
		const result = await adapter.fetchHistory({
			tradingLine: aaplArs,
			fromEpochSeconds: boundaryTimestamp,
			toEpochSeconds: incompleteSessionTimestamp,
			throughSession: '2026-09-03',
		});

		expect(result).toMatchObject({
			ok: true,
			bars: [{ sessionDate: '2026-09-03' }],
		});
	});

	test('rejects trading lines from different panels before requesting data', async () => {
		const fixture = await readFixture('cedears-panel.json');
		const requests: Request[] = [];
		const adapter = createOpenBymadataAdapter(createFixtureFetch(fixture, requests));
		const result = await adapter.fetchPanel({
			tradingLines: [aaplArs, createTradingLine('equity-ggal-ars', 'GGAL', 'leading-equity')],
			throughSession: '2026-09-04',
		});

		expect(requests).toHaveLength(0);
		expect(result).toMatchObject({ ok: false, reason: 'invalid-request' });
	});

	test('rejects malformed and incomplete provider responses', async () => {
		const malformedFixture = await readFixture('history-malformed.json');
		const malformedAdapter = createOpenBymadataAdapter(createFixtureFetch(malformedFixture));
		const incompleteAdapter = createOpenBymadataAdapter(
			createFixtureFetch({
				content: {
					page_number: 1,
					page_count: 1,
					page_size: 5_000,
					total_elements_count: 2,
				},
				data: [createPanelRow('A3')],
			}),
		);

		const malformedResult = await malformedAdapter.fetchHistory({
			tradingLine: aaplArs,
			fromEpochSeconds: 1,
			toEpochSeconds: 2,
			throughSession: '2026-09-03',
		});
		const incompleteResult = await incompleteAdapter.fetchPanel({
			tradingLines: [createTradingLine('equity-a3-ars', 'A3', 'general-equity')],
			throughSession: '2026-09-03',
		});

		expect(malformedResult).toMatchObject({ ok: false, reason: 'invalid-response' });
		expect(incompleteResult).toMatchObject({ ok: false, reason: 'incomplete-response' });
	});

	test('rejects duplicate catalog symbols before requesting data', async () => {
		const requests: Request[] = [];
		const adapter = createOpenBymadataAdapter(createFixtureFetch([], requests));
		const result = await adapter.fetchPanel({
			tradingLines: [aaplArs, createTradingLine('another-aapl-line', 'AAPL', 'cedears')],
			throughSession: '2026-09-03',
		});

		expect(requests).toHaveLength(0);
		expect(result).toMatchObject({ ok: false, reason: 'invalid-request' });
	});

	test('rejects duplicate Trading Line IDs before requesting data', async () => {
		const requests: Request[] = [];
		const adapter = createOpenBymadataAdapter(createFixtureFetch([], requests));
		const result = await adapter.fetchPanel({
			tradingLines: [aaplArs, createTradingLine('cedear-aapl-ars', 'AAPLD', 'cedears')],
			throughSession: '2026-09-03',
		});

		expect(requests).toHaveLength(0);
		expect(result).toMatchObject({ ok: false, reason: 'invalid-request' });
	});

	test('rejects duplicate provider symbols instead of selecting by row order', async () => {
		const adapter = createOpenBymadataAdapter(
			createFixtureFetch([createPanelRow('AAPL'), createPanelRow('AAPL', 99_999)]),
		);
		const result = await adapter.fetchPanel({
			tradingLines: [aaplArs],
			throughSession: '2026-09-03',
		});

		expect(result).toMatchObject({ ok: false, reason: 'invalid-response' });
	});
});

function createTradingLine(
	tradingLineId: string,
	symbol: string,
	panel: OpenBymadataPanel,
): OpenBymadataTradingLineDescriptor {
	return { tradingLineId, symbol, panel };
}

function createFixtureFetch(value: unknown, requests: Request[] = []): OpenBymadataFetch {
	return (input, init) => {
		requests.push(createRequest(input, init));
		return Promise.resolve(Response.json(value));
	};
}

function createPanelFixtureFetch(
	fixtures: Partial<Record<OpenBymadataPanel, unknown>>,
): OpenBymadataFetch {
	return (input, init) => {
		const request = createRequest(input, init);
		const panel = request.url.endsWith('/leading-equity') ? 'leading-equity' : 'general-equity';
		return Promise.resolve(Response.json(fixtures[panel]));
	};
}

function createRequest(input: string | URL | Request, init?: RequestInit): Request {
	return input instanceof Request ? input : new Request(input.toString(), init);
}

function createPanelRow(symbol: string, closingPrice = 102): Record<string, number | string> {
	return {
		symbol,
		openingPrice: 100,
		tradingHighPrice: 103,
		tradingLowPrice: 99,
		closingPrice,
		volume: 1_000,
	};
}

function toEpochSeconds(instant: string): number {
	return Temporal.Instant.from(instant).epochMilliseconds / 1_000;
}

async function readFixture(name: string): Promise<unknown> {
	return Bun.file(new URL(`fixtures/${name}`, import.meta.url)).json();
}
