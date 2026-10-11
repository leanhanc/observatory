import { describe, expect, test } from 'bun:test';

import {
	calculateAtr,
	calculateEma,
	calculateMarketStructure,
	calculateRegime,
	calculateRsi,
	detectStructureBreakEvents,
} from '#modules/technical-analysis/index.ts';
import { buildBars, loadGgalFixture } from '#modules/technical-analysis/tests/support/index.ts';

import { calculateInstrumentStates } from './index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { MarketStructureSession } from '#modules/technical-analysis/index.ts';

describe('calculateInstrumentStates', () => {
	test('returns no States for empty input', () => {
		expect(calculateInstrumentStates([])).toEqual([]);
	});

	test('returns one State per bar in input order from frozen input', async () => {
		const bars = deepFreeze(await loadGgalFixture());
		const states = calculateInstrumentStates(bars);

		expect(states.map((state) => state.sessionDate)).toEqual(
			bars.map((bar) => bar.sessionDate),
		);
	});

	test('a State holds only its parts and no Events', async () => {
		const bars = await loadGgalFixture();
		const states = calculateInstrumentStates(bars);
		const breakIndex = detectStructureBreakEvents(bars).findIndex(
			(session) => session.event !== null,
		);

		expect(breakIndex).toBeGreaterThanOrEqual(0);
		expect(Object.keys(states[breakIndex]!).toSorted()).toEqual([
			'priceRelativeToEmaInAtr',
			'regime',
			'rsi',
			'sessionDate',
			'structure',
		]);
	});

	test('a short history has States whose parts warm up on their own periods', () => {
		const bars = buildBars(Array.from({ length: 30 }, (_, index) => 100 + index));
		const states = calculateInstrumentStates(bars);

		expect(states).toHaveLength(30);
		expect(states.every((state) => state.regime === null)).toBe(true);
		expect(states.every((state) => state.structure === null)).toBe(true);
		expect(states.slice(0, 14).every((state) => state.rsi === null)).toBe(true);
		expect(states.slice(14).every((state) => state.rsi === 100)).toBe(true);
		expect(states.slice(0, 19).every((state) => state.priceRelativeToEmaInAtr === null)).toBe(
			true,
		);
		expect(states.slice(19).every((state) => state.priceRelativeToEmaInAtr! > 0)).toBe(true);
	});

	test('measures RSI(14) and (close − EMA20) / ATR14 at every session', async () => {
		const bars = await loadGgalFixture();
		const closes = bars.map((bar) => bar.close);
		const rsi14 = calculateRsi(closes, 14);
		const ema20 = calculateEma(closes, 20);
		const atr14 = calculateAtr(bars, 14);
		const states = calculateInstrumentStates(bars);

		states.forEach((state, index) => {
			const ema = ema20[index]!;
			const atr = atr14[index]!;
			const expectedDistance =
				ema === null || atr === null ? null : (closes[index]! - ema) / atr;

			expect(state.rsi).toBe(rsi14[index]!);
			expect(state.priceRelativeToEmaInAtr).toBe(expectedDistance);
		});
		expect(states.some((state) => state.priceRelativeToEmaInAtr! < 0)).toBe(true);
	});

	test('reports Regime labels, with unavailable Regime as null', async () => {
		const bars = await loadGgalFixture();
		const regimes = calculateRegime(bars);
		const states = calculateInstrumentStates(bars);

		states.forEach((state, index) => {
			const regime = regimes[index]!.regime;
			const expectedRegime = regime === 'undefined' ? null : regime;

			expect(state.regime).toBe(expectedRegime);
		});
		expect(states.some((state) => state.regime === null)).toBe(true);
		expect(states.some((state) => state.regime !== null)).toBe(true);
	});

	test('reports Structure before swing pairs as null and an expired trend as undefined', async () => {
		const bars = await loadGgalFixture();
		const structures = calculateMarketStructure(bars);
		const states = calculateInstrumentStates(bars);
		const firstAvailableIndex = structures.findIndex((session) => session.hasSwingPairs);
		const warmUpStates = states.slice(0, firstAvailableIndex);
		const availableStates = states.slice(firstAvailableIndex);

		expect(firstAvailableIndex).toBeGreaterThan(0);
		expect(warmUpStates.every((state) => state.structure === null)).toBe(true);
		expect(availableStates.map((state) => state.structure)).toEqual(
			structures.slice(firstAvailableIndex).map((session) => session.structure),
		);
		expect(availableStates.some((state) => state.structure === 'undefined')).toBe(true);
	});

	test('a flat close is a readable mixed Regime and zero distance, with no RSI', () => {
		const states = calculateInstrumentStates(buildBars(Array(205).fill(100)));
		const lastState = states.at(-1)!;

		expect(lastState.regime).toBe('mixed');
		expect(lastState.priceRelativeToEmaInAtr).toBe(0);
		expect(states.every((state) => state.rsi === null)).toBe(true);
	});

	test('zero ATR leaves the distance unavailable instead of NaN or zero', () => {
		const bars = buildBars(Array(30).fill(100)).map((bar) => ({ ...bar, high: 100, low: 100 }));
		const states = calculateInstrumentStates(bars);

		expect(states.every((state) => state.priceRelativeToEmaInAtr === null)).toBe(true);
	});

	test('every prefix replays the full-history State at the same session', async () => {
		const bars = await loadGgalFixture();
		const states = calculateInstrumentStates(bars);

		bars.forEach((_, index) => {
			const prefixStates = calculateInstrumentStates(bars.slice(0, index + 1));

			expect(prefixStates.at(-1)).toEqual(states[index]);
		});
	});

	test('a swing confirmed later does not reach back to sessions before confirmation', async () => {
		const bars = await loadGgalFixture();
		const states = calculateInstrumentStates(bars);
		const structures = calculateMarketStructure(bars);
		const confirmationIndex = findStructureChangingConfirmation(structures);
		const confirmedSwing = structures[confirmationIndex]!.newlyConfirmedSwings[0]!;
		const occurrenceIndex = bars.findIndex(
			(bar) => bar.sessionDate === confirmedSwing.occurredAtSession,
		);

		expect(occurrenceIndex).toBeGreaterThanOrEqual(0);
		expect(occurrenceIndex).toBeLessThan(confirmationIndex);
		expect(states[confirmationIndex]!.structure).not.toBe(
			states[confirmationIndex - 1]!.structure,
		);

		for (let index = occurrenceIndex; index < confirmationIndex; index += 1) {
			const truncatedStates = calculateInstrumentStates(bars.slice(0, index + 1));

			expect(states[index]).toEqual(truncatedStates.at(-1));
		}
	});
});

function findStructureChangingConfirmation(structures: readonly MarketStructureSession[]): number {
	const confirmationIndex = structures.findIndex(
		(session, index) =>
			index > 0 &&
			session.newlyConfirmedSwings.length > 0 &&
			session.structure !== structures[index - 1]?.structure,
	);

	if (confirmationIndex === -1) {
		throw new Error('Fixture has no Structure change at a swing confirmation');
	}

	return confirmationIndex;
}

function deepFreeze(bars: readonly DailyBar[]): readonly DailyBar[] {
	return Object.freeze(bars.map((bar) => Object.freeze({ ...bar })));
}
