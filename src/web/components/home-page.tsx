import { buildLinePagePath } from '#web/lib/utils/snapshot-pages/index.ts';

import type { AnalysisSnapshotOverview } from '#modules/analysis-run/index.ts';

export function HomePage({ snapshot }: { snapshot: AnalysisSnapshotOverview }) {
	const { ranAt, requestedThroughSession, analyzedLines } = snapshot;

	return (
		<main>
			<p>Ran at: {ranAt}</p>
			<p>Requested through session: {requestedThroughSession}</p>
			<ul>
				{analyzedLines.map((line) => (
					<li key={line.tradingLineId}>
						<a href={buildLinePagePath(line.tradingLineId)}>{line.tradingLineId}</a>:{' '}
						{line.status}
					</li>
				))}
			</ul>
		</main>
	);
}
