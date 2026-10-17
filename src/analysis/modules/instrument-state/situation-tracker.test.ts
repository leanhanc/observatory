import { describe, expect, test } from 'bun:test';

import { calculateAtr } from '#modules/technical-analysis/index.ts';
import { buildBars, loadGgalFixture } from '#modules/technical-analysis/tests/support/index.ts';

import { calculateInstrumentStates } from './instrument-state.ts';
import { checkIfBeyondNoiseBand, trackSituations } from './situation-tracker.ts';

import type { InstrumentState } from './instrument-state.types.ts';

const BELOW_LOW = 'below-last-confirmed-low-in-bearish-regime' as const;
const ABOVE_HIGH = 'above-last-confirmed-high-in-bullish-regime' as const;

// 230 falling closes settle a bearish Regime with no confirmed swing. The tail then:
// - bottoms at 168 (low 167), and three higher bars confirm that low on the close of 176;
// - closes below 167 from 166 on, while bottoming again at 160 (low 159);
// - confirms the low of 159 on the close of 165, three bars after it occurred, while every close
//   in between (161, 163) is still below the older low of 167.
const FALL = Array.from({ length: 230 }, (_, index) => 400 - index);
const FALL_TAIL = [170, 169, 168, 172, 174, 176, 170, 166, 164, 162, 160, 161, 163, 165, 164];
const TAIL_START = FALL.length;

