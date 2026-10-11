import { createFileRoute, notFound } from '@tanstack/react-router';

import { getAnalyzedLine } from '#web/lib/utils/analysis-snapshot.functions.ts';

import { AvailableLineDetails } from './-components/available-line-details.tsx';
import { UnavailableLineDetails } from './-components/unavailable-line-details.tsx';

export const Route = createFileRoute('/lines/$tradingLineId')({
	loader: async ({ params }) => {
		const linePage = await getAnalyzedLine({ data: { tradingLineId: params.tradingLineId } });

		if (!linePage) {
			throw notFound();
		}

		return linePage;
	},
	component: LinePage,
});

function LinePage() {
	const { ranAt, requestedThroughSession, line } = Route.useLoaderData();

	return (
		<main>
			<p>
				<a href="/">All lines</a>
			</p>
			<h1>{line.tradingLineId}</h1>
			<p>Ran at: {ranAt}</p>
			<p>Requested through session: {requestedThroughSession}</p>
			<p>Status: {line.status}</p>
			{line.status === 'available' ? (
				<AvailableLineDetails line={line} />
			) : (
				<UnavailableLineDetails line={line} />
			)}
		</main>
	);
}
