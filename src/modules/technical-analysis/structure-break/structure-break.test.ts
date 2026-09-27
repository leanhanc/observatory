import { describe, expect, test } from 'bun:test';

import { calculateMarketStructure } from '../market-structure/index.ts';
import { detectStructureBreakEvents } from './index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';

const risingCloses = [
	10, 12, 14, 16, 20, 17, 14, 11, 8, 12, 16, 20, 24, 20, 16, 13, 10, 14, 18, 21,
];

describe('detectStructureBreakEvents', () => {
	test('returns one null Event per short session and no result for empty input', () => {
		expect(detectStructureBreakEvents([])).toEqual([]);

		const bars = createBars(risingCloses.slice(0, 6));
		const sessions = detectStructureBreakEvents(bars);

		expect(sessions).toEqual(
			bars.map((bar) => ({ sessionDate: bar.sessionDate, event: null })),
		);
	});

	test('detects a downward break of an established uptrend', () => {
		const bars = createBars([...risingCloses, 9]).map((bar, index) =>
			index === 20 ? { ...bar, open: 11, high: 11 } : bar,
		);
		const sessions = detectStructureBreakEvents(bars);

		expect(sessions[20]).toEqual({
			sessionDate: bars[20]!.sessionDate,
			event: {
				type: 'structure-break',
				direction: 'downward',
				priorStructure: 'uptrend',
				definingSwing: {
					kind: 'low',
					price: 10,
					occurredAtSession: bars[16]!.sessionDate,
					confirmedAtSession: bars[19]!.sessionDate,
				},
				closePrice: 9,
			},
		});
	});

	test('detects an upward break of an established downtrend', () => {
		const fallingCloses = risingCloses.map((close) => 40 - close);
		const bars = createBars([...fallingCloses, 31]);
		const sessions = detectStructureBreakEvents(bars);

		expect(sessions[20]).toEqual({
			sessionDate: bars[20]!.sessionDate,
			event: {
				type: 'structure-break',
				direction: 'upward',
				priorStructure: 'downtrend',
				definingSwing: {
					kind: 'high',
					price: 30,
					occurredAtSession: bars[16]!.sessionDate,
					confirmedAtSession: bars[19]!.sessionDate,
				},
				closePrice: 31,
			},
		});
	});

	test('does not detect a break when previous Structure is range or undefined', () => {
		const conflictingCloses = [...risingCloses];
		conflictingCloses[16] = 6;
		const rangeBars = createBars([...conflictingCloses, 1]);
		const undefinedBars = createBars([...risingCloses.slice(0, 19), 7]);
		const undefinedStructure = calculateMarketStructure(undefinedBars);

		expect(detectStructureBreakEvents(rangeBars)[20]?.event).toBeNull();
		expect(undefinedStructure[18]?.structure).toBe('undefined');
		expect(
			undefinedStructure
				.slice(0, 19)
				.flatMap((session) => session.newlyConfirmedSwings)
				.some((swing) => swing.kind === 'low'),
		).toBe(true);
		const latestConfirmedLow = undefinedStructure
			.slice(0, 19)
			.flatMap((session) => session.newlyConfirmedSwings)
			.findLast((swing) => swing.kind === 'low')!;
		expect(undefinedBars[18]!.close).toBeGreaterThan(latestConfirmedLow.price);
		expect(undefinedBars[19]!.close).toBeLessThan(latestConfirmedLow.price);

		expect(detectStructureBreakEvents(undefinedBars)[19]?.event).toBeNull();
	});

	test('requires a strict completed close rather than equality or an intraday wick', () => {
		const equalityBars = createBars([...risingCloses, 10]);
		const wickBars = createBars([...risingCloses, 11], undefined, [...risingCloses, 5]);

		expect(detectStructureBreakEvents(equalityBars)[20]?.event).toBeNull();
		expect(detectStructureBreakEvents(wickBars)[20]?.event).toBeNull();
	});

	test('detects a completed gap across the defining swing', () => {
		const bars = createBars([...risingCloses, 9]);
		const gapBar = bars[20]!;

		expect(gapBar.open).toBeLessThan(10);
		expect(gapBar.high).toBeLessThan(10);
		expect(detectStructureBreakEvents(bars)[20]?.event?.direction).toBe('downward');
	});

	test('records a crossing once while later sessions remain beyond the same level', () => {
		const bars = createBars([...risingCloses, 9, 8, 7]);
		const events = detectStructureBreakEvents(bars)
			.map((session) => session.event)
			.filter((event) => event !== null);

		expect(events).toHaveLength(1);
		expect(events[0]?.closePrice).toBe(9);
	});

	test('does not let a newly confirmed swing suppress a break of the prior Structure', () => {
		const highs = [...risingCloses, 9];
		highs[17] = 50;
		const bars = createBars([...risingCloses, 9], highs);
		const structure = calculateMarketStructure(bars);
		const event = detectStructureBreakEvents(bars)[20]?.event;

		expect(structure[20]?.newlyConfirmedSwings).toContainEqual({
			kind: 'high',
			price: 50,
			occurredAtSession: bars[17]!.sessionDate,
			confirmedAtSession: bars[20]!.sessionDate,
		});
		expect(event?.direction).toBe('downward');
		expect(event?.definingSwing).toEqual({
			kind: 'low',
			price: 10,
			occurredAtSession: bars[16]!.sessionDate,
			confirmedAtSession: bars[19]!.sessionDate,
		});
	});

	test('does not retroactively break Structure first established on the current session', () => {
		const closes = Array(20).fill(13);
		const highs = Array(20).fill(15);
		const lows = Array(20).fill(12);
		highs[4] = 20;
		highs[16] = 24;
		lows[8] = 8;
		lows[12] = 10;
		closes[19] = 9;
		lows[19] = 9;
		const bars = createBars(closes, highs, lows);
		const structure = calculateMarketStructure(bars);
		const sessions = detectStructureBreakEvents(bars);

		expect(structure[18]?.structure).toBe('undefined');
		expect(structure[19]?.newlyConfirmedSwings).toContainEqual({
			kind: 'high',
			price: 24,
			occurredAtSession: bars[16]!.sessionDate,
			confirmedAtSession: bars[19]!.sessionDate,
		});
		expect(sessions[19]?.event).toBeNull();
	});

	test('matches every replayed prefix', () => {
		const bars = createBars([...risingCloses, 9, 8, 14, 18]);
		const full = detectStructureBreakEvents(bars);

		for (let length = 1; length <= bars.length; length += 1) {
			const prefix = detectStructureBreakEvents(bars.slice(0, length));
			expect(prefix.at(-1)).toEqual(full[length - 1]);
		}
	});

	test('does not mutate input bars', () => {
		const bars = Object.freeze(createBars(risingCloses).map((bar) => Object.freeze(bar)));
		const original = structuredClone(bars);

		expect(() => detectStructureBreakEvents(bars)).not.toThrow();
		expect(bars).toEqual(original);
	});
});

function createBars(
	closes: readonly number[],
	highs: readonly number[] = closes,
	lows: readonly number[] = closes,
): readonly DailyBar[] {
	return closes.map((close, index) => ({
		sessionDate: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
		open: close,
		high: highs[index]!,
		low: lows[index]!,
		close,
		volume: 1,
	}));
}
