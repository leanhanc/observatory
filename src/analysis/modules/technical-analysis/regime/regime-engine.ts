import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';

import { calculateAtr } from '../atr/index.ts';
import { calculateEma } from '../ema/index.ts';
import { proposeRegime } from './regime-policy.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type {
	ConfirmingSessionDates,
	RegimeTransitionEvent,
} from '../regime-transition/regime-transition.types.ts';
import type { Regime } from './regime.types.ts';

type ReadableRegime = Exclude<Regime, 'undefined'>;
type SessionDate = DailyBar['sessionDate'];
type PendingProposalSessionDates = readonly [SessionDate] | readonly [SessionDate, SessionDate];
type ProposalSessionDates = PendingProposalSessionDates | ConfirmingSessionDates;

export type PendingRegime = Readonly<{
	regime: ReadableRegime;
	proposalSessionDates: PendingProposalSessionDates;
}>;

export type RegimeTransitionState = Readonly<{
	settled: ReadableRegime | null;
	pending: PendingRegime | null;
}>;

export type RegimeProposalSession = Readonly<{
	sessionDate: SessionDate;
	/** `null` when a measurement the proposal needs is unavailable. */
	proposal: ReadableRegime | null;
}>;

export type RegimeAnalysisSession = Readonly<{
	sessionDate: SessionDate;
	regime: Regime;
	transition: RegimeTransitionEvent | null;
	/** The candidate after this session, or `null` when there is none or the session is unreadable. */
	pending: PendingRegime | null;
}>;

type RegimeTransitionStep = Readonly<{
	state: RegimeTransitionState;
	transition: RegimeTransitionEvent | null;
}>;

export const INITIAL_REGIME_TRANSITION_STATE: RegimeTransitionState = Object.freeze({
	settled: null,
	pending: null,
});

export function analyzeRegime(bars: readonly DailyBar[]): readonly RegimeAnalysisSession[] {
	const proposals = proposeRegimes(bars);
	return followRegimeProposals(proposals);
}

function proposeRegimes(bars: readonly DailyBar[]): readonly RegimeProposalSession[] {
	const closes = bars.map((bar) => bar.close);
	const fastEma = calculateEma(closes, ANALYSIS_CONFIGURATION.regime.fastEmaPeriod);
	const slowEma = calculateEma(closes, ANALYSIS_CONFIGURATION.regime.slowEmaPeriod);
	const atr = calculateAtr(bars, ANALYSIS_CONFIGURATION.regime.atrPeriod);

	return bars.map((bar, index) => ({
		sessionDate: bar.sessionDate,
		proposal: proposeRegime(
			bar.close,
			fastEma[index] ?? null,
			slowEma[index] ?? null,
			atr[index] ?? null,
		),
	}));
}

/**
 * Walks per-session Regime proposals oldest to newest through the transition engine. Every view of
 * Regime, its transitions and its pending candidate reads these sessions.
 */
export function followRegimeProposals(
	proposals: readonly RegimeProposalSession[],
): readonly RegimeAnalysisSession[] {
	const sessions: RegimeAnalysisSession[] = [];
	let state = INITIAL_REGIME_TRANSITION_STATE;

	for (const { sessionDate, proposal } of proposals) {
		const step = advanceRegimeTransitionState(state, proposal, sessionDate);
		state = step.state;

		// An unreadable session keeps the engine's candidate for later sessions, but it cannot
		// report a pending change of a Regime it cannot read.
		if (proposal === null) {
			sessions.push({
				sessionDate,
				regime: 'undefined',
				transition: step.transition,
				pending: null,
			});
			continue;
		}

		sessions.push({
			sessionDate,
			regime: state.settled ?? proposal,
			transition: step.transition,
			pending: state.pending,
		});
	}

	return sessions;
}

export function advanceRegimeTransitionState(
	state: RegimeTransitionState,
	proposal: ReadableRegime | null,
	sessionDate: SessionDate,
): RegimeTransitionStep {
	if (proposal === null) {
		return { state, transition: null };
	}

	if (state.settled === null) {
		return {
			state: { settled: proposal, pending: null },
			transition: null,
		};
	}

	if (proposal === state.settled) {
		return {
			state: { settled: state.settled, pending: null },
			transition: null,
		};
	}

	const proposalSessionDates = collectProposalSessionDates(state.pending, proposal, sessionDate);
	const transitionConfirmations = ANALYSIS_CONFIGURATION.regime.transitionConfirmations;

	if (proposalSessionDates.length !== transitionConfirmations) {
		return {
			state: {
				settled: state.settled,
				pending: { regime: proposal, proposalSessionDates },
			},
			transition: null,
		};
	}

	const transition = createRegimeTransition(state.settled, proposal, proposalSessionDates);

	return {
		state: { settled: proposal, pending: null },
		transition,
	};
}

function collectProposalSessionDates(
	pending: PendingRegime | null,
	proposal: ReadableRegime,
	sessionDate: SessionDate,
): ProposalSessionDates {
	if (pending?.regime !== proposal) {
		return [sessionDate];
	}

	if (pending.proposalSessionDates.length === 1) {
		return [pending.proposalSessionDates[0], sessionDate];
	}

	return [pending.proposalSessionDates[0], pending.proposalSessionDates[1], sessionDate];
}

function createRegimeTransition(
	from: ReadableRegime,
	to: ReadableRegime,
	confirmingSessionDates: ConfirmingSessionDates,
): RegimeTransitionEvent {
	const fields = {
		type: 'regime-transition',
		confirmingSessionDates,
	} as const;

	if (from === 'bullish' && to === 'bearish') {
		return { ...fields, from, to };
	}

	if (from === 'bullish' && to === 'mixed') {
		return { ...fields, from, to };
	}

	if (from === 'bearish' && to === 'bullish') {
		return { ...fields, from, to };
	}

	if (from === 'bearish' && to === 'mixed') {
		return { ...fields, from, to };
	}

	if (from === 'mixed' && to === 'bullish') {
		return { ...fields, from, to };
	}

	if (from === 'mixed' && to === 'bearish') {
		return { ...fields, from, to };
	}

	throw new Error('Regime transition endpoints must be different readable labels.');
}
