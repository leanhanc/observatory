import { describe, expect, test } from 'bun:test';

import { calculatePeriodReturns } from './period-returns.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';

// 300 Market Sessions on consecutive calendar days; the anchor is the last one.
const MARKET_SESSIONS = Array.from({ length: 300 }, (_, index) =>
	Temporal.PlainDate.from('2025-01-01').add({ days: index }).toString(),
);
const ANCHOR_POSITION = MARKET_SESSIONS.length - 1;

describe('calculatePeriodReturns', () => {
	test('measures each configured window from the close on its start Market Session', () => {
		const bars = buildBarsOnSessions(MARKET_SESSIONS, (position) => {
			if (position === ANCHOR_POSITION) {
				return 110;
			}
			if (position === ANCHOR_POSITION - 21) {
				return 100;
			}
			if (position === ANCHOR_POSITION - 63) {
				return 220;
			}
			return 55;
		});

		expect(calculatePeriodReturns(bars, MARKET_SESSIONS)).toEqual([
			{
				windowMarketSessions: 21,
				fromSessionDate: MARKET_SESSIONS[ANCHOR_POSITION - 21]!,
				percentChange: 10,
			},
			{
				windowMarketSessions: 63,
				fromSessionDate: MARKET_SESSIONS[ANCHOR_POSITION - 63]!,
				percentChange: -50,
			},
			{
				windowMarketSessions: 252,
				fromSessionDate: MARKET_SESSIONS[ANCHOR_POSITION - 252]!,
				percentChange: 100,
			},
		]);
	});

	test('counts Market Sessions, not the line’s bars, when the line skipped sessions', () => {
		// The line skipped 5 of the last 21 Market Sessions. Counting 21 of its bars would start the
		// window 5 Market Sessions earlier, at a close of 50.
		const skippedPositions = new Set([290, 292, 294, 296, 298]);
		const tradedSessions = MARKET_SESSIONS.filter(
			(_, position) => !skippedPositions.has(position),
		);
		const bars = buildBarsOnSessions(tradedSessions, (_, sessionDate) =>
			sessionDate === MARKET_SESSIONS[ANCHOR_POSITION - 21] ? 80 : 50,
		);
		const [monthReturn] = calculatePeriodReturns(bars, MARKET_SESSIONS);

		expect(monthReturn).toEqual({
			windowMarketSessions: 21,
			fromSessionDate: MARKET_SESSIONS[ANCHOR_POSITION - 21]!,
			percentChange: -37.5,
		});
	});

	test('starts from the last close before the start session when the line did not trade on it', () => {
		const startPosition = ANCHOR_POSITION - 21;
		const tradedSessions = MARKET_SESSIONS.filter(
			(_, position) => position !== startPosition && position !== startPosition - 1,
		);
		const bars = buildBarsOnSessions(tradedSessions, (_, sessionDate) => {
			if (sessionDate === MARKET_SESSIONS[startPosition - 2]) {
				return 80;
			}
			if (sessionDate === MARKET_SESSIONS[startPosition + 1]) {
				return 1;
			}
			return 100;
		});
		const [monthReturn] = calculatePeriodReturns(bars, MARKET_SESSIONS);

		// The bar after the start session (close 1) was not yet known on it and is not used.
		expect(monthReturn).toEqual({
			windowMarketSessions: 21,
			fromSessionDate: MARKET_SESSIONS[startPosition - 2]!,
			percentChange: 25,
		});
	});

	test('is null, not zero, when the line or the MEP calendar does not reach back far enough', () => {
		const recentSessions = MARKET_SESSIONS.slice(-100);
		const recentBars = buildBarsOnSessions(recentSessions, () => 100);
		const shortCalendar = MARKET_SESSIONS.slice(-60);
		const shortBars = buildBarsOnSessions(shortCalendar, () => 100);

		expect(calculatePeriodReturns(recentBars, MARKET_SESSIONS)).toEqual([
			{
				windowMarketSessions: 21,
				fromSessionDate: recentSessions.at(-22)!,
				percentChange: 0,
			},
			{
				windowMarketSessions: 63,
				fromSessionDate: recentSessions.at(-64)!,
				percentChange: 0,
			},
			{ windowMarketSessions: 252, fromSessionDate: null, percentChange: null },
		]);
		expect(calculatePeriodReturns(shortBars, shortCalendar).slice(1)).toEqual([
			{ windowMarketSessions: 63, fromSessionDate: null, percentChange: null },
			{ windowMarketSessions: 252, fromSessionDate: null, percentChange: null },
		]);
	});

	test('a window needs exactly its number of Market Sessions before the anchor', () => {
		const calendar = MARKET_SESSIONS.slice(-22);
		const bars = buildBarsOnSessions(calendar, () => 100);
		const shorterCalendar = calendar.slice(1);

		expect(calculatePeriodReturns(bars, calendar)[0]!.fromSessionDate).toBe(calendar[0]!);
		expect(calculatePeriodReturns(bars.slice(1), shorterCalendar)[0]).toEqual({
			windowMarketSessions: 21,
			fromSessionDate: null,
			percentChange: null,
		});
	});

	test('anchors at the last bar even when later Market Sessions exist', () => {
		// The line did not trade on the last two Market Sessions, so its latest State is earlier.
		const bars = buildBarsOnSessions(MARKET_SESSIONS.slice(0, -2), (position) => position);
		const calendarThroughAnchor = MARKET_SESSIONS.slice(0, -2);

		expect(calculatePeriodReturns(bars, MARKET_SESSIONS)).toEqual(
			calculatePeriodReturns(bars, calendarThroughAnchor),
		);
		expect(calculatePeriodReturns(bars, MARKET_SESSIONS)[0]!.fromSessionDate).toBe(
			MARKET_SESSIONS[ANCHOR_POSITION - 2 - 21]!,
		);
	});

	test('is null for every window without bars or when the anchor is not a Market Session', () => {
		const bars = buildBarsOnSessions(['2026-12-31'], () => 100);
		const unavailable = [21, 63, 252].map((windowMarketSessions) => ({
			windowMarketSessions,
			fromSessionDate: null,
			percentChange: null,
		}));

		expect(calculatePeriodReturns([], MARKET_SESSIONS)).toEqual(unavailable);
		expect(calculatePeriodReturns(bars, MARKET_SESSIONS)).toEqual(unavailable);
	});
});

function buildBarsOnSessions(
	sessionDates: readonly string[],
	closeAt: (position: number, sessionDate: string) => number,
): readonly DailyBar[] {
	return sessionDates.map((sessionDate, position) => {
		const close = closeAt(position, sessionDate);
		return { sessionDate, open: close, high: close, low: close, close, volume: 1 };
	});
}
