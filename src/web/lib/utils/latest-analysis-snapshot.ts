import { createAnalysisSnapshotStorage } from '#modules/analysis-run/index.ts';
import { resolveBarHistoryStorageConfiguration } from '#server/bar-history-storage-configuration/index.ts';

import { requireRenderableSnapshot } from './snapshot-pages.ts';

import type { AnalysisSnapshotOverview } from '#modules/analysis-run/index.ts';

/**
 * Reads the latest Analysis Snapshot from the bucket configured in `environment`. Only the build
 * calls it, so storage credentials never reach a page.
 *
 * @throws {Error} when the storage environment variables are missing or invalid, or when there is
 * no snapshot to render.
 */
export async function readRenderableSnapshot(
	environment: Readonly<Record<string, string | undefined>>,
): Promise<AnalysisSnapshotOverview> {
	const configuration = resolveBarHistoryStorageConfiguration(environment);
	const readResult = await createAnalysisSnapshotStorage(configuration).readLatest();
	return requireRenderableSnapshot(readResult);
}
