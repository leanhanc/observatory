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
