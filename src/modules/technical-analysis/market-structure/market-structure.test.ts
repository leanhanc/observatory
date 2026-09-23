import { describe, expect, test } from 'bun:test';

import { loadNflxFixture } from '../tests/support/index.ts';
import { calculateMarketStructure } from './index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';

const risingCloses = [
	10, 12, 14, 16, 20, 17, 14, 11, 8, 12, 16, 20, 24, 20, 16, 13, 10, 14, 18, 21, 22,
];

describe('calculateMarketStructure', () => {
	test('returns one undefined result per short session and no result for empty input', () => {
		expect(calculateMarketStructure([])).toEqual([]);

		for (let length = 1; length < 7; length += 1) {
			const bars = createBars(risingCloses.slice(0, length));
			const sessions = calculateMarketStructure(bars);

			expect(sessions).toHaveLength(length);
			expect(sessions.map((session) => session.sessionDate)).toEqual(
				bars.map((bar) => bar.sessionDate),
			);
			expect(sessions.every((session) => session.structure === 'undefined')).toBe(true);
			expect(sessions.every((session) => session.newlyConfirmedSwings.length === 0)).toBe(
				true,
			);
		}
	});

	test('first reveals a swing exactly three completed bars after its occurrence', () => {
		const bars = createBars([10, 11, 12, 13, 20, 13, 12, 11, 10]);
		const sessions = calculateMarketStructure(bars);
		const peak = {
			kind: 'high' as const,
			price: 20,
			occurredAtSession: bars[4]!.sessionDate,
			confirmedAtSession: bars[7]!.sessionDate,
		};

		expect(
			sessions.slice(0, 7).every((session) => session.newlyConfirmedSwings.length === 0),
		).toBe(true);
		expect(sessions[7]?.newlyConfirmedSwings).toEqual([peak]);
		expect(sessions[7]?.structure).toBe('undefined');
	});

	test('matches every replayed prefix, including the confirmation and expiry sessions', () => {
		const bars = createBars([...risingCloses.slice(0, 20), 24, 10, 8, 9]);
		const full = calculateMarketStructure(bars);

		for (let length = 1; length <= bars.length; length += 1) {
			const prefix = calculateMarketStructure(bars.slice(0, length));
			expect(prefix.at(-1)).toEqual(full[length - 1]);
		}
	});

	test('classifies the historical rising and falling controlled shapes', () => {
		const rising = calculateMarketStructure(createBars(risingCloses));
		const fallingCloses = risingCloses.map((close) => 40 - close);
		const falling = calculateMarketStructure(createBars(fallingCloses));

		expect(rising[18]?.structure).toBe('undefined');
		expect(rising[19]?.structure).toBe('uptrend');
		expect(falling[18]?.structure).toBe('undefined');
		expect(falling[19]?.structure).toBe('downtrend');
	});

	test('uses range for conflicting or equal confirmed pairs', () => {
		const conflictingCloses = [...risingCloses];
		conflictingCloses[16] = 6;

		const equalHighCloses = [
			10, 12, 14, 16, 20, 17, 14, 11, 8, 11, 14, 17, 20, 17, 14, 12, 10, 13, 16, 18, 19,
		];

		const equalLowCloses = [...risingCloses];
		equalLowCloses[16] = 8;

		expect(calculateMarketStructure(createBars(conflictingCloses))[19]?.structure).toBe(
			'range',
		);
		expect(calculateMarketStructure(createBars(equalHighCloses))[19]?.structure).toBe('range');
		expect(calculateMarketStructure(createBars(equalLowCloses))[19]?.structure).toBe('range');
	});

	test('does not create swings from ties, plateaus, or a flat history', () => {
		const plateau = calculateMarketStructure(createBars([10, 11, 12, 20, 20, 12, 11, 10]));
		const flat = calculateMarketStructure(createBars(Array(16).fill(10)));

		expect(plateau.every((session) => session.newlyConfirmedSwings.length === 0)).toBe(true);
		expect(flat.every((session) => session.newlyConfirmedSwings.length === 0)).toBe(true);
		expect(flat.every((session) => session.structure === 'undefined')).toBe(true);
	});

	test('checks the third bar on either side of a candidate', () => {
		const earlierRival = calculateMarketStructure(createBars([20, 10, 11, 19, 12, 11, 10]));
		const laterRival = calculateMarketStructure(createBars([10, 11, 12, 19, 11, 10, 20]));

		expect(earlierRival[6]?.newlyConfirmedSwings.some((swing) => swing.kind === 'high')).toBe(
			false,
		);
		expect(laterRival[6]?.newlyConfirmedSwings.some((swing) => swing.kind === 'high')).toBe(
			false,
		);
	});

	test('can confirm an outside bar as both a swing high and a swing low', () => {
		const highs = [11, 11, 11, 20, 11, 11, 11];
		const lows = [9, 9, 9, 1, 9, 9, 9];
		const bars = createBars(Array(7).fill(10), highs, lows);
		const sessions = calculateMarketStructure(bars);

		expect(sessions[6]?.newlyConfirmedSwings).toEqual([
			{
				kind: 'high',
				price: 20,
				occurredAtSession: bars[3]!.sessionDate,
				confirmedAtSession: bars[6]!.sessionDate,
			},
			{
				kind: 'low',
				price: 1,
				occurredAtSession: bars[3]!.sessionDate,
				confirmedAtSession: bars[6]!.sessionDate,
			},
		]);
	});

	test('compares latest highs and lows independently without requiring alternation', () => {
		const highs = Array(34).fill(20);
		const lows = Array.from({ length: 34 }, (_, index) => 10 + index / 10);
		highs[20] = 40;
		highs[28] = 50;
		lows[4] = 2;
		lows[12] = 4;

		const closes = highs.map((high, index) => (high + lows[index]!) / 2);
		const sessions = calculateMarketStructure(createBars(closes, highs, lows));
		const allSwings = sessions.flatMap((session) => session.newlyConfirmedSwings);

		expect(allSwings.map((swing) => swing.kind)).toEqual(['low', 'low', 'high', 'high']);
		expect(sessions[30]?.structure).toBe('undefined');
		expect(sessions[31]?.structure).toBe('uptrend');
	});

	test('keeps an invalidated downtrend undefined until new swing evidence arrives', () => {
		const fallingCloses = risingCloses.slice(0, 20).map((close) => 40 - close);
		const firstBars = createBars(fallingCloses);
		const laterBars = createBars([35, 28, 25, 20], [35, 28, 25, 20], [18, 20, 21, 22], 20);
		const sessions = calculateMarketStructure([...firstBars, ...laterBars]);

		expect(sessions[19]?.structure).toBe('downtrend');
		expect(sessions[20]?.structure).toBe('undefined');
		expect(sessions[20]?.newlyConfirmedSwings).toEqual([]);
		expect(sessions[21]?.structure).toBe('undefined');
		expect(sessions[22]?.structure).toBe('undefined');
		expect(sessions[23]?.newlyConfirmedSwings).toHaveLength(2);
		expect(sessions[23]?.structure).toBe('uptrend');
	});

	test('expires an uptrend only when close falls strictly below its defining low', () => {
		const bars = createBars([...risingCloses.slice(0, 20), 9, 15]);
		const sessions = calculateMarketStructure(bars);

		expect(sessions[19]?.structure).toBe('uptrend');
		expect(sessions[20]?.newlyConfirmedSwings).toEqual([]);
		expect(sessions[20]?.structure).toBe('undefined');
		expect(sessions[21]?.newlyConfirmedSwings).toEqual([]);
		expect(sessions[21]?.structure).toBe('undefined');
	});

	test('does not expire either trend when close equals its defining swing', () => {
		const uptrendBars = createBars([...risingCloses.slice(0, 20), 10]);
		const downtrendCloses = risingCloses.slice(0, 20).map((close) => 40 - close);
		const downtrendBars = createBars([...downtrendCloses, 30]);

		expect(calculateMarketStructure(uptrendBars)[20]?.structure).toBe('uptrend');
		expect(calculateMarketStructure(downtrendBars)[20]?.structure).toBe('downtrend');
	});

	test('does not mutate input bars', () => {
		const bars = Object.freeze(createBars(risingCloses).map((bar) => Object.freeze(bar)));
		const original = structuredClone(bars);

		expect(() => calculateMarketStructure(bars)).not.toThrow();
		expect(bars).toEqual(original);
	});

	test('tracks a known confirmed low in the NFLX fixture', async () => {
		const bars = await loadNflxFixture();
		const sessions = calculateMarketStructure(bars);
		const confirmation = sessions.find((session) => session.sessionDate === '2024-09-16');

		expect(sessions).toHaveLength(bars.length);
		expect(confirmation?.newlyConfirmedSwings).toContainEqual({
			kind: 'low',
			price: 66.08,
			occurredAtSession: '2024-09-11',
			confirmedAtSession: '2024-09-16',
		});
	});
});

function createBars(
	closes: readonly number[],
	highs: readonly number[] = closes,
	lows: readonly number[] = closes,
	startIndex = 0,
): readonly DailyBar[] {
	return closes.map((close, offset) => ({
		sessionDate: new Date(Date.UTC(2026, 0, startIndex + offset + 1))
			.toISOString()
			.slice(0, 10),
		open: close,
		high: highs[offset]!,
		low: lows[offset]!,
		close,
		volume: 1,
	}));
}
