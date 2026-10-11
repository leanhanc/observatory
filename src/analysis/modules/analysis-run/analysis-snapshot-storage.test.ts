import { describe, expect, test } from 'bun:test';

import {
	createAnalysisSnapshotStorageFromS3Client,
	parseAnalysisSnapshotOverview,
} from './analysis-snapshot-storage.ts';

import type { AnalysisSnapshot } from './analysis-run.types.ts';

const snapshot: AnalysisSnapshot = {
	schemaVersion: 6,
	ranAt: '2026-10-04T15:00:00.000Z',
	requestedThroughSession: '2026-10-02',
	analysisConfigurationVersion: 1,
	mepRateSource: {
		pesoBondTradingLineId: 'al30-bond-byma-ars',
		dollarBondTradingLineId: 'al30-bond-byma-usd-mep',
		latestRateSessionDate: '2026-10-02',
		acceptedZeroOpens: [],
		rangeRepairs: [],
	},
	analyzedLines: [],
	corporateActionWatch: {
		status: 'available',
		publishedFrom: '2026-09-26',
		publishedThrough: '2026-10-02',
		candidates: [],
	},
};
const DATED_KEY = 'analysis-snapshots/v6/2026-10-02/2026-10-04T15:00:00.000Z.json';
const LATEST_KEY = 'analysis-snapshots/v6/latest.json';

describe('createAnalysisSnapshotStorageFromS3Client', () => {
	test('writes the dated snapshot before latest', async () => {
		const client = createFakeS3Client();
		const storage = createAnalysisSnapshotStorageFromS3Client(client);

		const result = await storage.write(snapshot);

		expect(result).toEqual({ ok: true, locations: [DATED_KEY, LATEST_KEY] });
		expect(client.writtenKeys).toEqual([DATED_KEY, LATEST_KEY]);
		expect(JSON.parse(client.writtenData[0]!)).toEqual(snapshot);
		expect(client.writtenData[1]).toBe(client.writtenData[0]);
	});

	test('does not replace latest when the dated write fails', async () => {
		const client = createFakeS3Client(DATED_KEY);
		const storage = createAnalysisSnapshotStorageFromS3Client(client);

		const result = await storage.write(snapshot);

		expect(result).toEqual({
			ok: false,
			message: `The snapshot could not be written to ${DATED_KEY}.`,
		});
		expect(client.writtenKeys).toEqual([]);
	});

	test('reports a dated snapshot whose latest replacement failed', async () => {
		const client = createFakeS3Client(LATEST_KEY);
		const storage = createAnalysisSnapshotStorageFromS3Client(client);

		const result = await storage.write(snapshot);

		expect(result).toEqual({
			ok: false,
			message: `The snapshot was written to ${DATED_KEY}, but ${LATEST_KEY} could not be replaced.`,
		});
		expect(client.writtenKeys).toEqual([DATED_KEY]);
	});
});

