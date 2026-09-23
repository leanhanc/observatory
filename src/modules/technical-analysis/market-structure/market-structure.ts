import type { DailyBar } from '#modules/bar-history/index.ts';
import type {
	ConfirmedSwing,
	MarketStructureSession,
	StructureClassification,
} from './market-structure.types.ts';

const CONFIRMATION_BARS = 3;

/**
 * Describes confirmed swings and Structure at each completed session.
 * A swing appears only on its confirmation session, three input bars after it occurred.
 * The string `undefined` represents insufficient or invalidated structure.
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
		sessions.push({ sessionDate: bar.sessionDate, structure, newlyConfirmedSwings });
	}

	return sessions;
}

function detectNewlyConfirmedSwings(
	bars: readonly DailyBar[],
	confirmationIndex: number,
): readonly ConfirmedSwing[] {
	const candidateIndex = confirmationIndex - CONFIRMATION_BARS;

	if (candidateIndex < CONFIRMATION_BARS) {
		return [];
	}

	const candidate = bars[candidateIndex]!;
	let isUniqueHigh = true;
	let isUniqueLow = true;

	for (
		let neighbourIndex = candidateIndex - CONFIRMATION_BARS;
		neighbourIndex <= confirmationIndex;
		neighbourIndex += 1
	) {
		if (neighbourIndex === candidateIndex) {
			continue;
		}

		const neighbour = bars[neighbourIndex]!;
		isUniqueHigh = isUniqueHigh && candidate.high > neighbour.high;
		isUniqueLow = isUniqueLow && candidate.low < neighbour.low;
	}

	const newlyConfirmedSwings: ConfirmedSwing[] = [];
	const occurredAtSession = candidate.sessionDate;
	const confirmedAtSession = bars[confirmationIndex]!.sessionDate;

	if (isUniqueHigh) {
		newlyConfirmedSwings.push({
			kind: 'high',
			price: candidate.high,
			occurredAtSession,
			confirmedAtSession,
		});
	}

	if (isUniqueLow) {
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
