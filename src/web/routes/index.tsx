import { createFileRoute } from '@tanstack/react-router';

import { getAnalyzedLineIndex } from '#web/lib/utils/analysis-snapshot.functions.ts';
import { buildLinePagePath } from '#web/lib/utils/snapshot-pages.ts';

export const Route = createFileRoute('/')({
	loader: () => getAnalyzedLineIndex(),
	component: HomePage,
});

function HomePage() {
	const { ranAt, requestedThroughSession, lineStatuses } = Route.useLoaderData();

	return (
		<main>
			<p>Ran at: {ranAt}</p>
			<p>Requested through session: {requestedThroughSession}</p>
			<ul>
				{lineStatuses.map((line) => (
					<li key={line.tradingLineId}>
						{/* A plain anchor loads the prerendered page; a router `Link` would call the
						    server function from the browser, which a static site cannot answer. */}
						<a href={buildLinePagePath(line.tradingLineId)}>{line.tradingLineId}</a>:{' '}
						{line.status}
					</li>
				))}
			</ul>
		</main>
	);
}
