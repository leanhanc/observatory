import { describe, expect, test } from 'bun:test';

import { calculateAtr, detectVolatilityExpansionEvents } from '../index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';

function rangeBars(ranges: readonly number[]): DailyBar[] {
	return ranges.map((range, index) => ({
		sessionDate: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
		open: 100,
		high: 100 + range / 2,
		low: 100 - range / 2,
		close: 100,
		volume: 1,
	}));
}

function baselineBars(): DailyBar[] {
	return rangeBars(Array<number>(14).fill(10));
}

describe('detectVolatilityExpansionEvents', () => {
	test('preserves empty input and emits nothing before a prior ATR is readable', () => {
		expect(detectVolatilityExpansionEvents([])).toEqual([]);
		const bars = rangeBars([...Array<number>(13).fill(10), 100, 100]);
		const rows = detectVolatilityExpansionEvents(bars);
		expect(rows.slice(0, 14).every(({ event }) => event === null)).toBe(true);
		expect(rows[14]!.event).toEqual({
			type: 'volatility-expansion',
			trueRange: 100,
			baselineAtr: 230 / 14,
			baselineThroughSessionDate: bars[13]!.sessionDate,
			expansionMultiple: 100 / (230 / 14),
		});
	});

	test.each([17, 18])('does not emit for True Range %s against ATR 10', (range) => {
		const bars = rangeBars([...Array<number>(14).fill(10), range]);
		expect(detectVolatilityExpansionEvents(bars).at(-1)!.event).toBeNull();
	});

	test('uses prior ATR rather than current ATR at the strict boundary', () => {
		const bars = rangeBars([...Array<number>(14).fill(10), 19]);
		expect(19 / calculateAtr(bars).at(-1)!).toBeLessThan(1.8);
		expect(detectVolatilityExpansionEvents(bars).at(-1)!.event).toEqual({
			type: 'volatility-expansion',
			trueRange: 19,
			baselineAtr: 10,
			baselineThroughSessionDate: bars[13]!.sessionDate,
			expansionMultiple: 1.9,
		});
	});

	test('does not round away a readable multiple just above 1.8', () => {
		const bars = rangeBars([...Array<number>(14).fill(10), 18.000000000001]);
		expect(
			detectVolatilityExpansionEvents(bars).at(-1)!.event!.expansionMultiple,
		).toBeGreaterThan(1.8);
	});

	test('does not double-smooth a changing volatility baseline', () => {
		const bars = rangeBars([...Array<number>(34).fill(2), ...Array<number>(10).fill(20), 15]);
		const atr = calculateAtr(bars);
		const priorAtr = atr.at(-2)!;
		const historicalMean =
			atr.slice(-20).reduce<number>((total, value) => total + value!, 0) / 20;
		expect(15 / historicalMean).toBeGreaterThan(1.8);
		expect(15 / priorAtr).toBeLessThan(1.8);
		expect(detectVolatilityExpansionEvents(bars).at(-1)!.event).toBeNull();
	});

	test('zero baseline is unavailable even if the current session establishes positive ATR', () => {
		const bars = rangeBars([...Array<number>(14).fill(0), 20, 20]);
		const rows = detectVolatilityExpansionEvents(bars);
		expect(rows[14]!.event).toBeNull();
		expect(rows[15]!.event!.baselineAtr).toBe(20 / 14);
	});

	test.each([Number.NaN, Number.POSITIVE_INFINITY])(
		'rejects non-finite prior ATR %s without fallback',
		(value) => {
			const bars = rangeBars([...Array<number>(14).fill(10), 20, 100]);
			bars[14] = { ...bars[14]!, high: value };
			expect(detectVolatilityExpansionEvents(bars)[15]!.event).toBeNull();
		},
	);

	test.each([Number.NaN, Number.POSITIVE_INFINITY])(
		'rejects non-finite current True Range %s',
		(value) => {
			const bars = rangeBars([...Array<number>(14).fill(10), 20]);
			bars[14] = { ...bars[14]!, high: value };
			expect(detectVolatilityExpansionEvents(bars)[14]!.event).toBeNull();
		},
	);

	test('rejects a finite-range ratio that overflows', () => {
		const tinyBar = {
			sessionDate: '2026-01-01',
			open: 1e-300,
			high: 2e-300,
			low: 1e-300,
			close: 1e-300,
			volume: 1,
		};
		const bars = Array.from({ length: 15 }, (_, index) => ({
			...tinyBar,
			sessionDate: `2026-01-${String(index + 1).padStart(2, '0')}`,
		}));
		bars[14] = { ...bars[14]!, high: 1e100 };
		expect(calculateAtr(bars)[13]).toBeGreaterThan(0);
		expect(detectVolatilityExpansionEvents(bars)[14]!.event).toBeNull();
	});

	test('upward and downward large intraday movements have identical neutral evidence', () => {
		const wideBar = rangeBars(Array<number>(15).fill(20))[14]!;
		const up = [...baselineBars(), { ...wideBar, open: 90, close: 110 }];
		const down = [...baselineBars(), { ...wideBar, open: 110, close: 90 }];
		const upEvent = detectVolatilityExpansionEvents(up)[14]!.event;
		expect(upEvent).not.toBeNull();
		expect(detectVolatilityExpansionEvents(down)[14]!.event).toEqual(upEvent);
		expect(upEvent).not.toHaveProperty('direction');
	});

	test.each([1, -1])(
		'includes a narrow intraday range after a gap in direction %s',
		(direction) => {
			const center = 100 + direction * 20;
			const gapBar = {
				sessionDate: '2026-01-19',
				open: center,
				high: center + 1,
				low: center - 1,
				close: center,
				volume: 1,
			};
			const rows = detectVolatilityExpansionEvents([...baselineBars(), gapBar]);
			expect(rows[14]).toEqual({
				sessionDate: '2026-01-19',
				event: {
					type: 'volatility-expansion',
					trueRange: 21,
					baselineAtr: 10,
					baselineThroughSessionDate: '2026-01-14',
					expansionMultiple: 2.1,
				},
			});
		},
	);

	test('emits consecutive expansions with each session’s own baseline', () => {
		const bars = rangeBars([...Array<number>(14).fill(10), 28, 28, 1]);
		const rows = detectVolatilityExpansionEvents(bars);
		expect(rows[14]!.event!.baselineAtr).toBe(10);
		expect(rows[15]!.event!.baselineAtr).toBe(158 / 14);
		expect(rows[15]!.event!.baselineThroughSessionDate).toBe(bars[14]!.sessionDate);
		expect(rows[16]!.event).toBeNull();
	});

	test('preserves alignment, frozen input, and all rows under every-prefix replay', () => {
		const bars = Object.freeze(
			rangeBars([...Array<number>(14).fill(10), 19, 30, 1, 60, 2]).map((bar) =>
				Object.freeze(bar),
			),
		);
		const before = structuredClone(bars);
		const full = detectVolatilityExpansionEvents(bars);
		expect(full.map(({ sessionDate }) => sessionDate)).toEqual(
			bars.map(({ sessionDate }) => sessionDate),
		);
		for (let length = 0; length <= bars.length; length += 1) {
			expect(detectVolatilityExpansionEvents(bars.slice(0, length))).toEqual(
				full.slice(0, length),
			);
		}
		expect(bars).toEqual(before);
	});
});
