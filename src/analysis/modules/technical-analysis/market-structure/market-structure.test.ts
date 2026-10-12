import { describe, expect, test } from 'bun:test';

import { detectStructureBreakEvents } from '../structure-break/index.ts';
import { buildBars, loadGgalFixture } from '../tests/support/index.ts';
import { calculateMarketStructure, trackLatestConfirmedSwings } from './index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';

const risingCloses = [
	10, 12, 14, 16, 20, 17, 14, 11, 8, 12, 16, 20, 24, 20, 16, 13, 10, 14, 18, 21, 22,
];

// Higher highs (20 → 24) with lower lows (8 → 6): a range from position 19, between the confirmed
// low of 6 and the confirmed high of 24.
const rangeCloses = risingCloses.map((close, index) => (index === 16 ? 6 : close));

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
		expect(rising.slice(0, 19).every((session) => !session.hasSwingPairs)).toBe(true);
		expect(rising[19]?.hasSwingPairs).toBe(true);
		expect(falling[18]?.structure).toBe('undefined');
		expect(falling[19]?.structure).toBe('downtrend');
	});

	test('uses range for conflicting or equal confirmed pairs', () => {
		const equalHighCloses = [
			10, 12, 14, 16, 20, 17, 14, 11, 8, 11, 14, 17, 20, 17, 14, 12, 10, 13, 16, 18, 19,
		];

		const equalLowCloses = [...risingCloses];
		equalLowCloses[16] = 8;

		expect(calculateMarketStructure(createBars(rangeCloses))[19]?.structure).toBe('range');
		expect(calculateMarketStructure(createBars(equalHighCloses))[19]?.structure).toBe('range');
		expect(calculateMarketStructure(createBars(equalLowCloses))[19]?.structure).toBe('range');
	});

	test('confirms one swing at the last bar of a plateau and none in a flat history', () => {
		const plateauBars = createBars([10, 11, 12, 20, 20, 12, 11, 10]);
		const plateau = calculateMarketStructure(plateauBars);
		const flat = calculateMarketStructure(createBars(Array(16).fill(10)));

		expect(
			plateau.slice(0, 7).every((session) => session.newlyConfirmedSwings.length === 0),
		).toBe(true);
		expect(plateau[7]?.newlyConfirmedSwings).toEqual([
			{
				kind: 'high',
				price: 20,
				occurredAtSession: plateauBars[4]!.sessionDate,
				confirmedAtSession: plateauBars[7]!.sessionDate,
			},
		]);
		expect(flat.every((session) => session.newlyConfirmedSwings.length === 0)).toBe(true);
		expect(flat.every((session) => session.structure === 'undefined')).toBe(true);
	});

	test('confirms one swing for equal lows separated by a higher bar', () => {
		const closes = [20, 19, 18, 10, 12, 10, 18, 19, 20];
		const bars = createBars(closes);
		const lows = calculateMarketStructure(bars)
			.flatMap((session) => session.newlyConfirmedSwings)
			.filter((swing) => swing.kind === 'low');

		expect(lows).toEqual([
			{
				kind: 'low',
				price: 10,
				occurredAtSession: bars[5]!.sessionDate,
				confirmedAtSession: bars[8]!.sessionDate,
			},
		]);
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
		expect(sessions[30]?.hasSwingPairs).toBe(false);
		expect(sessions[31]?.structure).toBe('uptrend');
		expect(sessions[31]?.hasSwingPairs).toBe(true);
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
		expect(sessions.slice(19).every((session) => session.hasSwingPairs)).toBe(true);
	});

	test('does not expire either trend when close equals its defining swing', () => {
		const uptrendBars = createBars([...risingCloses.slice(0, 20), 10]);
		const downtrendCloses = risingCloses.slice(0, 20).map((close) => 40 - close);
		const downtrendBars = createBars([...downtrendCloses, 30]);

		expect(calculateMarketStructure(uptrendBars)[20]?.structure).toBe('uptrend');
		expect(calculateMarketStructure(downtrendBars)[20]?.structure).toBe('downtrend');
	});

	test('holds a range while the close stays within its confirmed levels, inclusive', () => {
		const touchesHigh = calculateMarketStructure(createBars([...rangeCloses, 23, 24]));
		const touchesLow = calculateMarketStructure(createBars([...rangeCloses, 6]));

		expect(touchesHigh.slice(19).map((session) => session.structure)).toEqual(
			Array(4).fill('range'),
		);
		expect(touchesLow[21]?.structure).toBe('range');
	});

	test('expires a range on a close strictly above its high until a new swing confirms', () => {
		// The close of 25 leaves the range above its high of 24 and comes back inside; the swing
		// high of 25 then confirms at position 26, its pairs still disagree and the close of 20 is
		// within 6 and 25.
		const sessions = calculateMarketStructure(
			createBars([...rangeCloses, 23, 24, 25, 22, 21, 20]),
		);

		expect(sessions[22]?.structure).toBe('range');
		expect(sessions[23]?.structure).toBe('undefined');
		expect(sessions[24]?.structure).toBe('undefined');
		expect(sessions[25]?.structure).toBe('undefined');
		expect(sessions[25]?.newlyConfirmedSwings).toEqual([]);
		expect(sessions[26]?.newlyConfirmedSwings).toMatchObject([{ kind: 'high', price: 25 }]);
		expect(sessions[26]?.structure).toBe('range');
		expect(sessions.slice(19).every((session) => session.hasSwingPairs)).toBe(true);
	});

	test('expires a range on a close strictly below its low', () => {
		const sessions = calculateMarketStructure(createBars([...rangeCloses, 6, 5]));

		expect(sessions[21]?.structure).toBe('range');
		expect(sessions[22]?.newlyConfirmedSwings).toEqual([]);
		expect(sessions[22]?.structure).toBe('undefined');
		expect(sessions[22]?.hasSwingPairs).toBe(true);
	});

	test('does not expire a range on a wick beyond either level', () => {
		const closes = [...rangeCloses, 20];
		const highs = closes.map((close, index) => (index === 21 ? 30 : close));
		const lows = closes.map((close, index) => (index === 21 ? 2 : close));

		expect(calculateMarketStructure(createBars(closes, highs, lows))[21]?.structure).toBe(
			'range',
		);
	});

	test('produces no Structure Break Event when a range expires', () => {
		const bars = createBars([...rangeCloses, 23, 24, 25, 22, 21, 20, 6, 5]);
		const sessions = calculateMarketStructure(bars);

		expect(sessions[23]?.structure).toBe('undefined');
		expect(sessions[28]?.structure).toBe('undefined');
		expect(detectStructureBreakEvents(bars).every((session) => session.event === null)).toBe(
			true,
		);
	});

	test('matches every replayed prefix through a range expiry and its re-entry', () => {
		const bars = createBars([...rangeCloses, 23, 24, 25, 22, 21, 20, 6, 5]);
		const full = calculateMarketStructure(bars);

		for (let length = 1; length <= bars.length; length += 1) {
			const prefix = calculateMarketStructure(bars.slice(0, length));
			expect(prefix.at(-1)).toEqual(full[length - 1]);
		}
	});

	test('keeps GGAL undefined after its September 2026 break while the close falls below the range', async () => {
		// On 2026-09-14 a close of 6840 below the 6870 swing low ends the uptrend. On 2026-09-15 a
		// lower high of 7265 confirms while the lows 6701.958 → 6870 still rise, but the close of
		// 6725 is already below 6870, so no range forms; no swing confirms through 2026-09-30.
		const sessions = calculateMarketStructure(await loadGgalFixture());
		const september = sessions.filter(
			(session) => session.sessionDate >= '2026-09-14' && session.sessionDate <= '2026-09-30',
		);
		const rangeFormation = september.find((session) => session.sessionDate === '2026-09-15');

		expect(september).toHaveLength(13);
		expect(rangeFormation?.newlyConfirmedSwings).toMatchObject([{ kind: 'high', price: 7265 }]);
		expect(september.every((session) => session.structure === 'undefined')).toBe(true);
		expect(september.every((session) => session.hasSwingPairs)).toBe(true);
	});

	test('does not mutate input bars', () => {
		const bars = Object.freeze(createBars(risingCloses).map((bar) => Object.freeze(bar)));
		const original = structuredClone(bars);

		expect(() => calculateMarketStructure(bars)).not.toThrow();
		expect(bars).toEqual(original);
	});

	test('tracks a known confirmed low in the GGAL fixture', async () => {
		const bars = await loadGgalFixture();
		const sessions = calculateMarketStructure(bars);
		const confirmation = sessions.find((session) => session.sessionDate === '2025-02-20');

		expect(sessions).toHaveLength(bars.length);
		expect(confirmation?.newlyConfirmedSwings).toContainEqual({
			kind: 'low',
			price: 6111.182,
			occurredAtSession: '2025-02-17',
			confirmedAtSession: '2025-02-20',
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

describe('trackLatestConfirmedSwings', () => {
	test('holds each kind from its confirmation session and keeps it until the next one', () => {
		// The high of 22 occurs at position 3 and is confirmed at 6; the low of 4 occurs at 9 and is
		// confirmed at 12.
		const bars = buildBars([10, 11, 12, 20, 12, 11, 10, 9, 8, 5, 8, 9, 10]);
		const rows = trackLatestConfirmedSwings(calculateMarketStructure(bars));

		expect(rows.slice(0, 6).every((row) => row.high === null)).toBe(true);
		expect(rows.slice(6).every((row) => row.high?.confirmedAtSession === '2026-01-07')).toBe(
			true,
		);
		expect(rows.slice(0, 12).every((row) => row.low === null)).toBe(true);
		expect(rows[12]!.low).toEqual({
			kind: 'low',
			price: 4,
			occurredAtSession: '2026-01-10',
			confirmedAtSession: '2026-01-13',
		});
	});

	test('replaces a swing exactly on the session that confirms the next one of its kind', async () => {
		const structures = calculateMarketStructure(await loadGgalFixture());
		const rows = trackLatestConfirmedSwings(structures);

		structures.forEach((session, index) => {
			for (const swing of session.newlyConfirmedSwings) {
				expect(rows[index]![swing.kind]).toEqual(swing);
			}
		});
	});
});
