import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';

import { calculateAtr } from '../atr/index.ts';
import { calculateTrueRange } from '../true-range/index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { VolatileSessionEvent, VolatileSessionRow } from './volatile-session.types.ts';

const { atrPeriod, atrMultipleThreshold } = ANALYSIS_CONFIGURATION.volatileSession;

/**
 * Detects Volatile Sessions: sessions whose True Range, gaps included, is more than the configured
 * multiple of the ATR known before the session. Direction-neutral, and relative to the line's own
 * recent range.
 * Expects validated completed Daily Bars ordered oldest to newest.
 * A null Event includes unavailable evaluation; it does not imply quiet conditions.
 */
export function detectVolatileSessionEvents(
	bars: readonly DailyBar[],
): readonly VolatileSessionRow[] {
	const trueRanges = calculateTrueRange(bars);
	const atr = calculateAtr(bars, atrPeriod);

	return bars.map((bar, index) => ({
		sessionDate: bar.sessionDate,
		event: detectVolatileSession(
			trueRanges[index]!,
			atr[index - 1],
			bars[index - 1]?.sessionDate,
		),
	}));
}

function detectVolatileSession(
	trueRange: number,
	baselineAtr: number | null | undefined,
	baselineThroughSessionDate: string | undefined,
): VolatileSessionEvent | null {
	const hasReadableBaseline =
		baselineAtr != null && Number.isFinite(baselineAtr) && baselineAtr > 0;

	if (!hasReadableBaseline || baselineThroughSessionDate === undefined) {
		return null;
	}

	const atrMultiple = trueRange / baselineAtr;
	const isReadable = Number.isFinite(trueRange) && Number.isFinite(atrMultiple);
	const isVolatile = atrMultiple > atrMultipleThreshold;

	if (!isReadable || !isVolatile) {
		return null;
	}

	return {
		type: 'volatile-session',
		trueRange,
		baselineAtr,
		baselineThroughSessionDate,
		atrMultiple,
	};
}
