import { analyzeRegime } from './regime-engine.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { RegimeSession } from './regime.types.ts';

/**
 * Describes the broad price context for each completed session.
 * Expects complete, validated Daily Bars ordered oldest to newest.
 * The string `undefined` represents unavailable measurements.
 */
export function calculateRegime(bars: readonly DailyBar[]): readonly RegimeSession[] {
	return analyzeRegime(bars).map(({ sessionDate, regime }) => ({ sessionDate, regime }));
}