describe('Situations in the Instrument State', () => {
	test('starts on the first close strictly below the latest confirmed low in a bearish Regime', () => {
		const states = calculateFallingStates();
		const startIndex = TAIL_START + 7;

		expect(states[startIndex - 1]!.lastConfirmedSwingLow!.closePosition).toBe('at-or-above');
		expect(states[startIndex - 1]!.situations).toEqual([]);
		expect(states[startIndex]!.situations).toEqual([
			{
				type: BELOW_LOW,
				activeSinceSession: states[startIndex]!.sessionDate,
				level: {
					kind: 'low',
					price: 167,
					occurredAtSession: states[TAIL_START + 2]!.sessionDate,
					confirmedAtSession: states[TAIL_START + 5]!.sessionDate,
				},
				isBeyondNoiseBand: false,
			},
		]);
	});

	test('persists with the same start and level while the close stays below that low', () => {
		const states = calculateFallingStates();
		const { isBeyondNoiseBand: _startFlag, ...start } = states[TAIL_START + 7]!.situations[0]!;
		// Positions 10 to 12 follow the next low's occurrence, before it is confirmed. A reader that
		// used that low from its occurrence would see the close above it and end the Situation.
		const persistingStates = states.slice(TAIL_START + 8, TAIL_START + 13);

		expect(
			persistingStates.map((state) =>
				state.situations.map(({ isBeyondNoiseBand: _flag, ...situation }) => situation),
			),
		).toEqual(persistingStates.map(() => [start]));
	});

	test('flags the close beyond the noise band per session without restarting the run', () => {
		const states = calculateFallingStates();
		const atrValues = calculateAtr(buildBars([...FALL, ...FALL_TAIL]), 14);
		const runStates = states.slice(TAIL_START + 7, TAIL_START + 13);
		const closes = FALL_TAIL.slice(7, 13);

		// The run starts 1 below the low of 167, within half an ATR, and falls further from it.
		expect(runStates.map((state) => state.situations[0]!.isBeyondNoiseBand)).toEqual(
			runStates.map((_, index) => {
				const atr = atrValues[TAIL_START + 7 + index]!;
				return 167 - closes[index]! > 0.5 * atr;
			}),
		);
		expect(runStates[0]!.situations[0]!.isBeyondNoiseBand).toBe(false);
		expect(runStates.at(-1)!.situations[0]!.isBeyondNoiseBand).toBe(true);
		expect(
			new Set(runStates.map((state) => state.situations[0]!.activeSinceSession)).size,
		).toBe(1);
	});

	test('ends on the session a newer low confirms, even though the close is still below the older one', () => {
		const states = calculateFallingStates();
		const confirmationState = states[TAIL_START + 13]!;
		const closeAtConfirmation = FALL_TAIL[13]!;

		// A stale reader still comparing with the low of 167 would keep the Situation active here.
		expect(closeAtConfirmation).toBeLessThan(167);
		expect(confirmationState.lastConfirmedSwingLow).toMatchObject({
			price: 159,
			confirmedAtSession: confirmationState.sessionDate,
			closePosition: 'at-or-above',
		});
		expect(confirmationState.situations).toEqual([]);
		expect(states[TAIL_START + 14]!.situations).toEqual([]);
	});

	test('ends when the close returns to the low, and a later close below it starts a new run', () => {
		// After the low of 167 confirms, the close goes below it, back exactly to it, and below again.
		const tail = [170, 169, 168, 172, 174, 176, 170, 166, 167, 165];
		const states = calculateInstrumentStates(buildBars([...FALL, ...tail]));
		const [firstRun, returned, secondRun] = states.slice(TAIL_START + 7);

		expect(firstRun!.situations[0]!.activeSinceSession).toBe(firstRun!.sessionDate);
		expect(returned!.lastConfirmedSwingLow!.closePosition).toBe('at-or-above');
		expect(returned!.situations).toEqual([]);
		expect(secondRun!.situations[0]!.activeSinceSession).toBe(secondRun!.sessionDate);
	});

	test('the mirror holds while a bullish close is strictly above the latest confirmed high', async () => {
		const states = calculateInstrumentStates(await loadGgalFixture());
		const mirrorStates = states.filter((state) =>
			state.situations.some((situation) => situation.type === ABOVE_HIGH),
		);

		expect(mirrorStates.length).toBeGreaterThan(0);
		for (const state of mirrorStates) {
			const situation = state.situations.find(({ type }) => type === ABOVE_HIGH)!;
			const {
				priceRelativeToSwingInPercent: _distance,
				closePosition,
				...high
			} = state.lastConfirmedSwingHigh!;

			expect(state.regime).toBe('bullish');
			expect(closePosition).toBe('above');
			expect(situation.level).toEqual(high);
		}
	});

	test('every listed Situation matches its conjunction on GGAL, and every match is listed', async () => {
		const states = calculateInstrumentStates(await loadGgalFixture());

		for (const state of states) {
			const isBelowLow =
				state.regime === 'bearish' &&
				state.lastConfirmedSwingLow?.closePosition === 'below';
			const isAboveHigh =
				state.regime === 'bullish' &&
				state.lastConfirmedSwingHigh?.closePosition === 'above';

			expect(state.situations.map((situation) => situation.type)).toEqual([
				...(isBelowLow ? [BELOW_LOW] : []),
				...(isAboveHigh ? [ABOVE_HIGH] : []),
			]);
		}
		expect(states.some((state) => state.situations.length > 0)).toBe(true);
	});

	test("every flag on GGAL compares the distance past the level with half that session's ATR(14)", async () => {
		const bars = await loadGgalFixture();
		const states = calculateInstrumentStates(bars);
		const atrValues = calculateAtr(bars, 14);
		const flags = states.flatMap((state, index) =>
			state.situations.map((situation) => {
				const close = bars[index]!.close;
				const { kind, price } = situation.level;
				const distancePastLevel = kind === 'low' ? price - close : close - price;
				const expected = distancePastLevel > 0.5 * atrValues[index]!;
				return { actual: situation.isBeyondNoiseBand, expected };
			}),
		);

		expect(flags.map(({ actual }) => actual)).toEqual(flags.map(({ expected }) => expected));
		expect(flags.some(({ actual }) => actual === true)).toBe(true);
		expect(flags.some(({ actual }) => actual === false)).toBe(true);
	});

	test('is never active during warm-up', async () => {
		const states = calculateInstrumentStates(await loadGgalFixture());
		const warmUpStates = states.filter(
			(state) =>
				state.regime === null ||
				(state.lastConfirmedSwingLow === null && state.lastConfirmedSwingHigh === null),
		);

		expect(warmUpStates.length).toBeGreaterThan(190);
		expect(warmUpStates.every((state) => state.situations.length === 0)).toBe(true);
	});

	test('every prefix replays the full-history Situations, including their start sessions', () => {
		const bars = buildBars([...FALL, ...FALL_TAIL]);
		const states = calculateInstrumentStates(bars);

		for (let end = TAIL_START; end <= bars.length; end += 1) {
			const prefixStates = calculateInstrumentStates(bars.slice(0, end));

			expect(prefixStates.at(-1)!.situations).toEqual(states[end - 1]!.situations);
		}
	});
});

