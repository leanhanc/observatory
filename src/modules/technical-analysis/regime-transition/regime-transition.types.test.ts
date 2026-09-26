import { expect, test } from 'bun:test';

import type { ConfirmingSessionDates, RegimeTransitionEvent } from './regime-transition.types.ts';

const confirmingSessionDates: ConfirmingSessionDates = ['2026-01-01', '2026-01-02', '2026-01-03'];

test('allows only different readable Regime endpoints', () => {
	const transition: RegimeTransitionEvent = {
		type: 'regime-transition',
		from: 'bullish',
		to: 'mixed',
		confirmingSessionDates,
	};

	expect(transition).toBeDefined();

	// @ts-expect-error Equal endpoints are not a valid Regime Transition.
	const equalEndpoints: RegimeTransitionEvent = {
		type: 'regime-transition',
		from: 'bullish',
		to: 'bullish',
		confirmingSessionDates,
	};

	const unavailableEndpoint: RegimeTransitionEvent = {
		type: 'regime-transition',
		// @ts-expect-error Unavailable Regime is not a transition endpoint.
		from: 'undefined',
		to: 'mixed',
		confirmingSessionDates,
	};

	void equalEndpoints;
	void unavailableEndpoint;
});
