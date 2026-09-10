import { describe, expect, test } from 'bun:test';

import { createOpenBymadataAdapter } from './open-bymadata.ts';

import type {
	OpenBymadataFetch,
	OpenBymadataTradingLineDescriptor,
} from './open-bymadata.types.ts';

const AAPL = createTradingLine('cedear-aapl-ars', 'AAPL');

describe('Open BYMADATA adapter', () => {
	test('builds a daily 24HS request and normalizes parallel history series', async () => {
		const fixture = await readFixture('history.json');
		const requests: Request[] = [];
		const adapter = createOpenBymadataAdapter(createFixtureFetch(fixture, requests));
		const result = await adapter.fetchHistory({
			tradingLine: AAPL,
			fromEpochSeconds: 1_788_231_600,
			toEpochSeconds: 1_788_404_400,
			requestedThroughSession: '2026-09-03',
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

	test('preserves suspicious dated rows for domain validation', async () => {
		const adapter = createOpenBymadataAdapter(
			createFixtureFetch({
				s: 'ok',
				t: [1, 2, 3, 4, 5, 6, 7].map((day) => toEpochSeconds(`2026-09-0${day}T03:00:00Z`)),
				o: [0, 100, 1, 0, 0, 0, 0],
				h: [0, 103, 0, 1, 0, 0, 0],
				l: [0, 99, 0, 0, 1, 0, 0],
				c: [102, 102, 102, 102, 102, 102, -1],
				v: [0, 0, 0, 0, 0, 1, 0],
			}),
		);
		const result = await adapter.fetchHistory({
			tradingLine: AAPL,
			fromEpochSeconds: 0,
			toEpochSeconds: 2_000_000_000,
			requestedThroughSession: '2026-09-07',
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.bars.map((bar) => bar.sessionDate)).toEqual([
			'2026-09-01',
			'2026-09-02',
			'2026-09-03',
			'2026-09-04',
			'2026-09-05',
			'2026-09-06',
			'2026-09-07',
		]);
		expect(result.bars[0]).toMatchObject({ open: 0, close: 102, volume: 0 });
		expect(result.bars[1]).toMatchObject({ open: 100, volume: 0 });
	});

	test('treats a successful no-data history as an empty series', async () => {
		const fixture = await readFixture('history-no-data.json');
		const adapter = createOpenBymadataAdapter(createFixtureFetch(fixture));
		const result = await adapter.fetchHistory({
			tradingLine: createTradingLine('cedear-inactive-ars', 'INACTIVE'),
			fromEpochSeconds: 1,
			toEpochSeconds: 2,
			requestedThroughSession: '2026-09-03',
		});

		expect(result).toEqual({
			ok: true,
			source: { provider: 'open-bymadata', symbol: 'INACTIVE 24HS' },
			bars: [],
		});
	});

	test('uses the Buenos Aires date and excludes sessions beyond requested progress', async () => {
		const boundaryTimestamp = toEpochSeconds('2026-09-04T02:30:00Z');
		const laterSessionTimestamp = toEpochSeconds('2026-09-04T03:00:00Z');
		const adapter = createOpenBymadataAdapter(
			createFixtureFetch({
				s: 'ok',
				t: [boundaryTimestamp, laterSessionTimestamp],
				o: [100, 100],
				h: [103, 103],
				l: [99, 99],
				c: [102, 102],
				v: [1_000, 1_000],
			}),
		);
		const result = await adapter.fetchHistory({
			tradingLine: AAPL,
			fromEpochSeconds: boundaryTimestamp,
			toEpochSeconds: laterSessionTimestamp,
			requestedThroughSession: '2026-09-03',
		});

		expect(result).toMatchObject({
			ok: true,
			bars: [{ sessionDate: '2026-09-03' }],
		});
	});

	test('rejects malformed history responses', async () => {
		const fixture = await readFixture('history-malformed.json');
		const adapter = createOpenBymadataAdapter(createFixtureFetch(fixture));
		const result = await adapter.fetchHistory({
			tradingLine: AAPL,
			fromEpochSeconds: 1,
			toEpochSeconds: 2,
			requestedThroughSession: '2026-09-03',
		});

		expect(result).toMatchObject({ ok: false, reason: 'invalid-response' });
	});
});

function createTradingLine(
	tradingLineId: string,
	symbol: string,
): OpenBymadataTradingLineDescriptor {
	return { tradingLineId, symbol };
}

function createFixtureFetch(value: unknown, requests: Request[] = []): OpenBymadataFetch {
	return (input, init) => {
		requests.push(input instanceof Request ? input : new Request(input.toString(), init));
		return Promise.resolve(Response.json(value));
	};
}

function toEpochSeconds(instant: string): number {
	return Temporal.Instant.from(instant).epochMilliseconds / 1_000;
}

async function readFixture(name: string): Promise<unknown> {
	return Bun.file(new URL(`fixtures/${name}`, import.meta.url)).json();
}
