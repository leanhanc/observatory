import { describe, expect, test } from 'bun:test';

import {
	createBarHistoryStorage,
	createBarHistoryStorageFromS3Client,
} from './bar-history-storage.ts';

import type { BarHistory } from '../bar-history.types.ts';
import type { BarHistoryStorageConfiguration } from './bar-history-storage.types.ts';

const configuration: BarHistoryStorageConfiguration = {
	accessKeyId: 'access-key',
	secretAccessKey: 'secret-key',
	bucket: 'observatory-bar-history',
	endpoint: 'https://storage.example.test',
	region: 'sjc',
	virtualHostedStyle: false,
};

describe('createBarHistoryStorage', () => {
	test('creates a storage adapter from explicit Railway-compatible configuration', () => {
		const storage = createBarHistoryStorage(configuration);

		expect(storage).toEqual({ read: expect.any(Function), write: expect.any(Function) });
	});

	test('returns not-found when no object exists for a Trading Line', async () => {
		const client = createFakeS3Client({ exists: false });
		const storage = createStorage(client);

		const result = await storage.read('cedear-aapl-ars');

		expect(result).toEqual({
			ok: false,
			reason: 'not-found',
			message: 'No stored Bar History exists for this Trading Line.',
			issues: [],
		});
	});

	test('returns unreadable when an existing object cannot be read', async () => {
		const client = createFakeS3Client({
			text: () => Promise.reject(new Error('bucket is unavailable')),
		});
		const storage = createStorage(client);

		const result = await storage.read('cedear-aapl-ars');

		expect(result).toMatchObject({ ok: false, reason: 'unreadable', issues: [] });
	});

	test('rejects invalid JSON, invalid envelopes, and mismatched identities', async () => {
		const invalidJsonStorage = createStorage(
			createFakeS3Client({ text: () => Promise.resolve('{') }),
		);
		const invalidEnvelopeStorage = createStorage(
			createFakeS3Client({ text: () => Promise.resolve(JSON.stringify({ bars: [] })) }),
		);
		const mismatchedIdentityStorage = createStorage(
			createFakeS3Client({ text: () => Promise.resolve(JSON.stringify(createHistory())) }),
		);

		const invalidJsonResult = await invalidJsonStorage.read('cedear-aapl-ars');
		const invalidEnvelopeResult = await invalidEnvelopeStorage.read('cedear-aapl-ars');
		const mismatchedIdentityResult = await mismatchedIdentityStorage.read('cedear-msft-ars');

		expect(invalidJsonResult).toMatchObject({ ok: false, reason: 'invalid-stored-history' });
		expect(invalidEnvelopeResult).toMatchObject({
			ok: false,
			reason: 'invalid-stored-history',
		});
		expect(mismatchedIdentityResult).toMatchObject({
			ok: false,
			reason: 'invalid-stored-history',
			issues: [
				{
					code: 'invalid-value',
					path: 'history.tradingLineId',
				},
			],
		});
	});

	test('returns a complete validated stored history', async () => {
		const history = createHistory();
		const client = createFakeS3Client({ text: () => Promise.resolve(JSON.stringify(history)) });
		const storage = createStorage(client);

		const result = await storage.read(history.tradingLineId);

		expect(result).toEqual({ ok: true, history });
	});

	test('rejects an invalid replacement before it writes', async () => {
		const invalidHistory = createHistory({
			bars: [
				{
					sessionDate: '2026-09-02',
					open: 100,
					high: 102,
					low: 99,
					close: 103,
					volume: 1_000,
				},
			],
		});
		const client = createFakeS3Client();
		const storage = createStorage(client);

		const result = await storage.write(invalidHistory);

		expect(result).toMatchObject({ ok: false, reason: 'invalid-history' });
		expect(client.writeCalls).toEqual([]);
	});

	test('replaces one complete history object and makes it available to later reads', async () => {
		const initialHistory = createHistory({ bars: [] });
		const replacementHistory = createHistory();
		const client = createFakeS3Client({
			initialText: JSON.stringify(initialHistory),
		});
		const storage = createStorage(client);

		const writeResult = await storage.write(replacementHistory);
		const readResult = await storage.read(replacementHistory.tradingLineId);

		expect(writeResult).toEqual({ ok: true, history: replacementHistory });
		expect(client.writeCalls).toEqual([
			{
				path: 'cedear-aapl-ars/v1/history.json',
				data: JSON.stringify(replacementHistory),
				options: { type: 'application/json' },
			},
		]);
		expect(readResult).toEqual({ ok: true, history: replacementHistory });
	});

	test('reports failed replacement without claiming that it was stored', async () => {
		const client = createFakeS3Client({
			write: () => Promise.reject(new Error('bucket is unavailable')),
		});
		const storage = createStorage(client);

		const result = await storage.write(createHistory());

		expect(result).toMatchObject({ ok: false, reason: 'write-failed', issues: [] });
	});
});

function createStorage(client: FakeS3Client) {
	return createBarHistoryStorageFromS3Client(client);
}

function createHistory(overrides: Partial<BarHistory> = {}): BarHistory {
	return {
		schemaVersion: 1,
		tradingLineId: 'cedear-aapl-ars',
		source: { provider: 'open-bymadata', symbol: 'AAPL 24HS' },
		priceAdjustment: 'none',
		backfilledAt: '2026-09-03T21:10:00Z',
		lastReconciledAt: null,
		checkedThroughSession: '2026-09-03',
		bars: [
			{
				sessionDate: '2026-09-02',
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

type FakeS3ClientOptions = Readonly<{
	exists?: boolean;
	initialText?: string;
	text?: () => Promise<string>;
	write?: (path: string, data: string, options: Readonly<{ type: string }>) => Promise<number>;
}>;

type FakeS3Client = Readonly<{
	file(path: string): Readonly<{
		exists(): Promise<boolean>;
		text(): Promise<string>;
	}>;
	write(path: string, data: string, options: Readonly<{ type: string }>): Promise<number>;
	writeCalls: Array<{
		path: string;
		data: string;
		options: Readonly<{ type: string }>;
	}>;
}>;

function createFakeS3Client(options: FakeS3ClientOptions = {}): FakeS3Client {
	const storedObjects = new Map<string, string>();
	const writeCalls: Array<{
		path: string;
		data: string;
		options: Readonly<{ type: string }>;
	}> = [];
	if (options.initialText) {
		storedObjects.set('cedear-aapl-ars/v1/history.json', options.initialText);
	}

	const exists = options.exists ?? true;
	const readText =
		options.text ??
		(() => Promise.resolve(storedObjects.get('cedear-aapl-ars/v1/history.json') ?? ''));
	const write =
		options.write ??
		((path: string, data: string) => {
			storedObjects.set(path, data);
			return Promise.resolve(data.length);
		});

	return {
		file: () => ({
			exists: () => Promise.resolve(exists),
			text: readText,
		}),
		write: async (path, data, writeOptions) => {
			writeCalls.push({ path, data, options: writeOptions });
			return write(path, data, writeOptions);
		},
		writeCalls,
	};
}
