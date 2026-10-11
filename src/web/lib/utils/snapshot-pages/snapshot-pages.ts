import type {
	AnalysisSnapshotOverview,
	LatestAnalysisSnapshotReadResult,
} from '#modules/analysis-run/index.ts';
import type { SnapshotLine, SnapshotPriceUnit } from './snapshot-pages.types.ts';

export type LinePage = Readonly<{
	params: { tradingLineId: string };
	props: LinePageProps;
}>;

export type LinePageProps = Readonly<{
	ranAt: string;
	requestedThroughSession: string;
	priceUnit: SnapshotPriceUnit;
	line: SnapshotLine;
}>;

export function buildLinePagePath(tradingLineId: string): string {
	return `/lines/${encodeURIComponent(tradingLineId)}`;
}

/** The line pages a build prerenders: one per analyzed line, available or not, in snapshot order. */
export function buildLinePages(snapshot: AnalysisSnapshotOverview): LinePage[] {
	const { ranAt, requestedThroughSession, priceUnit, analyzedLines } = snapshot;

	return analyzedLines.map((line) => ({
		params: { tradingLineId: line.tradingLineId },
		props: { ranAt, requestedThroughSession, priceUnit, line },
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
