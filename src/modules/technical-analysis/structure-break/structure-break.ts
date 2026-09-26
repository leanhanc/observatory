import { calculateMarketStructure } from '../market-structure/index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { StructureClassification } from '../market-structure/index.ts';
import type { StructureBreakEvent, StructureBreakSession } from './structure-break.types.ts';

type ConfirmedHigh = Extract<StructureBreakEvent, { direction: 'upward' }>['definingSwing'];
type ConfirmedLow = Extract<StructureBreakEvent, { direction: 'downward' }>['definingSwing'];

/**
 * Detects breaks of directional Structure that existed on the previous completed session.
 * Expects completed Daily Bars ordered oldest to newest with unique session dates.
 */
export function detectStructureBreakEvents(
	bars: readonly DailyBar[],
): readonly StructureBreakSession[] {
	const structureSessions = calculateMarketStructure(bars);
	const sessions: StructureBreakSession[] = [];
	let latestConfirmedHigh: ConfirmedHigh | null = null;
	let latestConfirmedLow: ConfirmedLow | null = null;

	for (let index = 0; index < bars.length; index += 1) {
		const bar = bars[index]!;
		const previousStructure = structureSessions[index - 1]?.structure;
		const event = detectStructureBreak(
			previousStructure,
			bar.close,
			latestConfirmedHigh,
			latestConfirmedLow,
		);

		sessions.push({ sessionDate: bar.sessionDate, event });

		const currentStructure = structureSessions[index]!;
		for (const swing of currentStructure.newlyConfirmedSwings) {
			if (swing.kind === 'high') {
				latestConfirmedHigh = { ...swing, kind: 'high' };
			} else {
				latestConfirmedLow = { ...swing, kind: 'low' };
			}
		}
	}

	return sessions;
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
