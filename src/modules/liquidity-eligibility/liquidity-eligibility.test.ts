import { describe, expect, test } from 'bun:test';

import { evaluateLiquidityEligibility, selectLiquidityWindow } from './index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { MepRateSession } from '#modules/dollarized-series/index.ts';
import type { LiquidityWindow } from './index.ts';

// 200 consecutive calendar days stand in for market sessions; only their order matters.
const sessionDates = Array.from({ length: 200 }, (_, index) =>
	Temporal.PlainDate.from('2026-01-01').add({ days: index }).toString(),
);
// A rate of 1000 makes a peso close of 1000 one dollar, so `volume` is the traded value in USD.
const flatMepRates = sessionDates.map((sessionDate) => ({ sessionDate, mepRate: 1000 }));
const fullWindow = selectRequiredWindow(flatMepRates, sessionDates[149]!);
const fullWindowDates = fullWindow.marketSessions.map((rate) => rate.sessionDate);

describe('selectLiquidityWindow', () => {
	test('selects the last 125 market sessions through the evaluated session', () => {
		expect(fullWindowDates).toHaveLength(125);
		expect(fullWindowDates[0]).toBe(sessionDates[25]);
		expect(fullWindowDates.at(-1)).toBe(sessionDates[149]);
	});

	test('ends at the previous market session when the evaluated session has no MEP Rate', () => {
		const ratesWithoutEvaluatedSession = flatMepRates.filter(
			(rate) => rate.sessionDate !== sessionDates[149],
		);
		const window = selectRequiredWindow(ratesWithoutEvaluatedSession, sessionDates[149]!);

		expect(window.marketSessions.at(-1)?.sessionDate).toBe(sessionDates[148]);
		expect(window.marketSessions).toHaveLength(125);
	});

	test('fails rather than shortening the window when fewer than 125 market sessions exist', () => {
		expect(selectLiquidityWindow(flatMepRates, sessionDates[123]!)).toEqual({
			ok: false,
			reason: 'insufficient-market-sessions',
			marketSessionCount: 124,
		});
	});
});

