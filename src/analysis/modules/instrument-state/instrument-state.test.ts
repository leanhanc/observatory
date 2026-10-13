import { describe, expect, test } from 'bun:test';

import {
	calculateAtr,
	calculateEma,
	calculateMarketStructure,
	calculatePendingRegimeTransitions,
	calculateRegime,
	calculateRegimeTippingCloses,
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
			'lastConfirmedSwingHigh',
			'lastConfirmedSwingLow',
			'pendingRegimeTransition',
			'priceRelativeToEmaInAtr',
			'priceRelativeToLongTermEmaInPercent',
			'regime',
			'regimeTippingCloses',
			'rsi',
			'sessionDate',
			'situations',
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
		expect(states.every((state) => state.priceRelativeToLongTermEmaInPercent === null)).toBe(
			true,
		);
	});

	test('the long-term distance is null exactly until EMA(200) is readable', () => {
		const shortStates = calculateInstrumentStates(buildRisingBars(199));
		const states = calculateInstrumentStates(buildRisingBars(201));
		const warmUpStates = states.slice(0, 199);
		const readableStates = states.slice(199);

		expect(
			shortStates.every((state) => state.priceRelativeToLongTermEmaInPercent === null),
		).toBe(true);
		expect(
			warmUpStates.every((state) => state.priceRelativeToLongTermEmaInPercent === null),
		).toBe(true);
		expect(
			readableStates.every((state) => state.priceRelativeToLongTermEmaInPercent! > 0),
		).toBe(true);
	});

	test('measures the close below its long-term EMA as a negative percentage', () => {
		const bars = buildBars([...Array<number>(199).fill(100), 95]);
		// EMA(200) seeds from the first close and folds in the last one with weight 2 / 201, so it is
		// 99.9502…, and the close of 95 sits 4.9527…% below it.
		const lastState = calculateInstrumentStates(bars).at(-1)!;

		expect(lastState.priceRelativeToLongTermEmaInPercent).toBeCloseTo(-4.952712792, 9);
	});

	test('measures (close − EMA200) / EMA200 × 100 at every session', async () => {
		const bars = await loadGgalFixture();
		const closes = bars.map((bar) => bar.close);
		const ema200 = calculateEma(closes, 200);
		const states = calculateInstrumentStates(bars);

		states.forEach((state, index) => {
			const ema = ema200[index]!;
			const expectedDistance = ema === null ? null : ((closes[index]! - ema) / ema) * 100;

			expect(state.priceRelativeToLongTermEmaInPercent).toBe(expectedDistance);
		});
		expect(states.some((state) => state.priceRelativeToLongTermEmaInPercent! < 0)).toBe(true);
		expect(states.some((state) => state.priceRelativeToLongTermEmaInPercent! > 0)).toBe(true);
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
		// EMA(200) of a constant drifts by floating-point error, so the distance is only about zero.
		expect(lastState.priceRelativeToLongTermEmaInPercent).toBeCloseTo(0, 10);
		expect(states.every((state) => state.rsi === null)).toBe(true);
	});

	test('zero ATR leaves the distance unavailable instead of NaN or zero', () => {
		const bars = buildBars(Array(30).fill(100)).map((bar) => ({ ...bar, high: 100, low: 100 }));
		const states = calculateInstrumentStates(bars);

		expect(states.every((state) => state.priceRelativeToEmaInAtr === null)).toBe(true);
	});

	test('uses a swing only from its confirmation session, never while it is a candidate', () => {
		// The high of 22 occurs at position 3 and is confirmed three bars later; the low of 4 occurs
		// at position 9 and is confirmed at the last position.
		const bars = buildBars([10, 11, 12, 20, 12, 11, 10, 9, 8, 5, 8, 9, 10]);
		const states = calculateInstrumentStates(bars);
		const swingHigh = {
			kind: 'high',
			price: 22,
			occurredAtSession: '2026-01-04',
			confirmedAtSession: '2026-01-07',
		};

		expect(states.slice(0, 6).every((state) => state.lastConfirmedSwingHigh === null)).toBe(
			true,
		);
		expect(states[6]!.lastConfirmedSwingHigh).toMatchObject(swingHigh);
		expect(states.slice(6).every((state) => state.lastConfirmedSwingHigh !== null)).toBe(true);
		expect(states.slice(0, 12).every((state) => state.lastConfirmedSwingLow === null)).toBe(
			true,
		);
		expect(states[12]!.lastConfirmedSwingLow).toMatchObject({
			kind: 'low',
			price: 4,
			occurredAtSession: '2026-01-10',
			confirmedAtSession: '2026-01-13',
		});
	});

	test('measures the close below a swing high as negative and above a swing low as positive', () => {
		const bars = buildBars([10, 11, 12, 20, 12, 11, 10, 9, 8, 5, 8, 9, 10]);
		const lastState = calculateInstrumentStates(bars).at(-1)!;

		// The close of 10 is 12 below the high of 22 and 6 above the low of 4.
		expect(lastState.lastConfirmedSwingHigh!.priceRelativeToSwingInPercent).toBeCloseTo(
			-54.545454545,
			9,
		);
		expect(lastState.lastConfirmedSwingLow!.priceRelativeToSwingInPercent).toBe(150);
		expect(lastState.lastConfirmedSwingLow!.closePosition).toBe('at-or-above');
		expect(lastState.lastConfirmedSwingHigh!.closePosition).toBe('at-or-below');
	});

	test('a close exactly on a level counts as Support or Resistance', () => {
		// The low of 4 confirms on the close of 10; the next closes sit exactly on the low (4 + 1 is
		// the bar's low, so the close is 4) and then exactly on the high of 22.
		const atLowState = calculateInstrumentStates(
			buildBars([10, 11, 12, 20, 12, 11, 10, 9, 8, 5, 8, 9, 10, 4]),
		).at(-1)!;
		const atHighState = calculateInstrumentStates(
			buildBars([10, 11, 12, 20, 12, 11, 10, 9, 8, 5, 8, 9, 10, 22]),
		).at(-1)!;

		expect(atLowState.lastConfirmedSwingLow).toMatchObject({
			price: 4,
			closePosition: 'at-or-above',
		});
		expect(atHighState.lastConfirmedSwingHigh).toMatchObject({
			price: 22,
			closePosition: 'at-or-below',
		});
	});

	test('a close just beyond a level is on its far side, with no tolerance', () => {
		const belowLowState = calculateInstrumentStates(
			buildBars([10, 11, 12, 20, 12, 11, 10, 9, 8, 5, 8, 9, 10, 3.999]),
		).at(-1)!;

		expect(belowLowState.lastConfirmedSwingLow!.closePosition).toBe('below');
		expect(belowLowState.lastConfirmedSwingHigh!.closePosition).toBe('at-or-below');
	});

	test('a close between a high confirmed below a later low is beyond both levels', () => {
		// The high of 22 confirms first; after a gap up, a low of 38 confirms, and the close of 30
		// sits between them.
		const lastState = calculateInstrumentStates(
			buildBars([10, 11, 12, 20, 12, 11, 10, 50, 50, 50, 39, 50, 50, 50, 30]),
		).at(-1)!;

		expect(lastState.lastConfirmedSwingHigh).toMatchObject({
			price: 22,
			closePosition: 'above',
		});
		expect(lastState.lastConfirmedSwingLow).toMatchObject({
			price: 38,
			closePosition: 'below',
		});
	});

	test('reports the Regime tipping closes of the same session, and none without a Regime', async () => {
		const bars = await loadGgalFixture();
		const tippingCloses = calculateRegimeTippingCloses(bars);
		const states = calculateInstrumentStates(bars);

		states.forEach((state, index) => {
			expect(state.regimeTippingCloses).toEqual(tippingCloses[index]!.tippingCloses);
			expect(state.regimeTippingCloses === null).toBe(state.regime === null);
		});
	});

	test('the last confirmed swing changes exactly on each confirmation session', async () => {
		const bars = await loadGgalFixture();
		const states = calculateInstrumentStates(bars);
		const confirmations = calculateMarketStructure(bars).flatMap((session, index) =>
			session.newlyConfirmedSwings.map((swing) => ({ swing, index })),
		);

		expect(confirmations.length).toBeGreaterThan(4);
		for (const { swing, index } of confirmations) {
			const part = swing.kind === 'high' ? 'lastConfirmedSwingHigh' : 'lastConfirmedSwingLow';
			const {
				priceRelativeToSwingInPercent,
				closePosition: _position,
				...confirmedSwing
			} = states[index]![part]!;

			expect(confirmedSwing).toEqual(swing);
			expect(states[index - 1]![part]?.confirmedAtSession).not.toBe(swing.confirmedAtSession);
			expect(priceRelativeToSwingInPercent).toBe(
				((bars[index]!.close - swing.price) / swing.price) * 100,
			);
		}
	});

	test('the swing a Structure Break crosses is the previous session’s last confirmed swing', async () => {
		const bars = await loadGgalFixture();
		const states = calculateInstrumentStates(bars);
		const breaks = detectStructureBreakEvents(bars).flatMap((session, index) =>
			session.event === null ? [] : [{ event: session.event, index }],
		);

		expect(breaks.length).toBeGreaterThan(0);
		for (const { event, index } of breaks) {
			const previousState = states[index - 1]!;
			const part =
				event.definingSwing.kind === 'high'
					? previousState.lastConfirmedSwingHigh
					: previousState.lastConfirmedSwingLow;

			expect(part).toMatchObject(event.definingSwing);
		}
	});

	test('reports the pending Regime transition of the same session, and none without a Regime', async () => {
		const bars = await loadGgalFixture();
		const pendingTransitions = calculatePendingRegimeTransitions(bars);
		const states = calculateInstrumentStates(bars);

		states.forEach((state, index) => {
			expect(state.pendingRegimeTransition).toEqual(pendingTransitions[index]!.pending);
		});
		expect(states.some((state) => state.pendingRegimeTransition !== null)).toBe(true);
		expect(
			states
				.filter((state) => state.regime === null)
				.every((state) => state.pendingRegimeTransition === null),
		).toBe(true);
	});

	test('a candidate part-way through confirmation sits beside the settled Regime', () => {
		// A flat history settles `mixed`; a jump then proposes `bullish`, and two sharp falls replace
		// it with `bearish` twice.
		const bars = buildBars([...Array<number>(205).fill(100), 120, 60, 60]);
		const lastState = calculateInstrumentStates(bars).at(-1)!;

		expect(lastState.regime).toBe('mixed');
		expect(lastState.pendingRegimeTransition).toEqual({
			candidate: 'bearish',
			confirmations: 2,
			requiredConfirmations: 3,
		});
	});

	test('every prefix replays the full-history State at the same session', async () => {
		const bars = await loadGgalFixture();
		const states = calculateInstrumentStates(bars);

		bars.forEach((_, index) => {
			const prefixStates = calculateInstrumentStates(bars.slice(0, index + 1));

			expect(prefixStates.at(-1)).toEqual(states[index]);
		});
		// The fixture is long enough for the replay to cover readable long-term distances, both
		// confirmed swing kinds and pending Regime transitions.
		expect(states.at(-1)!.priceRelativeToLongTermEmaInPercent).not.toBeNull();
		expect(states.at(-1)!.lastConfirmedSwingHigh).not.toBeNull();
		expect(states.at(-1)!.lastConfirmedSwingLow).not.toBeNull();
		expect(states.some((state) => state.pendingRegimeTransition !== null)).toBe(true);
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

function buildRisingBars(length: number): readonly DailyBar[] {
	return buildBars(Array.from({ length }, (_, index) => 100 + index));
}

function deepFreeze(bars: readonly DailyBar[]): readonly DailyBar[] {
	return Object.freeze(bars.map((bar) => Object.freeze({ ...bar })));
}