describe('trackSituations', () => {
	const low = {
		kind: 'low',
		price: 10,
		occurredAtSession: '2026-03-02',
		confirmedAtSession: '2026-03-05',
	} as const;

	test('ends when Regime leaves bearish while the close stays below the low', () => {
		const situations = trackSituations([
			buildStateParts('2026-03-10', 'bearish'),
			buildStateParts('2026-03-11', 'bearish'),
			buildStateParts('2026-03-12', 'mixed'),
			buildStateParts('2026-03-13', 'bearish'),
		]);

		expect(situations.map((list) => list[0]?.activeSinceSession ?? null)).toEqual([
			'2026-03-10',
			'2026-03-10',
			null,
			'2026-03-13',
		]);
	});

	test('restarts the run when the swing it is beyond changes', () => {
		// Bars cannot confirm a newer low while the close stays below it; the tracker still must not
		// carry a start from one level to another.
		const newerLow = { ...low, price: 9, confirmedAtSession: '2026-03-11' };
		const onNewerLow = buildStateParts('2026-03-11', 'bearish');
		const situations = trackSituations([
			buildStateParts('2026-03-10', 'bearish'),
			{
				...onNewerLow,
				lastConfirmedSwingLow: { ...onNewerLow.lastConfirmedSwingLow!, ...newerLow },
			},
		]);

		expect(situations[1]).toEqual([
			{ type: BELOW_LOW, activeSinceSession: '2026-03-11', level: newerLow },
		]);
	});

	test('needs a readable Regime and a confirmed swing', () => {
		const situations = trackSituations([
			buildStateParts('2026-03-10', null),
			{ ...buildStateParts('2026-03-11', 'bearish'), lastConfirmedSwingLow: null },
		]);

		expect(situations).toEqual([[], []]);
	});

	describe('checkIfBeyondNoiseBand', () => {
		const belowLow = {
			type: BELOW_LOW,
			activeSinceSession: '2026-03-10',
			level: low,
		} as const;
		const aboveHigh = {
			type: ABOVE_HIGH,
			activeSinceSession: '2026-03-10',
			level: { ...low, kind: 'high', price: 20 },
		} as const;

		test('a close exactly half an ATR past the level is not beyond the band', () => {
			expect(checkIfBeyondNoiseBand(belowLow, 9, 2)).toBe(false);
			expect(checkIfBeyondNoiseBand(aboveHigh, 21, 2)).toBe(false);
		});

		test('an edge that floating point puts a hair past the close is still on the edge', () => {
			// 0.1 + 0.3 and 0.7 − 0.3 are both 0.4 only up to rounding, on opposite sides of it.
			const nearHigh = { ...aboveHigh, level: { ...aboveHigh.level, price: 0.1 } };
			const nearLow = { ...belowLow, level: { ...belowLow.level, price: 0.7 } };

			expect(checkIfBeyondNoiseBand(nearHigh, 0.4, 0.6)).toBe(false);
			expect(checkIfBeyondNoiseBand(nearLow, 0.4, 0.6)).toBe(false);
		});

		test('a close further than half an ATR past the level is beyond the band', () => {
			expect(checkIfBeyondNoiseBand(belowLow, 8.99, 2)).toBe(true);
			expect(checkIfBeyondNoiseBand(aboveHigh, 21.01, 2)).toBe(true);
		});

		test('measures each side away from its own level', () => {
			// A high's band is above it: a close below the high is never beyond it.
			expect(checkIfBeyondNoiseBand(aboveHigh, 18, 2)).toBe(false);
			expect(checkIfBeyondNoiseBand(belowLow, 12, 2)).toBe(false);
		});

		test('is null, not false, while ATR(14) is unavailable', () => {
			expect(checkIfBeyondNoiseBand(belowLow, 1, null)).toBeNull();
		});
	});

	function buildStateParts(
		sessionDate: string,
		regime: InstrumentState['regime'],
	): Omit<InstrumentState, 'situations'> {
		return {
			sessionDate,
			regime,
			pendingRegimeTransition: null,
			regimeTippingCloses: null,
			structure: 'downtrend',
			lastConfirmedSwingHigh: null,
			lastConfirmedSwingLow: {
				...low,
				priceRelativeToSwingInPercent: -5,
				closePosition: 'below',
			},
			rsi: 30,
			priceRelativeToEmaInAtr: -2,
			priceRelativeToLongTermEmaInPercent: -15,
			longTermEma: 20,
		};
	}
});

function calculateFallingStates(): readonly InstrumentState[] {
	return calculateInstrumentStates(buildBars([...FALL, ...FALL_TAIL]));
}
