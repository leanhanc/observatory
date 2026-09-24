import { calculateAtr } from '../atr/index.ts';
import { calculateEma } from '../ema/index.ts';
import { REGIME_CONFIGURATION_V1 } from './regime-configuration.ts';
import { advanceRegimeState, proposeRegime } from './regime-policy.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { RegimeState } from './regime-policy.ts';
import type { RegimeSession } from './regime.types.ts';

/**
 * Describes the broad price context for each completed session.
 * Expects complete, validated Daily Bars ordered oldest to newest.
 * The string `undefined` represents unavailable measurements.
 */
export function calculateRegime(bars: readonly DailyBar[]): readonly RegimeSession[] {
	const closes = bars.map((bar) => bar.close);
	const fastEma = calculateEma(closes, REGIME_CONFIGURATION_V1.fastEmaPeriod);
	const slowEma = calculateEma(closes, REGIME_CONFIGURATION_V1.slowEmaPeriod);
	const atr = calculateAtr(bars, REGIME_CONFIGURATION_V1.atrPeriod);

	const sessions: RegimeSession[] = [];
	let state: RegimeState = { settled: null, pending: null, pendingCount: 0 };

	for (const [index, bar] of bars.entries()) {
		const proposal = proposeRegime(
			bar.close,
			fastEma[index] ?? null,
			slowEma[index] ?? null,
			atr[index] ?? null,
		);

		if (proposal === null) {
			sessions.push({ sessionDate: bar.sessionDate, regime: 'undefined' });
			continue;
		}

		state = advanceRegimeState(state, proposal);
		const regime = state.settled ?? proposal;
		sessions.push({ sessionDate: bar.sessionDate, regime });
	}

	return sessions;
}
