import type { DailyBar } from '../../bar-history.types.ts';
import type { PriceAdjustment, PriceRevision } from './bar-history-adjustment-detector.types.ts';

// Adjusted prices are rounded by the provider, so ratios of the same adjustment differ slightly.
const ADJUSTMENT_RATIO_TOLERANCE = 0.001;
// One changed bar scaled by some ratio is indistinguishable from an ordinary correction.
const MINIMUM_BARS_PER_ADJUSTMENT = 2;

type BarPair = Readonly<{ stored: DailyBar; fetched: DailyBar }>;

type AdjustmentStep = Readonly<{
	cumulativeRatio: number;
	pairs: readonly BarPair[];
}>;

/**
 * Classifies how refetched bars differ from stored bars on the sessions both contain.
 *
 * A provider adjustment multiplies every bar up to a session by one price ratio below 1 and
 * leaves later bars untouched: distributions and forward splits both lower past prices. Several
 * adjustments since the last check form a staircase in which each earlier step carries the
 * product of every later adjustment. Anything else is reported as corrections, including an
 * adjustment combined with a correction, a ratio at or above 1, and a step boundary that falls on
 * a stored session the refetch omitted. A changed volume marks a bar as changed, but the
 * classification reads only prices, so an adjusted bar may keep or change its volume. Open BYMADATA
 * has not been seen rescaling volume, even for the splits whose prices it adjusted.
 */
export function detectAdjustmentOrCorrection(
	storedBars: readonly DailyBar[],
	fetchedBars: readonly DailyBar[],
): PriceRevision {
	const pairs = pairBarsBySession(storedBars, fetchedBars);
	const changedPairs = pairs.filter(checkIfPairChanged);
	const latestChangedPair = changedPairs.at(-1);

	if (!latestChangedPair) {
		return { kind: 'unchanged' };
	}

	const corrections: PriceRevision = {
		kind: 'corrections',
		sessionDates: changedPairs.map((pair) => pair.fetched.sessionDate),
	};
	const pairsThroughLatestChange = pairs.filter(
		(pair) => pair.fetched.sessionDate <= latestChangedPair.fetched.sessionDate,
	);
	const isEveryBarRepriced = pairsThroughLatestChange.every(checkIfPricesChanged);

	if (!isEveryBarRepriced) {
		return corrections;
	}

	const steps = groupPairsIntoSteps(pairsThroughLatestChange);
	const adjustments = convertStepsToAdjustments(steps);
	const isEveryStepUniform = steps.every(checkIfStepIsUniform);
	const isEveryAdjustmentLoweringPrices = adjustments.every(
		(adjustment) => adjustment.ratio < 1 - ADJUSTMENT_RATIO_TOLERANCE,
	);
	const hasAmbiguousBoundary = checkIfAnyBoundaryIsAmbiguous(steps, pairs, storedBars);
	const isAdjustment =
		isEveryStepUniform && isEveryAdjustmentLoweringPrices && !hasAmbiguousBoundary;

	if (!isAdjustment) {
		return corrections;
	}

	return { kind: 'adjustments', adjustments };
}

function pairBarsBySession(
	storedBars: readonly DailyBar[],
	fetchedBars: readonly DailyBar[],
): readonly BarPair[] {
	const storedBarsBySession = new Map(storedBars.map((bar) => [bar.sessionDate, bar]));

	return fetchedBars
		.flatMap((fetched) => {
			const stored = storedBarsBySession.get(fetched.sessionDate);
			return stored ? [{ stored, fetched }] : [];
		})
		.toSorted((left, right) =>
			left.fetched.sessionDate.localeCompare(right.fetched.sessionDate),
		);
}

function checkIfPairChanged(pair: BarPair): boolean {
	return checkIfPricesChanged(pair) || pair.stored.volume !== pair.fetched.volume;
}

function checkIfPricesChanged({ stored, fetched }: BarPair): boolean {
	return (
		stored.open !== fetched.open ||
		stored.high !== fetched.high ||
		stored.low !== fetched.low ||
		stored.close !== fetched.close
	);
}

