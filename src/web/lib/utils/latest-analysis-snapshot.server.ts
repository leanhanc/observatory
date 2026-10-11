import { createAnalysisSnapshotStorage } from '#modules/analysis-run/index.ts';
import { resolveBarHistoryStorageConfiguration } from '#server/bar-history-storage-configuration/index.ts';

import type { LatestAnalysisSnapshotReadResult } from '#modules/analysis-run/index.ts';

/**
 * Reads the latest Analysis Snapshot from the bucket. The `.server.ts` suffix makes TanStack Start
 * fail the build if client code imports this file, so storage credentials cannot reach the browser.
 *
 * @throws {Error} when the storage environment variables are missing or invalid.
 */
export function readLatestAnalysisSnapshot(): Promise<LatestAnalysisSnapshotReadResult> {
	const configuration = resolveBarHistoryStorageConfiguration(process.env);
	return createAnalysisSnapshotStorage(configuration).readLatest();
}
