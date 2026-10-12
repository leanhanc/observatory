import type { ANALYSIS_CONFIGURATION } from '#lib/config.ts';
import type { DailyBar } from '#modules/bar-history/index.ts';

type SessionDate = DailyBar['sessionDate'];

export type ConfirmingSessionDates = readonly [SessionDate, SessionDate, SessionDate];

type RegimeTransitionFields = Readonly<{
	type: 'regime-transition';
	confirmingSessionDates: ConfirmingSessionDates;
}>;

export type RegimeTransitionEvent = RegimeTransitionFields &
	(
		| Readonly<{ from: 'bullish'; to: 'bearish' }>
		| Readonly<{ from: 'bullish'; to: 'mixed' }>
		| Readonly<{ from: 'bearish'; to: 'bullish' }>
		| Readonly<{ from: 'bearish'; to: 'mixed' }>
		| Readonly<{ from: 'mixed'; to: 'bullish' }>
		| Readonly<{ from: 'mixed'; to: 'bearish' }>
	);

export type RegimeTransitionSession = Readonly<{
	sessionDate: SessionDate;
	event: RegimeTransitionEvent | null;
}>;

/**
 * A Regime proposal that differs from settled Regime and has not yet gathered the confirmations a
 * transition needs. It may still be cleared or replaced; it is not an Event.
 */
export type PendingRegimeTransition = Readonly<{
	candidate: RegimeTransitionEvent['to'];
	/** Matching readable proposals so far, including this session's. */
	confirmations: 1 | 2;
	requiredConfirmations: typeof ANALYSIS_CONFIGURATION.regime.transitionConfirmations;
}>;

export type PendingRegimeTransitionSession = Readonly<{
	sessionDate: SessionDate;
	pending: PendingRegimeTransition | null;
}>;
