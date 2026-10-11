import { describe, expect, test } from 'bun:test';

import { createBarHistoryReader } from './bar-history-reader.ts';

import type { BarHistory, ValidationIssue } from '../bar-history.types.ts';
import type { BarHistoryStorage, BarHistoryStorageReadResult } from '../storage/index.ts';
import type { BarHistoryReadSuccess, ReadBarHistoriesRequest } from './bar-history-reader.types.ts';

describe('createBarHistoryReader', () => {
	test('returns the complete stored history when no range is requested', async () => {
		const history = createHistory();
		const storage = createFakeStorage({ [history.tradingLineId]: { ok: true, history } });
		const reader = createBarHistoryReader(storage);

		const result = await reader.read({
			tradingLineIds: [history.tradingLineId],
		});

		expect(result).toEqual({
			ok: true,
			results: [
				{
					ok: true,
					tradingLineId: history.tradingLineId,
					source: history.source,
					priceAdjustment: 'none',
					checkedThroughSession: '2026-09-04',
					bars: history.bars,
				},
			],
		});
	});

	test('filters bars with inclusive session-date boundaries without reordering them', async () => {
		const history = createHistory();
		const storage = createFakeStorage({ [history.tradingLineId]: { ok: true, history } });
		const reader = createBarHistoryReader(storage);

		const result = await reader.read({
			tradingLineIds: [history.tradingLineId],
			range: { start: '2026-09-03', end: '2026-09-04' },
		});

		expect(result).toMatchObject({
			ok: true,
			results: [
				{
					ok: true,
					bars: [history.bars[1], history.bars[2]],
				},
			],
		});
	});

	test('returns an empty successful range with the line freshness', async () => {
		const history = createHistory();
		const storage = createFakeStorage({ [history.tradingLineId]: { ok: true, history } });
		const reader = createBarHistoryReader(storage);

		const result = await reader.read({
			tradingLineIds: [history.tradingLineId],
			range: { start: '2026-08-01', end: '2026-08-31' },
		});

		expect(result).toMatchObject({
			ok: true,
			results: [
				{
					ok: true,
					checkedThroughSession: '2026-09-04',
					bars: [],
				},
			],
		});
	});

	test('preserves every unique line result when storage succeeds and fails differently', async () => {
		const aaplHistory = createHistory();
		const msftHistory = createHistory({
			tradingLineId: 'cedear-msft-ars',
			checkedThroughSession: '2026-09-03',
		});
		const invalidHistoryIssue = createIssue(
			'invalid-value',
			'history.bars',
			'Stored bars are invalid.',
		);
		const missingHistory = createFailure('not-found', 'No stored Bar History exists.');
		const unreadableHistory = createFailure('unreadable', 'The bucket is unavailable.');
		const invalidHistory = createFailure(
			'invalid-stored-history',
			'The stored Bar History is invalid.',
			[invalidHistoryIssue],
		);
		const storage = createFakeStorage({
			[aaplHistory.tradingLineId]: { ok: true, history: aaplHistory },
			[msftHistory.tradingLineId]: { ok: true, history: msftHistory },
			'cedear-nvda-ars': missingHistory,
			'cedear-googl-ars': unreadableHistory,
			'cedear-amzn-ars': invalidHistory,
		});
		const reader = createBarHistoryReader(storage);

		const result = await reader.read({
			tradingLineIds: [
				aaplHistory.tradingLineId,
				'cedear-nvda-ars',
				msftHistory.tradingLineId,
				'cedear-googl-ars',
				'cedear-amzn-ars',
			],
			range: null,
		});

		expect(result).toEqual({
			ok: true,
			results: [
				createSuccessfulResult(aaplHistory),
				{ tradingLineId: 'cedear-nvda-ars', ...missingHistory },
				createSuccessfulResult(msftHistory),
				{ tradingLineId: 'cedear-googl-ars', ...unreadableHistory },
				{ tradingLineId: 'cedear-amzn-ars', ...invalidHistory },
			],
		});
	});

	test('silently deduplicates identifiers and reads each stored history once', async () => {
		const aaplHistory = createHistory();
		const msftHistory = createHistory({ tradingLineId: 'cedear-msft-ars' });
		const storage = createFakeStorage({
			[aaplHistory.tradingLineId]: { ok: true, history: aaplHistory },
			[msftHistory.tradingLineId]: { ok: true, history: msftHistory },
		});
		const reader = createBarHistoryReader(storage);

		const result = await reader.read({
			tradingLineIds: [
				aaplHistory.tradingLineId,
				msftHistory.tradingLineId,
				aaplHistory.tradingLineId,
			],
			range: null,
		});

		expect(result).toMatchObject({
			ok: true,
			results: [
				{ tradingLineId: aaplHistory.tradingLineId },
				{ tradingLineId: msftHistory.tradingLineId },
			],
		});
		expect(storage.readCalls).toEqual([aaplHistory.tradingLineId, msftHistory.tradingLineId]);
	});

	test('accepts an empty request without reading storage', async () => {
		const storage = createFakeStorage({});
		const reader = createBarHistoryReader(storage);

		const result = await reader.read({ tradingLineIds: [], range: null });

		expect(result).toEqual({ ok: true, results: [] });
		expect(storage.readCalls).toEqual([]);
	});

	test('rejects blank IDs, impossible dates, and reversed ranges before any storage read', async () => {
		const storage = createFakeStorage({});
		const reader = createBarHistoryReader(storage);

		const blankIdResult = await reader.read({ tradingLineIds: ['   '], range: null });
		const invalidDateResult = await reader.read({
			tradingLineIds: ['cedear-aapl-ars'],
			range: { start: '2026-02-30', end: '2026-03-01' },
		});
		const reversedRangeResult = await reader.read({
			tradingLineIds: ['cedear-aapl-ars'],
			range: { start: '2026-09-04', end: '2026-09-03' },
		});

		expect(blankIdResult).toMatchObject({
			ok: false,
			reason: 'invalid-request',
			issues: [{ code: 'invalid-value', path: 'tradingLineIds[0]' }],
		});
		expect(invalidDateResult).toMatchObject({
			ok: false,
			reason: 'invalid-request',
			issues: [{ code: 'invalid-date', path: 'range.start' }],
		});
		expect(reversedRangeResult).toMatchObject({
			ok: false,
			reason: 'invalid-request',
			issues: [{ code: 'invalid-value', path: 'range' }],
		});
		expect(storage.readCalls).toEqual([]);
	});

	test('rejects malformed runtime request shapes before any storage read', async () => {
		const storage = createFakeStorage({});
		const reader = createBarHistoryReader(storage);

		const nonObjectResult = await readMalformedRequest(reader, null);
		const nonArrayIdsResult = await readMalformedRequest(reader, {
			tradingLineIds: 'cedear-aapl-ars',
		});
		const nonStringIdResult = await readMalformedRequest(reader, {
			tradingLineIds: ['cedear-aapl-ars', 1],
		});
		const malformedRangeResult = await readMalformedRequest(reader, {
			tradingLineIds: ['cedear-aapl-ars'],
			range: '2026-09-04',
		});

		expect(nonObjectResult).toMatchObject({
			ok: false,
			reason: 'invalid-request',
			issues: [{ code: 'invalid-type', path: 'request' }],
		});
		expect(nonArrayIdsResult).toMatchObject({
			ok: false,
			reason: 'invalid-request',
			issues: [{ code: 'invalid-type', path: 'tradingLineIds' }],
		});
		expect(nonStringIdResult).toMatchObject({
			ok: false,
			reason: 'invalid-request',
			issues: [{ code: 'invalid-type', path: 'tradingLineIds[1]' }],
		});
		expect(malformedRangeResult).toMatchObject({
			ok: false,
			reason: 'invalid-request',
			issues: [{ code: 'invalid-type', path: 'range' }],
		});
		expect(storage.readCalls).toEqual([]);
	});
});

