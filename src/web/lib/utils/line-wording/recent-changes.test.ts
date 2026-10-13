import { describe, expect, test } from 'bun:test';

import { groupHistoryByYear, selectRecentChanges } from './recent-changes.ts';

import type { AvailableLine, SnapshotEvent } from '#web/lib/utils/snapshot-pages/index.ts';

const volatileSession = (sessionDate: string): SnapshotEvent => ({
	sessionDate,
	event: {
		type: 'volatile-session',
		trueRange: 0.5,
		baselineAtr: 0.25,
		baselineThroughSessionDate: sessionDate,
		atrMultiple: 2,
	},
	coincidesWithLargeMove: false,
});
const regimeTransition = (sessionDate: string): SnapshotEvent => ({
	sessionDate,
	event: {
		type: 'regime-transition',
		from: 'bullish',
		to: 'mixed',
		confirmingSessionDates: ['2026-09-25', '2026-09-26', sessionDate],
	},
	coincidesWithLargeMove: false,
});

describe('selectRecentChanges', () => {
	test('keeps the Events after the start of the one-month return, newest first, with Volatile Sessions apart', () => {
		const line = buildLine('2026-09-10', [
			regimeTransition('2026-09-10'),
			regimeTransition('2026-09-29'),
			volatileSession('2026-10-02'),
			volatileSession('2026-10-08'),
		]);

		expect(selectRecentChanges(line)).toEqual({
			changes: [regimeTransition('2026-09-29')],
			volatileSessions: [volatileSession('2026-10-08'), volatileSession('2026-10-02')],
		});
	});

	test('a month without Events selects nothing, even with older Events', () => {
		const line = buildLine('2026-09-10', [regimeTransition('2026-08-03')]);

		expect(selectRecentChanges(line)).toEqual({ changes: [], volatileSessions: [] });
	});

	test('a history shorter than the window keeps every Event', () => {
		const line = buildLine(null, [regimeTransition('2026-08-03')]);

		expect(selectRecentChanges(line).changes).toEqual([regimeTransition('2026-08-03')]);
	});

	test('fails without a one-month return, since the page could not say which month it describes', () => {
		const line = { ...buildLine(null, []), periodReturns: [] };

		expect(() => selectRecentChanges(line)).toThrow('has no one-month period return');
	});
});

describe('groupHistoryByYear', () => {
	test('lists the full history newest first under each calendar year, Volatile Sessions included', () => {
		const line = buildLine(null, [
			regimeTransition('2025-11-06'),
			regimeTransition('2026-08-03'),
			volatileSession('2026-10-08'),
		]);

		expect(groupHistoryByYear(line)).toEqual([
			{
				year: '2026',
				events: [volatileSession('2026-10-08'), regimeTransition('2026-08-03')],
			},
			{ year: '2025', events: [regimeTransition('2025-11-06')] },
		]);
	});

	test('a line without Events has no history', () => {
		expect(groupHistoryByYear(buildLine(null, []))).toEqual([]);
	});
});

function buildLine(
	monthReturnStart: string | null,
	events: readonly SnapshotEvent[],
): AvailableLine {
	const percentChange = monthReturnStart === null ? null : -17;
	return {
		tradingLineId: 'galicia-stock-byma-ars',
		periodReturns: [
			{ windowMonths: 1, fromSessionDate: monthReturnStart, percentChange },
			{ windowMonths: 3, fromSessionDate: null, percentChange: null },
		],
		events,
	} as unknown as AvailableLine;
}