describe('parseAnalysisSnapshotOverview', () => {
	const latestState = {
		sessionDate: '2026-10-02',
		regime: 'bearish',
		structure: 'downtrend',
		rsi: null,
		priceRelativeToEmaInAtr: -1.39,
	} as const;
	const volatileSession = {
		sessionDate: '2026-09-30',
		event: {
			type: 'volatile-session',
			trueRange: 0.52,
			baselineAtr: 0.18,
			baselineThroughSessionDate: '2026-09-29',
			atrMultiple: 2.85,
		},
		coincidesWithLargeMove: false,
	} as const;
	const availableLine = {
		status: 'available',
		instrumentId: 'ggal',
		tradingLineId: 'ggal-stock-byma-ars',
		latestState,
		events: [volatileSession],
		largeMoves: [],
	};
	const liquidity = { participation: 1, medianDailyTradedValueUsd: 43_290 };
	const unavailableLine = {
		status: 'unavailable',
		instrumentId: 'meli',
		tradingLineId: 'meli-cedear-byma-ars',
		reason: 'insufficient-liquidity',
		message: 'The line did not trade often enough.',
		liquidity,
		corporateActions: [],
	};
	const v6Snapshot = { ...snapshot, analyzedLines: [availableLine, unavailableLine] };

	test('returns the run metadata and the fields the line pages read', () => {
		const result = parseAnalysisSnapshotOverview(JSON.stringify(v6Snapshot));

		expect(result).toEqual({
			ok: true,
			snapshot: {
				schemaVersion: 6,
				ranAt: '2026-10-04T15:00:00.000Z',
				requestedThroughSession: '2026-10-02',
				analyzedLines: [
					{
						status: 'available',
						instrumentId: 'ggal',
						tradingLineId: 'ggal-stock-byma-ars',
						latestState,
						events: [volatileSession],
					},
					{
						status: 'unavailable',
						instrumentId: 'meli',
						tradingLineId: 'meli-cedear-byma-ars',
						reason: 'insufficient-liquidity',
						message: 'The line did not trade often enough.',
						liquidity,
					},
				],
			},
		});
	});

	test('accepts a ranAt with nanoseconds, as the run writes it', () => {
		const nanosecondSnapshot = { ...v6Snapshot, ranAt: '2026-10-10T09:02:43.04013226Z' };

		const result = parseAnalysisSnapshotOverview(JSON.stringify(nanosecondSnapshot));

		expect(result).toMatchObject({
			ok: true,
			snapshot: { ranAt: '2026-10-10T09:02:43.04013226Z' },
		});
	});

	test.each([5, 7])('rejects schema version %d', (schemaVersion) => {
		const otherSnapshot = { ...v6Snapshot, schemaVersion };

		const result = parseAnalysisSnapshotOverview(JSON.stringify(otherSnapshot));

		expect(result).toEqual({
			ok: false,
			reason: 'invalid-snapshot',
			message: 'The snapshot is invalid. schemaVersion: Schema version must be 6.',
		});
	});

	test('rejects a v5 Event type', () => {
		const v5Event = {
			...volatileSession,
			event: { ...volatileSession.event, type: 'volatility-expansion' },
		};
		const lineWithV5Event = { ...availableLine, events: [v5Event] };

		const eventResult = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v6Snapshot, analyzedLines: [lineWithV5Event] }),
		);

		expect(eventResult).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
	});

	test('rejects data that is not JSON', () => {
		const result = parseAnalysisSnapshotOverview('{"schemaVersion": 6,');

		expect(result).toEqual({
			ok: false,
			reason: 'invalid-snapshot',
			message: 'The snapshot is not valid JSON.',
		});
	});

	test('rejects a line with an unknown status', () => {
		const pendingLine = { ...availableLine, status: 'pending' };
		const malformedSnapshot = { ...v6Snapshot, analyzedLines: [pendingLine] };

		const result = parseAnalysisSnapshotOverview(JSON.stringify(malformedSnapshot));

		expect(result).toMatchObject({
			ok: false,
			reason: 'invalid-snapshot',
			message: expect.stringContaining('analyzedLines.0.status'),
		});
	});

	test('rejects an available line without a latest State', () => {
		const { latestState: _latestState, ...lineWithoutState } = availableLine;
		const malformedSnapshot = { ...v6Snapshot, analyzedLines: [lineWithoutState] };

		const result = parseAnalysisSnapshotOverview(JSON.stringify(malformedSnapshot));

		expect(result).toMatchObject({
			ok: false,
			reason: 'invalid-snapshot',
			message: expect.stringContaining('analyzedLines.0.latestState'),
		});
	});

	test('rejects an Event of an unknown type', () => {
		const unknownEvent = { ...volatileSession, event: { type: 'gap-up' } };
		const lineWithUnknownEvent = { ...availableLine, events: [unknownEvent] };
		const malformedSnapshot = { ...v6Snapshot, analyzedLines: [lineWithUnknownEvent] };

		const result = parseAnalysisSnapshotOverview(JSON.stringify(malformedSnapshot));

		expect(result).toMatchObject({
			ok: false,
			reason: 'invalid-snapshot',
			message: expect.stringContaining('analyzedLines.0.events.0.event.type'),
		});
	});

	test('rejects an insufficiently liquid line without its liquidity measures', () => {
		const { liquidity: _liquidity, ...lineWithoutLiquidity } = unavailableLine;
		const malformedSnapshot = { ...v6Snapshot, analyzedLines: [lineWithoutLiquidity] };

		const result = parseAnalysisSnapshotOverview(JSON.stringify(malformedSnapshot));

		expect(result).toMatchObject({
			ok: false,
			reason: 'invalid-snapshot',
			message: expect.stringContaining('analyzedLines.0.liquidity'),
		});
	});

	test('rejects a requested-through session that is not a real date', () => {
		const malformedSnapshot = { ...v6Snapshot, requestedThroughSession: '2026-02-30' };

		const result = parseAnalysisSnapshotOverview(JSON.stringify(malformedSnapshot));

		expect(result).toEqual({
			ok: false,
			reason: 'invalid-snapshot',
			message:
				'The snapshot is invalid. requestedThroughSession: Value must be a real YYYY-MM-DD date.',
		});
	});

	test('rejects a snapshot without analyzed lines', () => {
		const { analyzedLines: _analyzedLines, ...snapshotWithoutLines } = v6Snapshot;

		const result = parseAnalysisSnapshotOverview(JSON.stringify(snapshotWithoutLines));

		expect(result).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
	});
});

