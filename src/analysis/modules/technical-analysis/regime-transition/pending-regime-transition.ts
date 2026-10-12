import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';

import { analyzeRegime } from '../regime/regime-engine.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { PendingRegime } from '../regime/regime-engine.ts';
import type {
	PendingRegimeTransition,
	PendingRegimeTransitionSession,
} from './regime-transition.types.ts';

/**
 * Reports, for each completed session, the Regime proposal that is part-way through confirmation,
 * or `null` when there is none or the session's Regime is unavailable.
 * Expects complete, validated Daily Bars ordered oldest to newest.
 */
export function calculatePendingRegimeTransitions(
	bars: readonly DailyBar[],
): readonly PendingRegimeTransitionSession[] {
	return analyzeRegime(bars).map(({ sessionDate, pending }) => ({
		sessionDate,
		pending: pending === null ? null : describePendingRegime(pending),
	}));
}

function describePendingRegime(pending: PendingRegime): PendingRegimeTransition {
	return {
		candidate: pending.regime,
		confirmations: pending.proposalSessionDates.length,
		requiredConfirmations: ANALYSIS_CONFIGURATION.regime.transitionConfirmations,
	};
}
