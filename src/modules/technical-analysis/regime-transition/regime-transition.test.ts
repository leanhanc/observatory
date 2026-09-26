import { describe, expect, test } from 'bun:test';

import { calculateRegime } from '../regime/index.ts';
import { detectStructureBreakEvents } from '../structure-break/index.ts';
import { detectRegimeTransitionEvents } from './index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';

describe('detectRegimeTransitionEvents', () => {
	test('returns one null Event per warm-up session and handles empty input', () => {
		const bars = createBars(Array.from({ length: 100 }, (_, index) => 100 + index));
		const sessions = detectRegimeTransitionEvents(bars);

		expect(detectRegimeTransitionEvents([])).toEqual([]);
		expect(sessions).toHaveLength(bars.length);
		expect(sessions.map((session) => session.sessionDate)).toEqual(
			bars.map((bar) => bar.sessionDate),
		);
		expect(sessions.every((session) => session.event === null)).toBe(true);
	});

	test('does not emit when the first readable Regime is adopted', () => {
		const bars = createBars(Array.from({ length: 200 }, (_, index) => 100 + index));
		const events = detectRegimeTransitionEvents(bars);

		expect(calculateRegime(bars).at(-1)?.regime).toBe('bullish');
		expect(events.at(-1)?.event).toBeNull();
		expect(events.every((session) => session.event === null)).toBe(true);
	});

	test('records settled changes with the three confirming readable sessions', () => {
		const bars = createBullishToBearishBars();
		const transitions = detectRegimeTransitionEvents(bars).filter(
			(session) => session.event !== null,
		);

		expect(transitions).toEqual([
			{
				sessionDate: '2025-08-11',
				event: {
					type: 'regime-transition',
					from: 'bullish',
					to: 'mixed',
					confirmingSessionDates: ['2025-08-09', '2025-08-10', '2025-08-11'],
				},
			},
			{
				sessionDate: '2025-08-31',
				event: {
					type: 'regime-transition',
					from: 'mixed',
					to: 'bearish',
					confirmingSessionDates: ['2025-08-29', '2025-08-30', '2025-08-31'],
				},
			},
		]);
	});

	test('does not emit before the third matching proposal or repeat afterward', () => {
		const bars = createBullishToBearishBars();
		const beforeThirdProposal = detectRegimeTransitionEvents(bars.slice(0, 222));
		const full = detectRegimeTransitionEvents(bars);

		expect(beforeThirdProposal.every((session) => session.event === null)).toBe(true);
		expect(full.find((session) => session.sessionDate === '2025-08-11')?.event).not.toBeNull();
		expect(full.find((session) => session.sessionDate === '2025-08-12')?.event).toBeNull();
	});

	test('matches every replayed prefix', () => {
		const bars = createBullishToBearishBars();
		const full = detectRegimeTransitionEvents(bars);

		for (let length = 1; length <= bars.length; length += 1) {
			const prefix = detectRegimeTransitionEvents(bars.slice(0, length));
			expect(prefix.at(-1)).toEqual(full[length - 1]);
		}
	});

	test('does not mutate input bars', () => {
		const bars = Object.freeze(createBullishToBearishBars().map((bar) => Object.freeze(bar)));
		const original = structuredClone(bars);

		expect(() => detectRegimeTransitionEvents(bars)).not.toThrow();
		expect(bars).toEqual(original);
	});

	test('remains valid when Structure Break occurs on the same session', () => {
		const bars = createCoexistingEventBars();
		const regimeTransition = detectRegimeTransitionEvents(bars).at(-1);
		const structureBreak = detectStructureBreakEvents(bars).at(-1);

		expect(regimeTransition).toMatchObject({
			sessionDate: '2025-07-27',
			event: { from: 'bullish', to: 'mixed' },
		});
		expect(structureBreak).toMatchObject({
			sessionDate: '2025-07-27',
			event: { type: 'structure-break', direction: 'downward' },
		});
	});
});

function createBullishToBearishBars(): readonly DailyBar[] {
	const bullishCloses = Array.from({ length: 205 }, (_, index) => 100 + index);
	const fallingCloses = Array.from({ length: 80 }, (_, index) => 300 - index * 5);
	return createBars([...bullishCloses, ...fallingCloses]);
}

function createCoexistingEventBars(): readonly DailyBar[] {
	const swingPattern = [0, 10, 20, 30, 20, 10, 0];
	const bullishCloses = Array.from(
		{ length: 205 },
		(_, index) => 100 + index * 0.1 + swingPattern[index % swingPattern.length]!,
	);

	return createBars([...bullishCloses, 124, 123, 118]);
}

function createBars(closes: readonly number[]): readonly DailyBar[] {
	return closes.map((close, index) => ({
		sessionDate: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
		open: close,
		high: close + 0.5,
		low: close - 0.5,
		close,
		volume: 1,
	}));
}
