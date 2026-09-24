import { describe, expect, test } from 'bun:test';

import { loadNflxFixture } from '../tests/support/index.ts';
import { calculateRegime } from './index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';

describe('calculateRegime', () => {
	test('returns no sessions for empty input', () => {
		expect(calculateRegime([])).toEqual([]);
	});

	test('preserves session identity and stays undefined through warm-up', () => {
		const bars = createBars(Array.from({ length: 200 }, (_, index) => 100 + index));
		const sessions = calculateRegime(bars);

		expect(sessions).toHaveLength(bars.length);
		expect(sessions.map((session) => session.sessionDate)).toEqual(
			bars.map((bar) => bar.sessionDate),
		);
		expect(sessions.slice(0, 199).every((session) => session.regime === 'undefined')).toBe(
			true,
		);
		expect(sessions[199]?.regime).toBe('bullish');
	});

	test('classifies controlled bullish, bearish, and mixed histories', () => {
		const rising = createBars(Array.from({ length: 205 }, (_, index) => 100 + index));
		const falling = createBars(Array.from({ length: 205 }, (_, index) => 400 - index));
		const flat = createBars(Array(205).fill(100), 0);

		expect(calculateRegime(rising).at(-1)?.regime).toBe('bullish');
		expect(calculateRegime(falling).at(-1)?.regime).toBe('bearish');
		expect(calculateRegime(flat).at(-1)?.regime).toBe('mixed');
	});

	test('keeps non-finite derived ATR unavailable instead of inventing a label', () => {
		const bars = createBars(Array(200).fill(1e308)).map((bar) => ({
			...bar,
			high: 1e308,
			low: 1,
		}));
		const sessions = calculateRegime(bars);

		expect(sessions.every((session) => session.regime === 'undefined')).toBe(true);
	});

	test('matches every replayed prefix', () => {
		const bars = createBars([
			...Array.from({ length: 205 }, (_, index) => 100 + index),
			...Array.from({ length: 10 }, (_, index) => 300 - index * 10),
		]);
		const full = calculateRegime(bars);

		for (let length = 1; length <= bars.length; length += 1) {
			const prefix = calculateRegime(bars.slice(0, length));
			expect(prefix.at(-1)).toEqual(full[length - 1]);
		}
	});

	test('does not mutate input bars', () => {
		const bars = Object.freeze(
			createBars(Array.from({ length: 205 }, (_, index) => 100 + index)).map((bar) =>
				Object.freeze(bar),
			),
		);
		const original = structuredClone(bars);

		expect(() => calculateRegime(bars)).not.toThrow();
		expect(bars).toEqual(original);
	});

	test('matches the known NFLX reference sessions', async () => {
		const bars = await loadNflxFixture();
		const sessions = calculateRegime(bars);

		expect(sessions[199]).toEqual({ sessionDate: '2025-06-10', regime: 'bullish' });
		expect(sessions.at(-1)).toEqual({ sessionDate: '2026-08-21', regime: 'bearish' });
	});
});

function createBars(closes: readonly number[], halfRange = 0.5): readonly DailyBar[] {
	return closes.map((close, index) => ({
		sessionDate: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
		open: close,
		high: close + halfRange,
		low: close - halfRange,
		close,
		volume: 1,
	}));
}
