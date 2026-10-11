import { describe, expect, test } from 'bun:test';

import { detectLargeOneSessionMoves } from '../index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';

function closeBars(closes: readonly number[]): DailyBar[] {
	return closes.map((close, index) => ({
		sessionDate: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
		open: close,
		high: close,
		low: close,
		close,
		volume: 1,
	}));
}

describe('detectLargeOneSessionMoves', () => {
	test('returns nothing for empty input or a single bar', () => {
		expect(detectLargeOneSessionMoves([])).toEqual([]);
		expect(detectLargeOneSessionMoves(closeBars([100]))).toEqual([]);
	});

	test('flags a rise of exactly ×1.8', () => {
		expect(detectLargeOneSessionMoves(closeBars([100, 180]))).toEqual([
			{ sessionDate: '2026-01-02', closeRatio: 1.8 },
		]);
	});

	test('flags a fall of exactly ÷1.8 with its ratio below 1', () => {
		expect(detectLargeOneSessionMoves(closeBars([180, 100]))).toEqual([
			{ sessionDate: '2026-01-02', closeRatio: 100 / 180 },
		]);
	});

	test.each([
		['a rise', [100, 179.99]],
		['a fall', [179.99, 100]],
	])('does not flag %s just inside ×1.8', (_, closes) => {
		expect(detectLargeOneSessionMoves(closeBars(closes))).toEqual([]);
	});

	test('compares closes only, not the bar range', () => {
		const bars = closeBars([100, 101]);
		const wideRangeBar = { ...bars[1]!, high: 300, low: 30 };

		expect(detectLargeOneSessionMoves([bars[0]!, wideRangeBar])).toEqual([]);
	});

	test('measures against the previous input bar across a calendar gap', () => {
		const [first, second] = closeBars([100, 200]);
		const afterGap = { ...second!, sessionDate: '2026-01-20' };

		expect(detectLargeOneSessionMoves([first!, afterGap])).toEqual([
			{ sessionDate: '2026-01-20', closeRatio: 2 },
		]);
	});

	test('reads only the session and the previous bar', () => {
		const closes = [100, 400, 50, 100, 200, 210];
		const flaggedSessions = detectLargeOneSessionMoves(closeBars(closes)).map(
			(move) => move.sessionDate,
		);
		const changedEarlierCloses = [1, 1000, 1, 100, 200, 210];
		const flaggedWithChangedHistory = detectLargeOneSessionMoves(
			closeBars(changedEarlierCloses),
		).map((move) => move.sessionDate);

		expect(flaggedSessions).toContain('2026-01-05');
		expect(flaggedWithChangedHistory).toContain('2026-01-05');
		expect(flaggedSessions).not.toContain('2026-01-06');
	});

	test('gives every prefix the same flags as the full history', () => {
		const bars = closeBars([100, 190, 180, 90, 95, 200, 199]);
		const fullFlags = detectLargeOneSessionMoves(bars);

		for (let length = 0; length <= bars.length; length++) {
			const prefix = bars.slice(0, length);
			const lastPrefixSession = prefix.at(-1)?.sessionDate ?? '';
			const expectedFlags = fullFlags.filter((move) => move.sessionDate <= lastPrefixSession);

			expect(detectLargeOneSessionMoves(prefix)).toEqual(expectedFlags);
		}
	});
});
