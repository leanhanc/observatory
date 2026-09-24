import { describe, expect, test } from 'bun:test';

import { advanceRegimeState, proposeRegime } from './regime-policy.ts';

import type { RegimeState } from './regime-policy.ts';

const INITIAL_STATE: RegimeState = { settled: null, pending: null, pendingCount: 0 };

describe('Regime proposal', () => {
	test('requires price and EMA alignment for directional readings', () => {
		expect(proposeRegime(106, 101, 100, 10)).toBe('bullish');
		expect(proposeRegime(94, 99, 100, 10)).toBe('bearish');
		expect(proposeRegime(106, 99, 100, 10)).toBe('mixed');
		expect(proposeRegime(94, 101, 100, 10)).toBe('mixed');
		expect(proposeRegime(104, 101, 100, 10)).toBe('mixed');
	});

	test('treats equality at either band edge or between EMAs as mixed', () => {
		expect(proposeRegime(105, 101, 100, 10)).toBe('mixed');
		expect(proposeRegime(95, 99, 100, 10)).toBe('mixed');
		expect(proposeRegime(106, 100, 100, 10)).toBe('mixed');
		expect(proposeRegime(94, 100, 100, 10)).toBe('mixed');
	});

	test('uses the same strict rules for zero and near-zero ATR', () => {
		expect(proposeRegime(100, 101, 100, 0)).toBe('mixed');
		expect(proposeRegime(101, 101, 100, 0)).toBe('bullish');
		expect(proposeRegime(100 + 1e-9, 101, 100, 1e-9)).toBe('bullish');
		expect(proposeRegime(100 - 1e-9, 99, 100, 1e-9)).toBe('bearish');
	});

	test('does not turn floating point EMA drift on a flat series into a direction', () => {
		expect(proposeRegime(100, 100, 100.0000000000001, 0)).toBe('mixed');
	});

	test('preserves real directional differences at very small prices', () => {
		expect(proposeRegime(3e-20, 2e-20, 1e-20, 0)).toBe('bullish');
		expect(proposeRegime(1e-20, 2e-20, 3e-20, 0)).toBe('bearish');
	});

	test('returns no proposal when any required measurement is missing', () => {
		expect(proposeRegime(null, 101, 100, 10)).toBeNull();
		expect(proposeRegime(106, null, 100, 10)).toBeNull();
		expect(proposeRegime(106, 101, null, 10)).toBeNull();
		expect(proposeRegime(106, 101, 100, null)).toBeNull();
		expect(proposeRegime(106, 101, 100, Number.POSITIVE_INFINITY)).toBeNull();
		expect(proposeRegime(106, Number.NaN, 100, 10)).toBeNull();
	});
});

describe('Regime transition state', () => {
	test('adopts the first readable proposal immediately', () => {
		expect(advanceRegimeState(INITIAL_STATE, 'mixed')).toEqual({
			settled: 'mixed',
			pending: null,
			pendingCount: 0,
		});
	});

	test('changes a directional regime to mixed on exactly the third proposal', () => {
		const bullish = advanceRegimeState(INITIAL_STATE, 'bullish');
		const first = advanceRegimeState(bullish, 'mixed');
		const second = advanceRegimeState(first, 'mixed');
		const third = advanceRegimeState(second, 'mixed');

		expect(first).toEqual({ settled: 'bullish', pending: 'mixed', pendingCount: 1 });
		expect(second).toEqual({ settled: 'bullish', pending: 'mixed', pendingCount: 2 });
		expect(third).toEqual({ settled: 'mixed', pending: null, pendingCount: 0 });
	});

	test('also confirms transitions out of mixed and between directions', () => {
		let state = advanceRegimeState(INITIAL_STATE, 'mixed');
		state = advanceRegimeState(state, 'bearish');
		state = advanceRegimeState(state, 'bearish');
		expect(state.settled).toBe('mixed');
		state = advanceRegimeState(state, 'bearish');
		expect(state.settled).toBe('bearish');

		state = advanceRegimeState(state, 'bullish');
		state = advanceRegimeState(state, 'bullish');
		expect(state.settled).toBe('bearish');
		state = advanceRegimeState(state, 'bullish');
		expect(state).toEqual({ settled: 'bullish', pending: null, pendingCount: 0 });
	});

	test('clears a candidate when the settled proposal returns', () => {
		let state = advanceRegimeState(INITIAL_STATE, 'bullish');
		state = advanceRegimeState(state, 'mixed');
		state = advanceRegimeState(state, 'mixed');
		state = advanceRegimeState(state, 'bullish');
		expect(state).toEqual({ settled: 'bullish', pending: null, pendingCount: 0 });

		state = advanceRegimeState(state, 'mixed');
		state = advanceRegimeState(state, 'mixed');
		expect(state).toEqual({ settled: 'bullish', pending: 'mixed', pendingCount: 2 });
	});

	test('replaces an interrupted candidate and restarts its count', () => {
		let state = advanceRegimeState(INITIAL_STATE, 'bullish');
		state = advanceRegimeState(state, 'mixed');
		state = advanceRegimeState(state, 'mixed');
		state = advanceRegimeState(state, 'bearish');
		expect(state).toEqual({ settled: 'bullish', pending: 'bearish', pendingCount: 1 });

		state = advanceRegimeState(state, 'bearish');
		expect(state.settled).toBe('bullish');
		state = advanceRegimeState(state, 'bearish');
		expect(state).toEqual({ settled: 'bearish', pending: null, pendingCount: 0 });
	});

	test('does not advance or clear a candidate when a measurement is missing', () => {
		let state = advanceRegimeState(INITIAL_STATE, 'bullish');
		state = advanceRegimeState(state, 'mixed');
		state = advanceRegimeState(state, null);
		expect(state).toEqual({ settled: 'bullish', pending: 'mixed', pendingCount: 1 });

		state = advanceRegimeState(state, 'mixed');
		expect(state.settled).toBe('bullish');
		state = advanceRegimeState(state, 'mixed');
		expect(state.settled).toBe('mixed');
	});
});
