import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';

import { calculateAtr } from '../atr/index.ts';
import { calculateTrueRange } from '../true-range/index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type {
	VolatilityExpansionEvent,
	VolatilityExpansionSession,
} from './volatility-expansion.types.ts';

const { atrPeriod, expansionThreshold } = ANALYSIS_CONFIGURATION.volatilityExpansion;

/**
 * Detects direction-neutral expansion against ATR known before each session.
 * Expects validated completed Daily Bars ordered oldest to newest.
 * A null Event includes unavailable evaluation; it does not imply quiet conditions.
 */
export function detectVolatilityExpansionEvents(
	bars: readonly DailyBar[],
): readonly VolatilityExpansionSession[] {
	const trueRanges = calculateTrueRange(bars);
	const atr = calculateAtr(bars, atrPeriod);

	return bars.map((bar, index) => ({
		sessionDate: bar.sessionDate,
		event: detectExpansion(trueRanges[index]!, atr[index - 1], bars[index - 1]?.sessionDate),
	}));
}

function detectExpansion(
	trueRange: number,
	baselineAtr: number | null | undefined,
	baselineThroughSessionDate: string | undefined,
): VolatilityExpansionEvent | null {
	const hasReadableBaseline =
		baselineAtr != null && Number.isFinite(baselineAtr) && baselineAtr > 0;

	if (!hasReadableBaseline || baselineThroughSessionDate === undefined) {
		return null;
	}

	const expansionMultiple = trueRange / baselineAtr;
	const isReadable = Number.isFinite(trueRange) && Number.isFinite(expansionMultiple);
	const isExpansion = expansionMultiple > expansionThreshold;

	if (!isReadable || !isExpansion) {
		return null;
	}

	return {
		type: 'volatility-expansion',
		trueRange,
		baselineAtr,
		baselineThroughSessionDate,
		expansionMultiple,
	};
}
