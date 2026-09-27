import { describe, expect, test } from 'bun:test';

import { advanceRegimeTransitionState, INITIAL_REGIME_TRANSITION_STATE } from './regime-engine.ts';

import type { RegimeTransitionEvent } from '../regime-transition/regime-transition.types.ts';
import type { RegimeTransitionState } from './regime-engine.ts';

type ReadableRegime = RegimeTransitionEvent['from'];

describe('Regime transition engine', () => {
	test('adopts the first readable proposal without a transition', () => {
		const step = advanceRegimeTransitionState(
			INITIAL_REGIME_TRANSITION_STATE,
			'mixed',
			'2026-01-01',
		);

		expect(step).toEqual({
			state: { settled: 'mixed', pending: null },
			transition: null,
		});
	});

	test('changes a directional regime to mixed on exactly the third proposal', () => {
		let step = advanceRegimeTransitionState(
			INITIAL_REGIME_TRANSITION_STATE,
			'bullish',
			'2026-01-01',
		);
		step = advanceRegimeTransitionState(step.state, 'mixed', '2026-01-02');
		expect(step.transition).toBeNull();
		step = advanceRegimeTransitionState(step.state, 'mixed', '2026-01-03');
		expect(step.transition).toBeNull();
		step = advanceRegimeTransitionState(step.state, 'mixed', '2026-01-04');

		expect(step).toEqual({
			state: { settled: 'mixed', pending: null },
			transition: {
				type: 'regime-transition',
				from: 'bullish',
				to: 'mixed',
				confirmingSessionDates: ['2026-01-02', '2026-01-03', '2026-01-04'],
			},
		});
	});

	test('confirms transitions out of mixed and direct directional reversals', () => {
		let state = settle('mixed');
		let step = confirm(state, 'bearish', 2);
		expect(step.transition).toEqual({
			type: 'regime-transition',
			from: 'mixed',
			to: 'bearish',
			confirmingSessionDates: ['2026-02-01', '2026-02-02', '2026-02-03'],
		});

		state = step.state;
		step = confirm(state, 'bullish', 3);
		expect(step.transition).toMatchObject({ from: 'bearish', to: 'bullish' });
	});

	test('creates all six directed readable transition pairs', () => {
		const pairs = [
			['bullish', 'bearish'],
			['bullish', 'mixed'],
			['bearish', 'bullish'],
			['bearish', 'mixed'],
			['mixed', 'bullish'],
			['mixed', 'bearish'],
		] as const;

		for (const [from, to] of pairs) {
			const confirmed = confirm(settle(from), to, 6);

			expect(confirmed.transition?.type).toBe('regime-transition');
			expect(confirmed.transition?.from).toBe(from);
			expect(confirmed.transition?.to).toBe(to);
			expect(confirmed.transition?.confirmingSessionDates).toEqual([
				'2026-06-01',
				'2026-06-02',
				'2026-06-03',
			]);
		}
	});

	test('clears a candidate when the settled proposal returns', () => {
		let state = settle('bullish');
		state = advanceRegimeTransitionState(state, 'mixed', '2026-01-02').state;
		state = advanceRegimeTransitionState(state, 'mixed', '2026-01-03').state;
		const cleared = advanceRegimeTransitionState(state, 'bullish', '2026-01-04');

		expect(cleared).toEqual({
			state: { settled: 'bullish', pending: null },
			transition: null,
		});

		state = advanceRegimeTransitionState(cleared.state, 'mixed', '2026-01-05').state;
		state = advanceRegimeTransitionState(state, 'mixed', '2026-01-06').state;
		expect(state.pending?.proposalSessionDates).toEqual(['2026-01-05', '2026-01-06']);
	});

	test('replaces an interrupted candidate and restarts confirmation', () => {
		let state = settle('bullish');
		state = advanceRegimeTransitionState(state, 'mixed', '2026-01-02').state;
		state = advanceRegimeTransitionState(state, 'mixed', '2026-01-03').state;
		const replaced = advanceRegimeTransitionState(state, 'bearish', '2026-01-04');

		expect(replaced.state.pending).toEqual({
			regime: 'bearish',
			proposalSessionDates: ['2026-01-04'],
		});
	});

	test('preserves a candidate across an unreadable gap and records actual dates', () => {
		let state = settle('bullish');
		state = advanceRegimeTransitionState(state, 'mixed', '2026-01-02').state;
		state = advanceRegimeTransitionState(state, null, '2026-01-03').state;
		state = advanceRegimeTransitionState(state, 'mixed', '2026-01-04').state;
		const confirmed = advanceRegimeTransitionState(state, 'mixed', '2026-01-05');

		expect(confirmed.transition?.confirmingSessionDates).toEqual([
			'2026-01-02',
			'2026-01-04',
			'2026-01-05',
		]);
	});

	test('emits once and does not repeat while the new regime remains settled', () => {
		const confirmed = confirm(settle('bullish'), 'bearish', 4);
		const retained = advanceRegimeTransitionState(confirmed.state, 'bearish', '2026-05-04');

		expect(confirmed.transition).toMatchObject({ from: 'bullish', to: 'bearish' });
		expect(retained.transition).toBeNull();
	});
});

function settle(regime: ReadableRegime): RegimeTransitionState {
	return advanceRegimeTransitionState(INITIAL_REGIME_TRANSITION_STATE, regime, '2026-01-01')
		.state;
}

function confirm(state: RegimeTransitionState, proposal: ReadableRegime, month: number) {
	let step = advanceRegimeTransitionState(state, proposal, `2026-0${month}-01`);
	step = advanceRegimeTransitionState(step.state, proposal, `2026-0${month}-02`);
	return advanceRegimeTransitionState(step.state, proposal, `2026-0${month}-03`);
}
