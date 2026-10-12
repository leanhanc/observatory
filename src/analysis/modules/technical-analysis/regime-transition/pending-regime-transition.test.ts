import { describe, expect, test } from 'bun:test';

import { calculateRegime } from '../regime/index.ts';
import { buildBars } from '../tests/support/index.ts';
import { calculatePendingRegimeTransitions, detectRegimeTransitionEvents } from './index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';

// A flat history settles a `mixed` Regime once EMA(200) warms up at position 199. Its ATR(14) is
// 3, so a close of 120 clears the upper band and pulls EMA(50) above EMA(200), proposing
// `bullish`; a close of 60 the session after pulls EMA(50) back below, proposing `bearish`.
const FLAT_HISTORY = Array<number>(205).fill(100);
const FIRST_TAIL_INDEX = FLAT_HISTORY.length;

describe('calculatePendingRegimeTransitions', () => {
	test('returns one row per session and handles empty input', () => {
		const bars = buildRegimeBars([]);
		const sessions = calculatePendingRegimeTransitions(bars);

		expect(calculatePendingRegimeTransitions([])).toEqual([]);
		expect(sessions.map((session) => session.sessionDate)).toEqual(
			bars.map((bar) => bar.sessionDate),
		);
	});

	test('has no candidate during warm-up, on initial availability or while proposals agree', () => {
		const bars = buildRegimeBars([]);
		const regimes = calculateRegime(bars);
		const firstReadableIndex = regimes.findIndex((session) => session.regime !== 'undefined');

		expect(firstReadableIndex).toBe(199);
		expect(regimes.at(-1)!.regime).toBe('mixed');
		expect(
			calculatePendingRegimeTransitions(bars).every(({ pending }) => pending === null),
		).toBe(true);
	});

	test('counts a candidate up to two, replaces it, and clears it on the transition session', () => {
		const bars = buildRegimeBars([120, 60, 60, 60, 60]);
		const pending = calculatePendingRegimeTransitions(bars)
			.slice(FIRST_TAIL_INDEX)
			.map((session) => session.pending);
		const transitions = detectRegimeTransitionEvents(bars).slice(FIRST_TAIL_INDEX);

		expect(pending).toEqual([
			{ candidate: 'bullish', confirmations: 1, requiredConfirmations: 3 },
			{ candidate: 'bearish', confirmations: 1, requiredConfirmations: 3 },
			{ candidate: 'bearish', confirmations: 2, requiredConfirmations: 3 },
			null,
			null,
		]);
		expect(transitions[3]!.event).toMatchObject({ from: 'mixed', to: 'bearish' });
	});

	test('a proposal equal to settled Regime clears the candidate and a later one restarts at one', () => {
		const bars = buildRegimeBars([120, 120, 100, 120]);
		const pending = calculatePendingRegimeTransitions(bars)
			.slice(FIRST_TAIL_INDEX)
			.map((session) => session.pending);

		expect(pending).toEqual([
			{ candidate: 'bullish', confirmations: 1, requiredConfirmations: 3 },
			{ candidate: 'bullish', confirmations: 2, requiredConfirmations: 3 },
			null,
			{ candidate: 'bullish', confirmations: 1, requiredConfirmations: 3 },
		]);
		expect(calculateRegime(bars).at(-1)!.regime).toBe('mixed');
	});

	test('matches every replayed prefix', () => {
		const bars = buildRegimeBars([120, 60, 60, 60, 60, 120, 120, 100, 120]);
		const full = calculatePendingRegimeTransitions(bars);

		for (let length = 1; length <= bars.length; length += 1) {
			const prefix = calculatePendingRegimeTransitions(bars.slice(0, length));
			expect(prefix).toEqual(full.slice(0, length));
		}
	});

	test('does not mutate input bars', () => {
		const bars = Object.freeze(buildRegimeBars([120, 60]).map((bar) => Object.freeze(bar)));
		const original = structuredClone(bars);

		expect(() => calculatePendingRegimeTransitions(bars)).not.toThrow();
		expect(bars).toEqual(original);
	});
});

function buildRegimeBars(tail: readonly number[]): readonly DailyBar[] {
	return buildBars([...FLAT_HISTORY, ...tail]).map((bar, index) => ({
		...bar,
		sessionDate: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
	}));
}
