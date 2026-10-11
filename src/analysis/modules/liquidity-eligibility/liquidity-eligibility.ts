import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { MepRateSession } from '#modules/dollarized-series/index.ts';
import type {
	LiquidityCriteria,
	LiquidityEligibility,
	LiquidityMeasures,
	LiquidityWindow,
	LiquidityWindowSelection,
} from './liquidity-eligibility.types.ts';

const LIQUIDITY_CRITERIA: LiquidityCriteria = ANALYSIS_CONFIGURATION.liquidityEligibility;

/**
 * Selects the last `windowSessions` market sessions on or before `evaluatedSessionDate`. A market
 * session is one with a MEP Rate: without a rate a session cannot be valued in dollars, so it
 * counts neither for nor against a line. Rates after the evaluated session are never selected.
 *
 * Fails with `insufficient-market-sessions` rather than measuring over a shorter window, because
 * a shorter window would change what participation means.
 *
 * Preconditions, not checked: `mepRates` are chronological with one row per session.
 */
export function selectLiquidityWindow(
	mepRates: readonly MepRateSession[],
	evaluatedSessionDate: string,
	criteria: LiquidityCriteria = LIQUIDITY_CRITERIA,
): LiquidityWindowSelection {
	const knownMarketSessions = mepRates.filter((rate) => rate.sessionDate <= evaluatedSessionDate);
	const hasFullWindow = knownMarketSessions.length >= criteria.windowSessions;

	if (!hasFullWindow) {
		return {
			ok: false,
			reason: 'insufficient-market-sessions',
			marketSessionCount: knownMarketSessions.length,
		};
	}

	return {
		ok: true,
		window: { marketSessions: knownMarketSessions.slice(-criteria.windowSessions) },
	};
}

/**
 * Decides whether one Trading Line trades regularly and heavily enough for indicators to describe
 * market behavior rather than sparse prints. It is a gate on two measures, not a score: the line
 * must reach both `minimumParticipation` and `minimumMedianTradedValueUsd`, inclusive.
 *
 * A session counts as traded when the line has a bar with volume above zero on it. Each traded
 * session is valued at `volume × close ÷ that session's MEP Rate`, and the median, not the mean,
 * keeps an occasional block trade from making a thin line look liquid.
 *
 * Bars outside the window do not count, so the result depends only on what was known at the
 * window's last session.
 *
 * Preconditions, not checked: `pesoLineBars` is a validated Daily Bar history of one peso line.
 */
export function evaluateLiquidityEligibility(
	pesoLineBars: readonly DailyBar[],
	window: LiquidityWindow,
	criteria: LiquidityCriteria = LIQUIDITY_CRITERIA,
): LiquidityEligibility {
	const measures = measureLiquidity(pesoLineBars, window);
	const { participation, medianDailyTradedValueUsd } = measures;
	const hasEnoughParticipation = participation >= criteria.minimumParticipation;
	const hasEnoughValue =
		medianDailyTradedValueUsd !== null &&
		medianDailyTradedValueUsd >= criteria.minimumMedianTradedValueUsd;

	return { isEligible: hasEnoughParticipation && hasEnoughValue, measures };
}

function measureLiquidity(
	pesoLineBars: readonly DailyBar[],
	window: LiquidityWindow,
): LiquidityMeasures {
	const mepRatesBySession = new Map(
		window.marketSessions.map((rate) => [rate.sessionDate, rate.mepRate]),
	);
	// Only bars on a window session count: a bar before or after the window, or on a session
	// without a MEP Rate inside it, has no rate here.
	const tradedValuesUsd = pesoLineBars.flatMap((bar) => {
		const mepRate = mepRatesBySession.get(bar.sessionDate);
		const isTradedWindowSession = mepRate !== undefined && bar.volume > 0;

		return isTradedWindowSession ? [(bar.volume * bar.close) / mepRate] : [];
	});

	return {
		participation: tradedValuesUsd.length / window.marketSessions.length,
		medianDailyTradedValueUsd: calculateMedian(tradedValuesUsd),
	};
}

function calculateMedian(values: readonly number[]): number | null {
	if (values.length === 0) {
		return null;
	}

	const sortedValues = values.toSorted((left, right) => left - right);
	const middleIndex = Math.floor(sortedValues.length / 2);
	const hasEvenCount = sortedValues.length % 2 === 0;

	if (hasEvenCount) {
		return (sortedValues[middleIndex - 1]! + sortedValues[middleIndex]!) / 2;
	}

	return sortedValues[middleIndex]!;
}
