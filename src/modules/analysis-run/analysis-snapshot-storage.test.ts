import { describe, expect, test } from 'bun:test';

import { createAnalysisSnapshotStorageFromS3Client } from './analysis-snapshot-storage.ts';

import type { AnalysisSnapshot } from './analysis-run.types.ts';

const snapshot: AnalysisSnapshot = {
	schemaVersion: 3,
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
};
const DATED_KEY = 'analysis-snapshots/v3/2026-10-02/2026-10-04T15:00:00.000Z.json';
const LATEST_KEY = 'analysis-snapshots/v3/latest.json';

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

function createFakeS3Client(failingKey: string | null = null) {
	const writtenKeys: string[] = [];
	const writtenData: string[] = [];

	return {
		writtenKeys,
		writtenData,
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
