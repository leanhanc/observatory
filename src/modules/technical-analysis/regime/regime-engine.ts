import { calculateAtr } from '../atr/index.ts';
import { calculateEma } from '../ema/index.ts';
import { REGIME_CONFIGURATION_V1 } from './regime-configuration.ts';
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

type PendingRegime = Readonly<{
	regime: ReadableRegime;
	proposalSessionDates: PendingProposalSessionDates;
}>;

export type RegimeTransitionState = Readonly<{
	settled: ReadableRegime | null;
	pending: PendingRegime | null;
}>;

export type RegimeAnalysisSession = Readonly<{
	sessionDate: SessionDate;
	regime: Regime;
	transition: RegimeTransitionEvent | null;
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
	const closes = bars.map((bar) => bar.close);
	const fastEma = calculateEma(closes, REGIME_CONFIGURATION_V1.fastEmaPeriod);
	const slowEma = calculateEma(closes, REGIME_CONFIGURATION_V1.slowEmaPeriod);
	const atr = calculateAtr(bars, REGIME_CONFIGURATION_V1.atrPeriod);

	const sessions: RegimeAnalysisSession[] = [];
	let state = INITIAL_REGIME_TRANSITION_STATE;

	for (const [index, bar] of bars.entries()) {
		const proposal = proposeRegime(
			bar.close,
			fastEma[index] ?? null,
			slowEma[index] ?? null,
			atr[index] ?? null,
		);

		const step = advanceRegimeTransitionState(state, proposal, bar.sessionDate);
		state = step.state;

		if (proposal === null) {
			sessions.push({
				sessionDate: bar.sessionDate,
				regime: 'undefined',
				transition: step.transition,
			});
			continue;
		}

		sessions.push({
			sessionDate: bar.sessionDate,
			regime: state.settled ?? proposal,
			transition: step.transition,
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
	const transitionConfirmations = REGIME_CONFIGURATION_V1.transitionConfirmations;

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