function readMalformedRequest(reader: ReturnType<typeof createBarHistoryReader>, request: unknown) {
	return reader.read(request as ReadBarHistoriesRequest);
}

function createHistory(overrides: Partial<BarHistory> = {}): BarHistory {
	return {
		schemaVersion: 1,
		tradingLineId: 'cedear-aapl-ars',
		source: { provider: 'open-bymadata', symbol: 'AAPLD' },
		priceAdjustment: 'none',
		backfilledAt: '2026-09-05T21:10:00Z',
		lastReconciledAt: null,
		checkedThroughSession: '2026-09-04',
		bars: [
			createDailyBar('2026-09-02', 100),
			createDailyBar('2026-09-03', 101),
			createDailyBar('2026-09-04', 102),
		],
		...overrides,
	};
}

function createDailyBar(sessionDate: string, close: number) {
	return {
		sessionDate,
		open: close - 1,
		high: close + 1,
		low: close - 2,
		close,
		volume: 1_000,
	};
}

function createSuccessfulResult(history: BarHistory): BarHistoryReadSuccess {
	return {
		ok: true,
		tradingLineId: history.tradingLineId,
		source: history.source,
		priceAdjustment: history.priceAdjustment,
		checkedThroughSession: history.checkedThroughSession,
		bars: history.bars,
	};
}

function createFailure(
	reason: 'invalid-stored-history' | 'not-found' | 'unreadable',
	message: string,
	issues: readonly ValidationIssue[] = [],
): Exclude<BarHistoryStorageReadResult, { ok: true }> {
	return { ok: false, reason, message, issues };
}

type FakeStorage = BarHistoryStorage &
	Readonly<{
		responses: Readonly<Record<string, BarHistoryStorageReadResult>>;
		readCalls: string[];
	}>;

function createFakeStorage(
	responses: Readonly<Record<string, BarHistoryStorageReadResult>>,
): FakeStorage {
	const readCalls: string[] = [];

	return {
		read: async (tradingLineId) => {
			readCalls.push(tradingLineId);
			return (
				responses[tradingLineId] ??
				createFailure('not-found', 'No stored Bar History exists.')
			);
		},
		write: async () => ({
			ok: false,
			reason: 'write-failed',
			message: 'Writes are not used by the reader.',
			issues: [],
		}),
		responses,
		readCalls,
	};
}

function createIssue(
	code: ValidationIssue['code'],
	path: string,
	message: string,
): ValidationIssue {
	return { code, path, message };
}
