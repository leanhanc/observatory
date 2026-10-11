import { createAnalysisSnapshotStorage } from '#modules/analysis-run/index.ts';
import { resolveBarHistoryStorageConfiguration } from '#server/bar-history-storage-configuration/index.ts';

import { requireRenderableSnapshot } from './snapshot-pages.ts';

import type { AnalysisSnapshotOverview } from '#modules/analysis-run/index.ts';

let latestSnapshotRead: Promise<AnalysisSnapshotOverview> | undefined;

/**
 * Reads the latest Analysis Snapshot from the bucket. The `.server.ts` suffix makes TanStack Start
 * fail the build if client code imports this file, so storage credentials cannot reach the browser.
 *
 * The bucket is read once per process: a build prerenders every page in one server process, so
 * every page describes the same run and the snapshot is not downloaded per page. A dev server
 * keeps the snapshot it read first until it restarts.
 *
 * @throws {Error} when the storage environment variables are missing or invalid, or when there is
 * no snapshot to render.
 */
export function readLatestAnalysisSnapshot(): Promise<AnalysisSnapshotOverview> {
	latestSnapshotRead ??= readRenderableSnapshot(process.env);
	return latestSnapshotRead;
}

/**
 * Reads the latest Analysis Snapshot from the bucket configured in `environment`, without reusing
 * an earlier read.
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
