import type { BarHistoryStorageConfiguration } from '#modules/bar-history/index.ts';
import type { AnalysisSnapshot, AnalysisSnapshotStorage } from './analysis-run.types.ts';

type AnalysisSnapshotS3Client = Readonly<{
	write(path: string, data: string, options: Readonly<{ type: string }>): Promise<number>;
}>;

// The prefix follows the snapshot's `schemaVersion`, so a reader of one schema never finds
// another schema's object under the keys it reads.
const SNAPSHOT_PREFIX = 'analysis-snapshots/v3';
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
): AnalysisSnapshotStorage {
	return createAnalysisSnapshotStorageFromS3Client(new Bun.S3Client(configuration));
}

/**
 * Writes the dated snapshot first and `latest` only after it, so `latest` never points at a
 * snapshot that has no dated copy.
 */
export function createAnalysisSnapshotStorageFromS3Client(
	s3Client: AnalysisSnapshotS3Client,
): AnalysisSnapshotStorage {
	return {
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
