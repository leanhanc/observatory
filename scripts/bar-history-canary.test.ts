import { describe, expect, test } from 'bun:test';

import { resolveCanaryInvocation, selectCanaryMode } from './bar-history-canary.ts';

import type { BarHistory } from '#modules/bar-history/index.ts';

const REQUESTED_THROUGH_SESSION = '2026-09-08';
const environment = {
	OBSERVATORY_STORAGE_ACCESS_KEY_ID: 'access-key',
	OBSERVATORY_STORAGE_SECRET_ACCESS_KEY: 'secret-key',
	OBSERVATORY_STORAGE_BUCKET: 'history-bars',
	OBSERVATORY_STORAGE_ENDPOINT: 'https://storage.example.test',
	OBSERVATORY_STORAGE_REGION: 'iad',
	OBSERVATORY_STORAGE_VIRTUAL_HOSTED_STYLE: 'false',
};

describe('Bar History canary', () => {
	test('requires an explicit real session and complete storage configuration', () => {
		expect(() => resolveCanaryInvocation([], environment)).toThrow(
			'--through-session must be a real YYYY-MM-DD date.',
		);
		expect(() =>
			resolveCanaryInvocation(['--through-session', '2026-02-30'], environment),
		).toThrow('--through-session must be a real YYYY-MM-DD date.');
		expect(() =>
			resolveCanaryInvocation(['--through-session', REQUESTED_THROUGH_SESSION], {}),
		).toThrow('Missing storage configuration');
	});

	test('resolves the explicit Railway-compatible storage configuration', () => {
		const invocation = resolveCanaryInvocation(
			['--through-session', REQUESTED_THROUGH_SESSION],
			environment,
		);

		expect(invocation).toEqual({
			requestedThroughSession: REQUESTED_THROUGH_SESSION,
			configuration: {
				accessKeyId: 'access-key',
				secretAccessKey: 'secret-key',
				bucket: 'history-bars',
				endpoint: 'https://storage.example.test',
				region: 'iad',
				virtualHostedStyle: false,
			},
		});
	});

	test('selects backfill, refresh, or verification from stored progress', () => {
		expect(selectCanaryMode(null, REQUESTED_THROUGH_SESSION)).toBe('initial-backfill');
		expect(selectCanaryMode(createHistory('2026-09-07'), REQUESTED_THROUGH_SESSION)).toBe(
			'refresh',
		);
		expect(
			selectCanaryMode(createHistory(REQUESTED_THROUGH_SESSION), REQUESTED_THROUGH_SESSION),
		).toBe('verified');
		expect(() =>
			selectCanaryMode(createHistory('2026-09-09'), REQUESTED_THROUGH_SESSION),
		).toThrow('already checked beyond');
	});
});

function createHistory(checkedThroughSession: string): BarHistory {
	return {
		schemaVersion: 1,
		tradingLineId: 'cedear-aapl-ars',
		source: { provider: 'open-bymadata', symbol: 'AAPL 24HS' },
		priceAdjustment: 'none',
		backfilledAt: '2026-09-09T03:10:00Z',
		lastReconciledAt: null,
		checkedThroughSession,
		bars: [],
	};
}
