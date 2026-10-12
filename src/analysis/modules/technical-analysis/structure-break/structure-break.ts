import { calculateMarketStructure, trackLatestConfirmedSwings } from '../market-structure/index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type {
	ConfirmedHigh,
	ConfirmedLow,
	LatestConfirmedSwings,
	StructureClassification,
} from '../market-structure/index.ts';
import type { StructureBreakEvent, StructureBreakSession } from './structure-break.types.ts';

const NO_CONFIRMED_SWINGS: LatestConfirmedSwings = Object.freeze({ high: null, low: null });

/**
 * Detects breaks of directional Structure that existed on the previous completed session.
 * Expects completed Daily Bars ordered oldest to newest with unique session dates.
 */
export function detectStructureBreakEvents(
	bars: readonly DailyBar[],
): readonly StructureBreakSession[] {
	const structureSessions = calculateMarketStructure(bars);
	const latestConfirmedSwings = trackLatestConfirmedSwings(structureSessions);

	// A break is judged against the Structure and swings known at the previous session, so a swing
	// confirmed on the current session cannot define a Structure the same close breaks.
	return bars.map((bar, index) => {
		const previousStructure = structureSessions[index - 1]?.structure;
		const previousSwings = latestConfirmedSwings[index - 1] ?? NO_CONFIRMED_SWINGS;
		const event = detectStructureBreak(
			previousStructure,
			bar.close,
			previousSwings.high,
			previousSwings.low,
		);

		return { sessionDate: bar.sessionDate, event };
	});
}

function detectStructureBreak(
	previousStructure: StructureClassification | undefined,
	closePrice: number,
	latestConfirmedHigh: ConfirmedHigh | null,
	latestConfirmedLow: ConfirmedLow | null,
): StructureBreakEvent | null {
	if (previousStructure === 'uptrend' && latestConfirmedLow) {
		if (closePrice >= latestConfirmedLow.price) {
			return null;
		}

		return {
			type: 'structure-break',
			direction: 'downward',
			priorStructure: previousStructure,
			definingSwing: latestConfirmedLow,
			closePrice,
		};
	}

	if (previousStructure === 'downtrend' && latestConfirmedHigh) {
		if (closePrice <= latestConfirmedHigh.price) {
			return null;
		}

		return {
			type: 'structure-break',
			direction: 'upward',
			priorStructure: previousStructure,
			definingSwing: latestConfirmedHigh,
			closePrice,
		};
	}

	return null;
}