describe('evaluateLiquidityEligibility', () => {
	test('is eligible exactly at both thresholds', () => {
		const tenSessionCriteria = {
			windowSessions: 10,
			minimumParticipation: 0.9,
			minimumMedianTradedValueUsd: 50_000,
		};
		const selection = selectLiquidityWindow(flatMepRates, sessionDates[9]!, tenSessionCriteria);

		if (!selection.ok) {
			throw new Error('Expected a ten-session window.');
		}

		const bars = sessionDates.slice(1, 10).map((date) => createUsdBar(date, 50_000));

		expect(evaluateLiquidityEligibility(bars, selection.window, tenSessionCriteria)).toEqual({
			isEligible: true,
			measures: { participation: 0.9, medianDailyTradedValueUsd: 50_000 },
		});
	});

	test('is ineligible one traded session below the participation threshold', () => {
		// 113 of 125 sessions is 90.4%; 112 is 89.6%, the first count below 90%.
		const bars = fullWindowDates.slice(13).map((date) => createUsdBar(date, 1_000_000));
		const result = evaluateLiquidityEligibility(bars, fullWindow);

		expect(result.measures.participation).toBe(112 / 125);
		expect(result.isEligible).toBe(false);
	});

	test('is eligible at 113 of 125 traded sessions', () => {
		const bars = fullWindowDates.slice(12).map((date) => createUsdBar(date, 1_000_000));

		expect(evaluateLiquidityEligibility(bars, fullWindow).isEligible).toBe(true);
	});

	test('is ineligible just below the value threshold', () => {
		const bars = fullWindowDates.map((date) => createUsdBar(date, 49_999.99));
		const result = evaluateLiquidityEligibility(bars, fullWindow);

		expect(result.measures).toEqual({
			participation: 1,
			medianDailyTradedValueUsd: 49_999.99,
		});
		expect(result.isEligible).toBe(false);
	});

	test('values each session at its own MEP Rate', () => {
		const twoSessionCriteria = {
			windowSessions: 2,
			minimumParticipation: 0.9,
			minimumMedianTradedValueUsd: 50_000,
		};
		const window = {
			marketSessions: [
				{ sessionDate: '2026-01-05', mepRate: 1000 },
				{ sessionDate: '2026-01-06', mepRate: 2000 },
			],
		};
		const bars = [
			createPesoBar('2026-01-05', 1000, 100),
			createPesoBar('2026-01-06', 3000, 100),
		];

		// USD 100 and USD 150. Valuing both at the last rate would give 50 and 150 (median 100);
		// at the first rate, 100 and 300 (median 200).
		expect(evaluateLiquidityEligibility(bars, window, twoSessionCriteria).measures).toEqual({
			participation: 1,
			medianDailyTradedValueUsd: 125,
		});
	});

	test('penalizes a line listed inside the window', () => {
		const bars = fullWindowDates.slice(63).map((date) => createUsdBar(date, 1_000_000));
		const result = evaluateLiquidityEligibility(bars, fullWindow);

		expect(result.measures.participation).toBe(62 / 125);
		expect(result.isEligible).toBe(false);
	});

	test('counts zero-volume and missing bars as not traded, with no value', () => {
		const bars = fullWindowDates
			.filter((date) => date !== fullWindowDates[10])
			.map((date) =>
				date === fullWindowDates[20] ? createUsdBar(date, 0) : createUsdBar(date, 60_000),
			);
		const result = evaluateLiquidityEligibility(bars, fullWindow);

		expect(result.measures).toEqual({
			participation: 123 / 125,
			medianDailyTradedValueUsd: 60_000,
		});
	});

	test('ignores a bar on a session without a MEP Rate inside the window', () => {
		// Removing a session's rate keeps the window's first and last dates, so a bar on that
		// session falls between them without being a market session.
		const offCalendarDate = sessionDates[100]!;
		const ratesWithoutSession = flatMepRates.filter(
			(rate) => rate.sessionDate !== offCalendarDate,
		);
		const window = selectRequiredWindow(ratesWithoutSession, sessionDates[149]!);
		const windowDates = window.marketSessions.map((rate) => rate.sessionDate);
		const bars = [...windowDates.slice(-10), offCalendarDate]
			.toSorted()
			.map((date) =>
				date === offCalendarDate ? createUsdBar(date, 1e9) : createUsdBar(date, 10_000),
			);

		expect(windowDates[0]! < offCalendarDate).toBe(true);
		expect(evaluateLiquidityEligibility(bars, window).measures).toEqual({
			participation: 10 / 125,
			medianDailyTradedValueUsd: 10_000,
		});
	});

	test('keeps the median when one block trade dwarfs every other session', () => {
		const bars = fullWindowDates.map((date, index) =>
			createUsdBar(date, index === 60 ? 10_000_000 : 10_000),
		);
		const result = evaluateLiquidityEligibility(bars, fullWindow);

		expect(result.measures.medianDailyTradedValueUsd).toBe(10_000);
		expect(result.isEligible).toBe(false);
	});

	test('takes the mean of the two middle values with an even count of traded sessions', () => {
		const tradedValues = [10_000, 20_000, 60_000, 90_000];
		const bars = tradedValues.map((value, index) =>
			createUsdBar(fullWindowDates[index]!, value),
		);

		expect(
			evaluateLiquidityEligibility(bars, fullWindow).measures.medianDailyTradedValueUsd,
		).toBe(40_000);
	});

	test('reports a null median, not zero, when the line never traded in the window', () => {
		const barsBeforeWindow = sessionDates.slice(0, 25).map((date) => createUsdBar(date, 1e9));

		expect(evaluateLiquidityEligibility(barsBeforeWindow, fullWindow)).toEqual({
			isEligible: false,
			measures: { participation: 0, medianDailyTradedValueUsd: null },
		});
	});

	test('does not change when later bars and MEP Rates are known', () => {
		const evaluatedSession = sessionDates[149]!;
		const barsThroughSession = sessionDates
			.slice(0, 150)
			.map((date, index) => createUsdBar(date, index % 3 === 0 ? 0 : 40_000));
		const laterHeavyBars = sessionDates.slice(150).map((date) => createUsdBar(date, 1e9));
		const allBars = [...barsThroughSession, ...laterHeavyBars];

		const knownThen = evaluateLiquidityEligibility(
			barsThroughSession,
			selectRequiredWindow(flatMepRates.slice(0, 150), evaluatedSession),
		);
		const knownLater = evaluateLiquidityEligibility(
			allBars,
			selectRequiredWindow(flatMepRates, evaluatedSession),
		);

		expect(knownLater).toEqual(knownThen);
	});
});

function selectRequiredWindow(
	mepRates: readonly MepRateSession[],
	evaluatedSessionDate: string,
): LiquidityWindow {
	const selection = selectLiquidityWindow(mepRates, evaluatedSessionDate);

	if (!selection.ok) {
		throw new Error(`Expected a full window through ${evaluatedSessionDate}.`);
	}

	return selection.window;
}

/** A bar whose traded value is `valueUsd` at the flat test rate of 1000. */
function createUsdBar(sessionDate: string, valueUsd: number): DailyBar {
	return createPesoBar(sessionDate, 1000, valueUsd);
}

function createPesoBar(sessionDate: string, close: number, volume: number): DailyBar {
	return { sessionDate, open: close, high: close, low: close, close, volume };
}
