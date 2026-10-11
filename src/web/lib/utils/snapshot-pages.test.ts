import { describe, expect, test } from 'bun:test';

import { parseAnalysisSnapshotOverview } from '#modules/analysis-run/analysis-snapshot-storage.ts';

import { buildPrerenderPages, requireRenderableSnapshot } from './snapshot-pages.ts';

import type { LatestAnalysisSnapshotReadResult } from '#modules/analysis-run/index.ts';

const availableLine = {
	status: 'available',
	instrumentId: 'ggal',
	tradingLineId: 'ggal-stock-byma-ars',
	latestState: {
		sessionDate: '2026-10-09',
		regime: 'bearish',
		structure: 'downtrend',
		rsi: 33.6,
		priceRelativeToEmaInAtr: -1.39,
	},
	events: [],
};
const unavailableLine = {
	status: 'unavailable',
	instrumentId: 'gfva',
	tradingLineId: 'gfva-stock-byma-ars',
	reason: 'no-provider-bars',
	message: 'The provider returned no Daily Bars for this Trading Line.',
};
const serializedSnapshot = JSON.stringify({
	schemaVersion: 5,
	ranAt: '2026-10-11T14:03:58.608Z',
	requestedThroughSession: '2026-10-10',
	analyzedLines: [availableLine, unavailableLine],
});

describe('buildPrerenderPages', () => {
	test('lists the index and every analyzed line in snapshot order, available or not', () => {
		const snapshot = requireRenderableSnapshot(
			parseAnalysisSnapshotOverview(serializedSnapshot),
		);

		const pages = buildPrerenderPages(snapshot);

		expect(pages).toEqual([
			{ path: '/' },
			{ path: '/lines/ggal-stock-byma-ars' },
			{ path: '/lines/gfva-stock-byma-ars' },
		]);
	});
});

describe('requireRenderableSnapshot', () => {
	test('fails with the read failure when there is no latest snapshot', () => {
		const missingSnapshot: LatestAnalysisSnapshotReadResult = {
			ok: false,
			reason: 'not-found',
			message: 'analysis-snapshots/v5/latest.json does not exist.',
		};

		expect(() => requireRenderableSnapshot(missingSnapshot)).toThrow(
			'No Analysis Snapshot to render: analysis-snapshots/v5/latest.json does not exist.',
		);
	});

	test('fails with the validation message when the snapshot is invalid', () => {
		const invalidSnapshot = serializedSnapshot.replace(
			'"schemaVersion":5',
			'"schemaVersion":4',
		);

		expect(() =>
			requireRenderableSnapshot(parseAnalysisSnapshotOverview(invalidSnapshot)),
		).toThrow(
			'No Analysis Snapshot to render: The snapshot is invalid. schemaVersion: Schema version must be 5.',
		);
	});

	test('fails when the snapshot has no analyzed lines', () => {
		const emptySnapshot = JSON.stringify({
			...JSON.parse(serializedSnapshot),
			analyzedLines: [],
		});

		expect(() =>
			requireRenderableSnapshot(parseAnalysisSnapshotOverview(emptySnapshot)),
		).toThrow('the snapshot has no analyzed lines');
	});
});
