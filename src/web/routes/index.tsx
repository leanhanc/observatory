import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

import { readLatestAnalysisSnapshot } from '#web/lib/utils/latest-analysis-snapshot.server.ts';

const getLatestAnalysisSnapshot = createServerFn({ method: 'GET' }).handler(() =>
	readLatestAnalysisSnapshot(),
);

export const Route = createFileRoute('/')({
	loader: () => getLatestAnalysisSnapshot(),
	component: HomePage,
});

function HomePage() {
	const readResult = Route.useLoaderData();

	if (!readResult.ok) {
		return <p>No snapshot available.</p>;
	}

	const { ranAt, requestedThroughSession, analyzedLines } = readResult.snapshot;

	return (
		<main>
			<p>Ran at: {ranAt}</p>
			<p>Requested through session: {requestedThroughSession}</p>
			<ul>
				{analyzedLines.map((line) => (
					<li key={line.tradingLineId}>
						{line.tradingLineId}: {line.status}
					</li>
				))}
			</ul>
		</main>
	);
}
