import { describe, expect, test } from 'bun:test';

import { parseAnalysisSnapshotOverview } from '#modules/analysis-run/analysis-snapshot-storage.ts';

import { buildLinePages, requireRenderableSnapshot } from './snapshot-pages.ts';

import type { LatestAnalysisSnapshotReadResult } from '#modules/analysis-run/index.ts';

const availableLine = {
	status: 'available',
	instrumentId: 'ggal',
	tradingLineId: 'ggal-stock-byma-ars',
	latestState: {
		sessionDate: '2026-10-09',
		regime: 'bearish',
		pendingRegimeTransition: null,
		structure: 'downtrend',
		lastConfirmedSwingHigh: {
			kind: 'high',
			price: 7.5,
			occurredAtSession: '2026-09-01',
			confirmedAtSession: '2026-09-04',
			priceRelativeToSwingInPercent: -5,
		},
		lastConfirmedSwingLow: null,
		rsi: 33.6,
		priceRelativeToEmaInAtr: -1.39,
		priceRelativeToLongTermEmaInPercent: -4.2,
	},
	pesoEquivalents: {
		sessionDate: '2026-10-09',
		mepRate: 1500,
		close: 10_687.5,
		lastConfirmedSwingHigh: 11_250,
		lastConfirmedSwingLow: null,
	},
	events: [],
} as const;
const unavailableLine = {
	status: 'unavailable',
	instrumentId: 'gfva',
	tradingLineId: 'gfva-stock-byma-ars',
	reason: 'no-provider-bars',
	message: 'The provider returned no Daily Bars for this Trading Line.',
} as const;
const serializedSnapshot = JSON.stringify({
	schemaVersion: 7,
	priceUnit: 'mep-dollar',
	ranAt: '2026-10-11T14:03:58.608Z',
	requestedThroughSession: '2026-10-10',
	analyzedLines: [availableLine, unavailableLine],
});

describe('buildLinePages', () => {
	test('lists every analyzed line in snapshot order, available or not, with the run it belongs to', () => {
		const snapshot = requireRenderableSnapshot(
			parseAnalysisSnapshotOverview(serializedSnapshot),
		);

		const pages = buildLinePages(snapshot);

		const run = {
			ranAt: '2026-10-11T14:03:58.608Z',
			requestedThroughSession: '2026-10-10',
			priceUnit: 'mep-dollar',
		} as const;
		expect(pages).toEqual([
			{
				params: { tradingLineId: 'ggal-stock-byma-ars' },
				props: { ...run, line: availableLine },
			},
			{
				params: { tradingLineId: 'gfva-stock-byma-ars' },
				props: { ...run, line: unavailableLine },
			},
		]);
	});
});

describe('requireRenderableSnapshot', () => {
	test('fails with the read failure when there is no latest snapshot', () => {
		const missingSnapshot: LatestAnalysisSnapshotReadResult = {
			ok: false,
			reason: 'not-found',
			message: 'analysis-snapshots/v7/latest.json does not exist.',
		};

		expect(() => requireRenderableSnapshot(missingSnapshot)).toThrow(
			'No Analysis Snapshot to render: analysis-snapshots/v7/latest.json does not exist.',
		);
	});

	test('fails with the validation message when the snapshot is invalid', () => {
		const invalidSnapshot = serializedSnapshot.replace(
			'"schemaVersion":7',
			'"schemaVersion":6',
		);

		expect(() =>
			requireRenderableSnapshot(parseAnalysisSnapshotOverview(invalidSnapshot)),
		).toThrow(
			'No Analysis Snapshot to render: The snapshot is invalid. schemaVersion: Schema version must be 7.',
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
