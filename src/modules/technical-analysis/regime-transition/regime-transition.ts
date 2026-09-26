import { analyzeRegime } from '../regime/regime-engine.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { RegimeTransitionSession } from './regime-transition.types.ts';

/**
 * Detects settled Regime changes on their third confirming readable session.
 * Expects complete, validated Daily Bars ordered oldest to newest.
 */
export function detectRegimeTransitionEvents(
	bars: readonly DailyBar[],
): readonly RegimeTransitionSession[] {
	return analyzeRegime(bars).map(({ sessionDate, transition }) => ({
		sessionDate,
		event: transition,
	}));
}
