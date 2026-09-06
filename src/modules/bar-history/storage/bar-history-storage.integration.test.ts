import { expect, test } from 'bun:test';

import { createBarHistoryStorage } from './bar-history-storage.ts';

import type { BarHistory } from '../bar-history.types.ts';
import type { BarHistoryStorageConfiguration } from './bar-history-storage.types.ts';

const INTEGRATION_TRADING_LINE_ID = '__integration__';
const integrationConfiguration = resolveIntegrationConfiguration();

if (!integrationConfiguration) {
	test.skip('Railway storage integration requires private bucket credentials.', () => {});
} else {
	test('replaces a complete Bar History object in Railway storage', async () => {
		const storage = createBarHistoryStorage(integrationConfiguration);
		const initialHistory = createHistory({ bars: [] });
		const replacementHistory = createHistory();

		const initialWrite = await storage.write(initialHistory);
		const initialRead = await storage.read(INTEGRATION_TRADING_LINE_ID);
		const replacementWrite = storage.write(replacementHistory);
		const readsDuringReplacement = await Promise.all(
			Array.from({ length: 8 }, () => storage.read(INTEGRATION_TRADING_LINE_ID)),
		);
		const replacementWriteResult = await replacementWrite;
		const replacementRead = await storage.read(INTEGRATION_TRADING_LINE_ID);

		expect(initialWrite).toEqual({ ok: true, history: initialHistory });
		expect(initialRead).toEqual({ ok: true, history: initialHistory });
		expect(replacementWriteResult).toEqual({ ok: true, history: replacementHistory });
		expect(replacementRead).toEqual({ ok: true, history: replacementHistory });

		for (const readResult of readsDuringReplacement) {
			expect(readResult.ok).toBe(true);

			if (!readResult.ok) {
				continue;
			}

			const isInitialHistory = Bun.deepEquals(readResult.history, initialHistory, true);
			const isReplacementHistory = Bun.deepEquals(
				readResult.history,
				replacementHistory,
				true,
			);

			expect(isInitialHistory || isReplacementHistory).toBe(true);
		}
	});
}

function resolveIntegrationConfiguration(): BarHistoryStorageConfiguration | null {
	const accessKeyId = Bun.env.OBSERVATORY_STORAGE_ACCESS_KEY_ID;
	const secretAccessKey = Bun.env.OBSERVATORY_STORAGE_SECRET_ACCESS_KEY;
	const bucket = Bun.env.OBSERVATORY_STORAGE_BUCKET;
	const endpoint = Bun.env.OBSERVATORY_STORAGE_ENDPOINT;
	const region = Bun.env.OBSERVATORY_STORAGE_REGION;
	const virtualHostedStyle = Bun.env.OBSERVATORY_STORAGE_VIRTUAL_HOSTED_STYLE;

	if (
		!accessKeyId ||
		!secretAccessKey ||
		!bucket ||
		!endpoint ||
		!region ||
		!virtualHostedStyle
	) {
		return null;
	}

	return {
		accessKeyId,
		secretAccessKey,
		bucket,
		endpoint,
		region,
		virtualHostedStyle: virtualHostedStyle === 'true',
	};
}

function createHistory(overrides: Partial<BarHistory> = {}): BarHistory {
	return {
		schemaVersion: 1,
		tradingLineId: INTEGRATION_TRADING_LINE_ID,
		source: { provider: 'open-bymadata', symbol: 'INTEGRATION 24HS' },
		priceAdjustment: 'none',
		backfilledAt: '2026-09-06T12:00:00Z',
		lastReconciledAt: null,
		checkedThroughSession: '2026-09-05',
		bars: [
			{
				sessionDate: '2026-09-05',
				open: 100,
				high: 102,
				low: 99,
				close: 101,
				volume: 1_000,
			},
		],
		...overrides,
	};
}