function groupPairsIntoSteps(pairs: readonly BarPair[]): readonly AdjustmentStep[] {
	const groups: BarPair[][] = [];

	for (const pair of pairs) {
		const currentGroup = groups.at(-1);
		const firstPairOfGroup = currentGroup?.[0];
		const continuesCurrentGroup =
			firstPairOfGroup !== undefined &&
			checkIfRatiosMatch(calculateCloseRatio(pair), calculateCloseRatio(firstPairOfGroup));

		if (currentGroup && continuesCurrentGroup) {
			currentGroup.push(pair);
			continue;
		}

		groups.push([pair]);
	}

	return groups.map((group) => ({ cumulativeRatio: estimateStepRatio(group), pairs: group }));
}

function calculateCloseRatio({ stored, fetched }: BarPair): number {
	return fetched.close / stored.close;
}

// Pooling every price of the step limits the effect of the provider's rounding on any one price.
function estimateStepRatio(pairs: readonly BarPair[]): number {
	const storedTotal = pairs.reduce((total, pair) => total + sumPrices(pair.stored), 0);
	const fetchedTotal = pairs.reduce((total, pair) => total + sumPrices(pair.fetched), 0);

	return fetchedTotal / storedTotal;
}

function sumPrices(bar: DailyBar): number {
	return bar.open + bar.high + bar.low + bar.close;
}

function checkIfStepIsUniform(step: AdjustmentStep): boolean {
	const hasEnoughBars = step.pairs.length >= MINIMUM_BARS_PER_ADJUSTMENT;
	const isEveryPriceOnRatio = step.pairs.every((pair) =>
		checkIfPricesShareRatio(pair, step.cumulativeRatio),
	);

	return hasEnoughBars && isEveryPriceOnRatio;
}

function checkIfPricesShareRatio({ stored, fetched }: BarPair, ratio: number): boolean {
	const priceRatios = [
		fetched.open / stored.open,
		fetched.high / stored.high,
		fetched.low / stored.low,
		fetched.close / stored.close,
	];

	return priceRatios.every((priceRatio) => checkIfRatiosMatch(priceRatio, ratio));
}

function checkIfRatiosMatch(ratio: number, referenceRatio: number): boolean {
	return Math.abs(ratio - referenceRatio) <= referenceRatio * ADJUSTMENT_RATIO_TOLERANCE;
}

// Each step carries the product of its own adjustment and every later one, so dividing by the next
// step's cumulative ratio isolates the adjustment that ends at this step.
function convertStepsToAdjustments(steps: readonly AdjustmentStep[]): readonly PriceAdjustment[] {
	return steps.map((step, index) => {
		const laterCumulativeRatio = steps[index + 1]?.cumulativeRatio ?? 1;
		const latestPair = step.pairs.at(-1)!;

		return {
			ratio: step.cumulativeRatio / laterCumulativeRatio,
			adjustedThroughSession: latestPair.fetched.sessionDate,
		};
	});
}

// A stored session the refetch omitted, lying between a step's last bar and the next refetched
// bar, could belong to either side, so the adjustment's last session is unknown.
function checkIfAnyBoundaryIsAmbiguous(
	steps: readonly AdjustmentStep[],
	pairs: readonly BarPair[],
	storedBars: readonly DailyBar[],
): boolean {
	const pairedSessionDates = pairs.map((pair) => pair.fetched.sessionDate);
	const pairedSessionDateSet = new Set(pairedSessionDates);
	const omittedSessionDates = storedBars
		.map((bar) => bar.sessionDate)
		.filter((sessionDate) => !pairedSessionDateSet.has(sessionDate));

	return steps.some((step) => {
		const boundarySessionDate = step.pairs.at(-1)!.fetched.sessionDate;
		const nextPairedSessionDate = pairedSessionDates.find(
			(sessionDate) => sessionDate > boundarySessionDate,
		);

		return omittedSessionDates.some(
			(sessionDate) =>
				sessionDate > boundarySessionDate &&
				(nextPairedSessionDate === undefined || sessionDate < nextPairedSessionDate),
		);
	});
}
