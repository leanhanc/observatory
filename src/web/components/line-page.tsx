import { AvailableLineDetails } from './available-line-details.tsx';
import { UnavailableLineDetails } from './unavailable-line-details.tsx';

import type { LinePageProps } from '#web/lib/utils/snapshot-pages.ts';

export function LinePage({ ranAt, requestedThroughSession, line }: LinePageProps) {
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
