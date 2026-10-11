import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type {
	ConfirmedSwing,
	MarketStructureSession,
	StructureClassification,
} from './market-structure.types.ts';

const { confirmationBars } = ANALYSIS_CONFIGURATION.marketStructure;

/**
 * Describes confirmed swings and Structure at each completed session.
 * A swing appears only on its confirmation session, three input bars after it occurred.
 * The string `undefined` represents insufficient or invalidated structure; `hasSwingPairs`
 * tells them apart.
 * Expects completed Daily Bars ordered oldest to newest with unique session dates.
 */
export function calculateMarketStructure(
	bars: readonly DailyBar[],
): readonly MarketStructureSession[] {
	const sessions: MarketStructureSession[] = [];
	let previousHigh: ConfirmedSwing | null = null;
	let latestHigh: ConfirmedSwing | null = null;
	let previousLow: ConfirmedSwing | null = null;
	let latestLow: ConfirmedSwing | null = null;
	let isTrendExpired = false;

	for (let index = 0; index < bars.length; index += 1) {
		const bar = bars[index]!;
		const newlyConfirmedSwings = detectNewlyConfirmedSwings(bars, index);

		for (const swing of newlyConfirmedSwings) {
			if (swing.kind === 'high') {
				previousHigh = latestHigh;
				latestHigh = swing;
			} else {
				previousLow = latestLow;
				latestLow = swing;
			}
		}

		if (newlyConfirmedSwings.length > 0) {
			isTrendExpired = false;
		}

		const candidateStructure = classifyStructure(
			previousHigh,
			latestHigh,
			previousLow,
			latestLow,
		);
		const hasBrokenDefiningSwing = checkIfTrendExpired(
			candidateStructure,
			bar.close,
			latestHigh,
			latestLow,
		);

		if (hasBrokenDefiningSwing) {
			isTrendExpired = true;
		}

		const structure = isTrendExpired ? 'undefined' : candidateStructure;
		const hasSwingPairs = previousHigh !== null && previousLow !== null;
		sessions.push({
			sessionDate: bar.sessionDate,
			structure,
			hasSwingPairs,
			newlyConfirmedSwings,
		});
	}

	return sessions;
}

function detectNewlyConfirmedSwings(
	bars: readonly DailyBar[],
	confirmationIndex: number,
): readonly ConfirmedSwing[] {
	const candidateIndex = confirmationIndex - confirmationBars;

	if (candidateIndex < confirmationBars) {
		return [];
	}

	const candidate = bars[candidateIndex]!;
	let isSwingHigh = true;
	let isSwingLow = true;

	for (
		let neighbourIndex = candidateIndex - confirmationBars;
		neighbourIndex <= confirmationIndex;
		neighbourIndex += 1
	) {
		if (neighbourIndex === candidateIndex) {
			continue;
		}

		// Equal extremes form one swing at the last bar of the tie: earlier bars may tie the
		// candidate, later bars must not. A double top stays a level without duplicate swings.
		const neighbour = bars[neighbourIndex]!;
		const isEarlierNeighbour = neighbourIndex < candidateIndex;
		const isHighBeyondNeighbour = isEarlierNeighbour
			? candidate.high >= neighbour.high
			: candidate.high > neighbour.high;
		const isLowBeyondNeighbour = isEarlierNeighbour
			? candidate.low <= neighbour.low
			: candidate.low < neighbour.low;
		isSwingHigh = isSwingHigh && isHighBeyondNeighbour;
		isSwingLow = isSwingLow && isLowBeyondNeighbour;
	}

	const newlyConfirmedSwings: ConfirmedSwing[] = [];
	const occurredAtSession = candidate.sessionDate;
	const confirmedAtSession = bars[confirmationIndex]!.sessionDate;

	if (isSwingHigh) {
		newlyConfirmedSwings.push({
			kind: 'high',
			price: candidate.high,
			occurredAtSession,
			confirmedAtSession,
		});
	}

	if (isSwingLow) {
		newlyConfirmedSwings.push({
			kind: 'low',
			price: candidate.low,
			occurredAtSession,
			confirmedAtSession,
		});
	}

	return newlyConfirmedSwings;
}

function classifyStructure(
	previousHigh: ConfirmedSwing | null,
	latestHigh: ConfirmedSwing | null,
	previousLow: ConfirmedSwing | null,
	latestLow: ConfirmedSwing | null,
): StructureClassification {
	if (!previousHigh || !latestHigh || !previousLow || !latestLow) {
		return 'undefined';
	}

	const hasHigherHighs = latestHigh.price > previousHigh.price;
	const hasHigherLows = latestLow.price > previousLow.price;
	const hasLowerHighs = latestHigh.price < previousHigh.price;
	const hasLowerLows = latestLow.price < previousLow.price;

	if (hasHigherHighs && hasHigherLows) {
		return 'uptrend';
	}

	if (hasLowerHighs && hasLowerLows) {
		return 'downtrend';
	}

	return 'range';
}

function checkIfTrendExpired(
	structure: StructureClassification,
	close: number,
	latestHigh: ConfirmedSwing | null,
	latestLow: ConfirmedSwing | null,
): boolean {
	if (structure === 'uptrend' && latestLow) {
		return close < latestLow.price;
	}

	if (structure === 'downtrend' && latestHigh) {
		return close > latestHigh.price;
	}

	return false;
}
