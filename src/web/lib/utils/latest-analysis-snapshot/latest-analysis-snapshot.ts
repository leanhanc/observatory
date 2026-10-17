import {
	createAnalysisSnapshotStorage,
	parseAnalysisSnapshotOverview,
} from '#modules/analysis-run/index.ts';
import { resolveBarHistoryStorageConfiguration } from '#server/bar-history-storage-configuration/index.ts';
import { requireRenderableSnapshot } from '#web/lib/utils/snapshot-pages/index.ts';

import type {
	AnalysisSnapshotOverview,
	LatestAnalysisSnapshotReadResult,
} from '#modules/analysis-run/index.ts';

/** Points a local build at a snapshot file, such as a dry run's `--output`, instead of the bucket. */
export const SNAPSHOT_FILE_VARIABLE = 'OBSERVATORY_SNAPSHOT_FILE';

/**
 * Reads the latest Analysis Snapshot from the bucket configured in `environment`, or from the file
 * `OBSERVATORY_SNAPSHOT_FILE` names, with the same validation either way. Only the build calls it,
 * so storage credentials never reach a page.
 *
 * @throws {Error} when the storage environment variables are missing or invalid, or when there is
 * no snapshot to render.
 */
export async function readRenderableSnapshot(
	environment: Readonly<Record<string, string | undefined>>,
): Promise<AnalysisSnapshotOverview> {
	const snapshotFile = environment[SNAPSHOT_FILE_VARIABLE]?.trim();

	if (snapshotFile) {
		return requireRenderableSnapshot(await readSnapshotFile(snapshotFile));
	}

	const configuration = resolveBarHistoryStorageConfiguration(environment);
	const readResult = await createAnalysisSnapshotStorage(configuration).readLatest();
	return requireRenderableSnapshot(readResult);
}

async function readSnapshotFile(path: string): Promise<LatestAnalysisSnapshotReadResult> {
	const file = Bun.file(path);

	if (!(await file.exists())) {
		return { ok: false, reason: 'not-found', message: `${path} does not exist.` };
	}

	return parseAnalysisSnapshotOverview(await file.text());
}
