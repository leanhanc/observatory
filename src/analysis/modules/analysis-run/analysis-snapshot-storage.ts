import * as v from 'valibot';

import { analysisSnapshotOverviewSchema } from './analysis-snapshot.schema.ts';

import type { BarHistoryStorageConfiguration } from '#modules/bar-history/index.ts';
import type {
	AnalysisSnapshot,
	AnalysisSnapshotBucketStorage,
	LatestAnalysisSnapshotReadResult,
} from './analysis-run.types.ts';

type AnalysisSnapshotS3Client = Readonly<{
	write(path: string, data: string, options: Readonly<{ type: string }>): Promise<number>;
	file(path: string): Readonly<{ text(): Promise<string> }>;
}>;

// The prefix follows the snapshot's `schemaVersion`, so a reader of one schema never finds
// another schema's object under the keys it reads.
const SNAPSHOT_PREFIX = 'analysis-snapshots/v5';
const JSON_CONTENT_TYPE = 'application/json';

export const LATEST_ANALYSIS_SNAPSHOT_KEY = `${SNAPSHOT_PREFIX}/latest.json`;

export function buildAnalysisSnapshotKey(snapshot: AnalysisSnapshot): string {
	return `${SNAPSHOT_PREFIX}/${snapshot.requestedThroughSession}/${snapshot.ranAt}.json`;
}

/**
 * Creates snapshot storage in the same private S3-compatible bucket as Bar History.
 */
export function createAnalysisSnapshotStorage(
	configuration: BarHistoryStorageConfiguration,
): AnalysisSnapshotBucketStorage {
	return createAnalysisSnapshotStorageFromS3Client(new Bun.S3Client(configuration));
}

/**
 * Writes the dated snapshot first and `latest` only after it, so `latest` never points at a
 * snapshot that has no dated copy. `readLatest` never throws: a missing, unreadable or invalid
 * `latest` is its failure result.
 */
export function createAnalysisSnapshotStorageFromS3Client(
	s3Client: AnalysisSnapshotS3Client,
): AnalysisSnapshotBucketStorage {
	return {
		readLatest: () => readLatestSnapshot(s3Client),
		write: async (snapshot) => {
			const serializedSnapshot = JSON.stringify(snapshot);
			const snapshotKey = buildAnalysisSnapshotKey(snapshot);

			try {
				await s3Client.write(snapshotKey, serializedSnapshot, { type: JSON_CONTENT_TYPE });
			} catch {
				return {
					ok: false,
					message: `The snapshot could not be written to ${snapshotKey}.`,
				};
			}

			try {
				await s3Client.write(LATEST_ANALYSIS_SNAPSHOT_KEY, serializedSnapshot, {
					type: JSON_CONTENT_TYPE,
				});
			} catch {
				return {
					ok: false,
					message: `The snapshot was written to ${snapshotKey}, but ${LATEST_ANALYSIS_SNAPSHOT_KEY} could not be replaced.`,
				};
			}

			return { ok: true, locations: [snapshotKey, LATEST_ANALYSIS_SNAPSHOT_KEY] };
		},
	};
}

async function readLatestSnapshot(
	s3Client: AnalysisSnapshotS3Client,
): Promise<LatestAnalysisSnapshotReadResult> {
	let serializedSnapshot: string;

	try {
		serializedSnapshot = await s3Client.file(LATEST_ANALYSIS_SNAPSHOT_KEY).text();
	} catch (error) {
		if (checkIfObjectIsMissing(error)) {
			return {
				ok: false,
				reason: 'not-found',
				message: `${LATEST_ANALYSIS_SNAPSHOT_KEY} does not exist.`,
			};
		}

		return {
			ok: false,
			reason: 'read-failed',
			message: `${LATEST_ANALYSIS_SNAPSHOT_KEY} could not be read.`,
		};
	}

	return parseAnalysisSnapshotOverview(serializedSnapshot);
}

/** Validates the fields of a serialized Analysis Snapshot that the web reads. */
export function parseAnalysisSnapshotOverview(
	serializedSnapshot: string,
): LatestAnalysisSnapshotReadResult {
	let snapshotData: unknown;

	try {
		snapshotData = JSON.parse(serializedSnapshot);
	} catch {
		return {
			ok: false,
			reason: 'invalid-snapshot',
			message: 'The snapshot is not valid JSON.',
		};
	}

	const parseResult = v.safeParse(analysisSnapshotOverviewSchema, snapshotData);

	if (!parseResult.success) {
		const issueMessages = parseResult.issues.map(
			(issue) => `${v.getDotPath(issue) ?? 'snapshot'}: ${issue.message}`,
		);
		return {
			ok: false,
			reason: 'invalid-snapshot',
			message: `The snapshot is invalid. ${issueMessages.join(' ')}`,
		};
	}

	return { ok: true, snapshot: parseResult.output };
}

// Bun's S3 client rejects a read of a missing key with an error whose `code` is `NoSuchKey`.
function checkIfObjectIsMissing(error: unknown): boolean {
	return error instanceof Error && 'code' in error && error.code === 'NoSuchKey';
}
