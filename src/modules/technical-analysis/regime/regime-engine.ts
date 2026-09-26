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

type PendingRegime = Readonly<{
	regime: ReadableRegime;
	confirmingSessionDates: readonly SessionDate[];
}>;

export type RegimeState = Readonly<{
	settled: ReadableRegime | null;
	pending: PendingRegime | null;
}>;

export type RegimeAnalysisSession = Readonly<{
	sessionDate: SessionDate;
	regime: Regime;
	transition: RegimeTransitionEvent | null;
}>;

type RegimeAdvance = Readonly<{
	state: RegimeState;
	transition: RegimeTransitionEvent | null;
}>;

export const INITIAL_REGIME_STATE: RegimeState = Object.freeze({
	settled: null,
	pending: null,
});

export function analyzeRegime(bars: readonly DailyBar[]): readonly RegimeAnalysisSession[] {
	const closes = bars.map((bar) => bar.close);
	const fastEma = calculateEma(closes, REGIME_CONFIGURATION_V1.fastEmaPeriod);
	const slowEma = calculateEma(closes, REGIME_CONFIGURATION_V1.slowEmaPeriod);
	const atr = calculateAtr(bars, REGIME_CONFIGURATION_V1.atrPeriod);

	const sessions: RegimeAnalysisSession[] = [];
	let state = INITIAL_REGIME_STATE;

	for (const [index, bar] of bars.entries()) {
		const proposal = proposeRegime(
			bar.close,
			fastEma[index] ?? null,
			slowEma[index] ?? null,
			atr[index] ?? null,
		);

		if (proposal === null) {
			sessions.push({
				sessionDate: bar.sessionDate,
				regime: 'undefined',
				transition: null,
			});
			continue;
		}

		const advance = advanceRegimeState(state, proposal, bar.sessionDate);
		state = advance.state;
		sessions.push({
			sessionDate: bar.sessionDate,
			regime: state.settled ?? proposal,
			transition: advance.transition,
		});
	}

	return sessions;
}

export function advanceRegimeState(
	state: RegimeState,
	proposal: ReadableRegime | null,
	sessionDate: SessionDate,
): RegimeAdvance {
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

	const confirmingSessionDates = collectConfirmingSessionDates(
		state.pending,
		proposal,
		sessionDate,
	);
	const isConfirmed =
		confirmingSessionDates.length >= REGIME_CONFIGURATION_V1.transitionConfirmations;

	if (!isConfirmed) {
		return {
			state: {
				settled: state.settled,
				pending: { regime: proposal, confirmingSessionDates },
			},
			transition: null,
		};
	}

	const confirmedSessionDates = requireThreeConfirmingSessionDates(confirmingSessionDates);
	const transition = createRegimeTransition(state.settled, proposal, confirmedSessionDates);

	return {
		state: { settled: proposal, pending: null },
		transition,
	};
}

function collectConfirmingSessionDates(
	pending: PendingRegime | null,
	proposal: ReadableRegime,
	sessionDate: SessionDate,
): readonly SessionDate[] {
	if (pending?.regime !== proposal) {
		return [sessionDate];
	}

	return [...pending.confirmingSessionDates, sessionDate];
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

function requireThreeConfirmingSessionDates(
	sessionDates: readonly SessionDate[],
): ConfirmingSessionDates {
	if (sessionDates.length !== 3) {
		throw new Error('Regime transition requires exactly three confirming sessions.');
	}

	return [sessionDates[0]!, sessionDates[1]!, sessionDates[2]!];
}
