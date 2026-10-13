import { describe, expect, test } from 'bun:test';

import { buildBars, loadGgalFixture } from '../tests/support/index.ts';
import { measureRegimeInputs } from './regime-engine.ts';
import { measureRegimeBand, proposeRegime } from './regime-policy.ts';
import { calculateRegimeTippingCloses } from './regime-tipping-closes.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';

describe('measureRegimeBand', () => {
	test('places the edges half an ATR around EMA200 and reads EMA50 against EMA200', () => {
		expect(measureRegimeBand(98, 100, 4)).toEqual({
			upperEdge: 102,
			lowerEdge: 98,
			averageAlignment: -1,
		});
	});

	test('treats equal averages, within rounding noise, as aligned with neither side', () => {
		expect(measureRegimeBand(100.0000000000001, 100, 4)!.averageAlignment).toBe(0);
	});

	test('is unavailable when a measurement is missing or non-finite', () => {
		expect(measureRegimeBand(null, 100, 4)).toBeNull();
		expect(measureRegimeBand(98, null, 4)).toBeNull();
		expect(measureRegimeBand(98, 100, null)).toBeNull();
		expect(measureRegimeBand(98, 100, Number.NaN)).toBeNull();
	});
});

describe('calculateRegimeTippingCloses', () => {
	test('returns one row per session and handles empty input', async () => {
		const bars = await loadGgalFixture();

		expect(calculateRegimeTippingCloses([])).toEqual([]);
		expect(calculateRegimeTippingCloses(bars).map((row) => row.sessionDate)).toEqual(
			bars.map((bar) => bar.sessionDate),
		);
	});

	test('reports each edge with whether EMA50 already sits on its side', () => {
		const tippingCloses = calculateRegimeTippingCloses(
			buildBars(Array<number>(210).fill(100)),
		).at(-1)!.tippingCloses!;

		// A flat history has ATR 3 (high + 2, low − 1) and EMA50 equal to EMA200.
		expect(tippingCloses.bullish.closeAbove).toBeCloseTo(101.5, 10);
		expect(tippingCloses.bearish.closeBelow).toBeCloseTo(98.5, 10);
		expect(tippingCloses.bullish.isFastEmaAligned).toBe(false);
		expect(tippingCloses.bearish.isFastEmaAligned).toBe(false);
	});

	test('agrees with the Regime proposal on every readable GGAL session', async () => {
		const bars = await loadGgalFixture();
		const rows = calculateRegimeTippingCloses(bars);
		const inputs = measureRegimeInputs(bars);
		const readableIndexes = rows.flatMap((row, index) =>
			row.tippingCloses === null ? [] : [index],
		);
		const proposals = new Set<string>();

		expect(readableIndexes.length).toBeGreaterThan(200);
		for (const index of readableIndexes) {
			const { close, ema50, ema200, atr14 } = inputs[index]!;
			const { bullish, bearish } = rows[index]!.tippingCloses!;
			const proposal = proposeRegime(close, ema50, ema200, atr14);
			const meetsBullish = close > bullish.closeAbove && bullish.isFastEmaAligned;
			const meetsBearish = close < bearish.closeBelow && bearish.isFastEmaAligned;
			proposals.add(proposal!);

			expect(proposal === 'bullish').toBe(meetsBullish);
			expect(proposal === 'bearish').toBe(meetsBearish);
		}
		// The fixture exercises every readable proposal, so agreement is not vacuous.
		expect([...proposals].toSorted()).toEqual(['bearish', 'bullish', 'mixed']);
	});

	test('is null exactly while Regime measurements warm up', async () => {
		const rows = calculateRegimeTippingCloses(await loadGgalFixture());

		expect(rows.slice(0, 199).every((row) => row.tippingCloses === null)).toBe(true);
		expect(rows.slice(199).every((row) => row.tippingCloses !== null)).toBe(true);
	});

	test('every prefix replays the full-history rows', async () => {
		const bars = await loadGgalFixture();
		const fullRows = calculateRegimeTippingCloses(bars);

		for (let end = 195; end <= bars.length; end += 7) {
			const prefix: readonly DailyBar[] = bars.slice(0, end);
			expect(calculateRegimeTippingCloses(prefix).at(-1)).toEqual(fullRows[end - 1]);
		}
	});
});
