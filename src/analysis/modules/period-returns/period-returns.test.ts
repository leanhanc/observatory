import { describe, expect, test } from 'bun:test';

import { calculatePeriodReturns } from './period-returns.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';

// Weekday sessions from 2025-09-01 through 2026-10-13, like a market calendar without holidays.
const WEEKDAY_SESSIONS = listDates('2025-09-01', '2026-10-13').filter((date) => {
	const dayOfWeek = Temporal.PlainDate.from(date).dayOfWeek;
	return dayOfWeek <= 5;
});

describe('calculatePeriodReturns', () => {
	test('measures each window from the close on the same date one, three and twelve months earlier', () => {
		const sessions = WEEKDAY_SESSIONS.filter((date) => date <= '2026-10-09');
		const bars = buildBars(sessions, (date) => {
			const closes: Record<string, number> = {
				'2026-10-09': 110,
				'2026-09-09': 100,
				'2026-07-09': 220,
				'2025-10-09': 55,
			};
			return closes[date] ?? 1;
		});

		expect(calculatePeriodReturns(bars)).toEqual([
			{ windowMonths: 1, fromSessionDate: '2026-09-09', percentChange: 10 },
			{ windowMonths: 3, fromSessionDate: '2026-07-09', percentChange: -50 },
			{ windowMonths: 12, fromSessionDate: '2025-10-09', percentChange: 100 },
		]);
	});

	test('a year is a calendar year, not 252 sessions', () => {
		const sessions = WEEKDAY_SESSIONS.filter((date) => date <= '2026-10-09');
		const bars = buildBars(sessions, () => 100);
		const yearReturn = calculatePeriodReturns(bars)[2]!;
		const sessionsBack252 = sessions.at(-253)!;

		// This calendar has about 261 sessions a year and BYMA about 245, so a count of 252 sessions
		// matches neither.
		expect(yearReturn.fromSessionDate).toBe('2025-10-09');
		expect(sessionsBack252).not.toBe('2025-10-09');
	});

	test('starts from the last close on or before a start date that is not a session', () => {
		// 2026-10-13 minus one month is Sunday 2026-09-13; the close known then is Friday's.
		const sessions = WEEKDAY_SESSIONS.filter((date) => date <= '2026-10-13');
		const bars = buildBars(sessions, (date) => {
			if (date === '2026-09-11') {
				return 80;
			}
			if (date === '2026-09-14') {
				// Closer to the start date, but not yet known on it.
				return 1;
			}
			return 100;
		});

		expect(calculatePeriodReturns(bars)[0]).toEqual({
			windowMonths: 1,
			fromSessionDate: '2026-09-11',
			percentChange: 25,
		});
	});

	test('starts from the last close before the start date when the line did not trade on it', () => {
		const sessions = WEEKDAY_SESSIONS.filter(
			(date) => date <= '2026-10-09' && date !== '2026-09-09' && date !== '2026-09-08',
		);
		const bars = buildBars(sessions, (date) => (date === '2026-09-07' ? 80 : 100));

		expect(calculatePeriodReturns(bars)[0]).toEqual({
			windowMonths: 1,
			fromSessionDate: '2026-09-07',
			percentChange: 25,
		});
	});

	test('a start day the target month lacks becomes that month’s last day', () => {
		const bars = buildBars(listDates('2026-01-01', '2026-03-31'), () => 100);

		expect(calculatePeriodReturns(bars)[0]!.fromSessionDate).toBe('2026-02-28');
	});

	test('is null, not zero, when the line does not reach back far enough', () => {
		const sessions = WEEKDAY_SESSIONS.filter(
			(date) => date >= '2026-06-01' && date <= '2026-10-09',
		);
		const bars = buildBars(sessions, () => 100);

		expect(calculatePeriodReturns(bars)).toEqual([
			{ windowMonths: 1, fromSessionDate: '2026-09-09', percentChange: 0 },
			{ windowMonths: 3, fromSessionDate: '2026-07-09', percentChange: 0 },
			{ windowMonths: 12, fromSessionDate: null, percentChange: null },
		]);
	});

	test('a first bar exactly on the start date is enough', () => {
		const sessions = WEEKDAY_SESSIONS.filter(
			(date) => date >= '2026-09-09' && date <= '2026-10-09',
		);
		const bars = buildBars(sessions, () => 100);

		expect(calculatePeriodReturns(bars)[0]!.fromSessionDate).toBe('2026-09-09');
		expect(calculatePeriodReturns(bars.slice(1))[0]!.fromSessionDate).toBeNull();
	});

	test('is null for every window without bars', () => {
		expect(calculatePeriodReturns([])).toEqual(
			[1, 3, 12].map((windowMonths) => ({
				windowMonths,
				fromSessionDate: null,
				percentChange: null,
			})),
		);
	});
});

function listDates(from: string, through: string): string[] {
	const dates: string[] = [];

	for (
		let date = Temporal.PlainDate.from(from);
		Temporal.PlainDate.compare(date, Temporal.PlainDate.from(through)) <= 0;
		date = date.add({ days: 1 })
	) {
		dates.push(date.toString());
	}

	return dates;
}

function buildBars(
	sessionDates: readonly string[],
	closeOn: (sessionDate: string) => number,
): readonly DailyBar[] {
	return sessionDates.map((sessionDate) => {
		const close = closeOn(sessionDate);
		return { sessionDate, open: close, high: close, low: close, close, volume: 1 };
	});
}