describe('readLatest', () => {
	test('reads and validates latest', async () => {
		const client = createFakeS3Client();
		client.storedObjects.set(LATEST_KEY, JSON.stringify(snapshot));
		const storage = createAnalysisSnapshotStorageFromS3Client(client);

		const result = await storage.readLatest();

		expect(client.readKeys).toEqual([LATEST_KEY]);
		expect(result).toMatchObject({ ok: true, snapshot: { ranAt: snapshot.ranAt } });
	});

	test('reports a missing latest as not found', async () => {
		const storage = createAnalysisSnapshotStorageFromS3Client(createFakeS3Client());

		const result = await storage.readLatest();

		expect(result).toEqual({
			ok: false,
			reason: 'not-found',
			message: `${LATEST_KEY} does not exist.`,
		});
	});

	test('reports any other read error as a failed read', async () => {
		const storage = createAnalysisSnapshotStorageFromS3Client(createFakeS3Client(LATEST_KEY));

		const result = await storage.readLatest();

		expect(result).toEqual({
			ok: false,
			reason: 'read-failed',
			message: `${LATEST_KEY} could not be read.`,
		});
	});
});

function createFakeS3Client(failingKey: string | null = null) {
	const writtenKeys: string[] = [];
	const writtenData: string[] = [];
	const readKeys: string[] = [];
	const storedObjects = new Map<string, string>();

	return {
		writtenKeys,
		writtenData,
		readKeys,
		storedObjects,
		file: (path: string) => ({
			text: () => {
				readKeys.push(path);

				if (path === failingKey) {
					return Promise.reject(new Error('bucket unavailable'));
				}

				const storedObject = storedObjects.get(path);

				if (storedObject === undefined) {
					return Promise.reject(
						Object.assign(new Error('The specified key does not exist.'), {
							code: 'NoSuchKey',
						}),
					);
				}

				return Promise.resolve(storedObject);
			},
		}),
		write: (path: string, data: string) => {
			if (path === failingKey) {
				return Promise.reject(new Error('bucket unavailable'));
			}

			writtenKeys.push(path);
			writtenData.push(data);
			return Promise.resolve(data.length);
		},
	};
}
