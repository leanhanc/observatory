import type {
	AnalysisSnapshotOverview,
	LatestAnalysisSnapshotReadResult,
} from '#modules/analysis-run/index.ts';
import type { AvailableLine, SnapshotLine } from './snapshot-pages.types.ts';

export type LinePage = Readonly<{
	params: { tradingLineId: string };
	props: LinePageProps;
}>;

export type LinePageProps = Readonly<{
	requestedThroughSession: string;
	line: SnapshotLine;
}>;

export type LineChartPage = Readonly<{
	params: { tradingLineId: string };
	props: Readonly<{ line: AvailableLine }>;
}>;

export function buildLinePagePath(tradingLineId: string): string {
	return `/lines/${encodeURIComponent(tradingLineId)}`;
}

/**
 * The absolute path of a line's chart file. A page is served with and without a trailing slash, so
 * a relative path would resolve to two different files.
 */
export function buildLineChartPath(tradingLineId: string): string {
	return `${buildLinePagePath(tradingLineId)}/chart.json`;
}

/** The chart files a build writes: one per available line, which is the only kind with a chart. */
export function buildLineChartPages(snapshot: AnalysisSnapshotOverview): LineChartPage[] {
	return snapshot.analyzedLines.flatMap((line) => {
		if (line.status !== 'available') {
			return [];
		}

		return [{ params: { tradingLineId: line.tradingLineId }, props: { line } }];
	});
}

/** The line pages a build prerenders: one per analyzed line, available or not, in snapshot order. */
export function buildLinePages(snapshot: AnalysisSnapshotOverview): LinePage[] {
	const { requestedThroughSession, analyzedLines } = snapshot;

	return analyzedLines.map((line) => ({
		params: { tradingLineId: line.tradingLineId },
		props: { requestedThroughSession, line },
	}));
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
