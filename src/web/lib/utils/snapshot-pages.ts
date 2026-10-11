import type {
	AnalysisSnapshotOverview,
	LatestAnalysisSnapshotReadResult,
} from '#modules/analysis-run/index.ts';

export type PrerenderPage = Readonly<{ path: string }>;

export function buildLinePagePath(tradingLineId: string): string {
	return `/lines/${encodeURIComponent(tradingLineId)}`;
}

/** The pages a build prerenders: `/` and one page per analyzed line, in snapshot order. */
export function buildPrerenderPages(snapshot: AnalysisSnapshotOverview): PrerenderPage[] {
	const linePages = snapshot.analyzedLines.map((line) => ({
		path: buildLinePagePath(line.tradingLineId),
	}));

	return [{ path: '/' }, ...linePages];
}

/**
 * Returns the snapshot the pages render. A failed build keeps the previous deployment serving, so
 * having nothing to render throws instead of producing empty pages.
 *
 * @throws {Error} when the read failed or the snapshot has no analyzed lines.
 */
export function requireRenderableSnapshot(
	readResult: LatestAnalysisSnapshotReadResult,
): AnalysisSnapshotOverview {
	if (!readResult.ok) {
		throw new Error(`No Analysis Snapshot to render: ${readResult.message}`);
	}

	const hasAnalyzedLines = readResult.snapshot.analyzedLines.length > 0;

	if (!hasAnalyzedLines) {
		throw new Error('No Analysis Snapshot to render: the snapshot has no analyzed lines.');
	}

	return readResult.snapshot;
}
