import { createServerFn } from '@tanstack/react-start';

import { readLatestAnalysisSnapshot } from './latest-analysis-snapshot.server.ts';

// Returns only what the index lists, so the page does not embed every line's State and Events.
export const getAnalyzedLineIndex = createServerFn({ method: 'GET' }).handler(async () => {
	const { ranAt, requestedThroughSession, analyzedLines } = await readLatestAnalysisSnapshot();
	const lineStatuses = analyzedLines.map(({ tradingLineId, status }) => ({
		tradingLineId,
		status,
	}));

	return { ranAt, requestedThroughSession, lineStatuses };
});

// Returns `null` for a line the snapshot does not have, which the route renders as not found.
export const getAnalyzedLine = createServerFn({ method: 'GET' })
	.validator((data: { tradingLineId: string }) => data)
	.handler(async ({ data }) => {
		const { ranAt, requestedThroughSession, analyzedLines } =
			await readLatestAnalysisSnapshot();
		const line = analyzedLines.find(
			({ tradingLineId }) => tradingLineId === data.tradingLineId,
		);

		if (!line) {
			return null;
		}

		return { ranAt, requestedThroughSession, line };
	});
