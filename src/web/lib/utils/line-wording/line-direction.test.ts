import { describe, expect, test } from 'bun:test';

import {
	describeLatestCloseParts,
	describeReturnFigures,
	readPrintedDirection,
} from './line-wording.ts';

const NBSP = '\u00a0';

function buildLatestClose(change: number, percentChange: number, close = 107_775) {
	return {
		latestClose: {
			sessionDate: '2026-10-13',
			previousSessionDate: '2026-10-10',
			peso: { close, previousClose: close - change, change, percentChange },
			mep: { close: 1.1827, previousClose: 1.1786, change: 0.0041, percentChange: 0.34 },
			ccl: null,
		},
	};
}

// Color repeats the sign the reader sees, so these pin the printed sign, not the raw figure.
describe('the direction of the day change', () => {
	test('a fall whose percentage rounds to zero is still a loss', () => {
		const parts = describeLatestCloseParts(buildLatestClose(-50, -0.046), 'ars');

		expect(parts.changeText).toBe(`(−$${NBSP}50, −0,0${NBSP}%)`);
		expect(parts.direction).toBe('loss');
	});

	test('a change too small to print is a gain when its percentage prints with a plus', () => {
		const parts = describeLatestCloseParts(buildLatestClose(-50, -0.046), 'usd');

		expect(parts.changeText).toBe(`(U$S${NBSP}0,00, +0,3${NBSP}%)`);
		expect(parts.direction).toBe('gain');
	});

	test('a change that prints as zero both ways takes no color', () => {
		const parts = describeLatestCloseParts(buildLatestClose(0.4, 0.0004, 5940), 'ars');

		expect(parts.changeText).toBe(`($${NBSP}0, 0,0${NBSP}%)`);
		expect(parts.direction).toBeNull();
	});

	test('a close without a change has no change and no color', () => {
		const line = buildLatestClose(60, 1);
		const withoutChange = {
			latestClose: {
				...line.latestClose,
				peso: { close: 5940, previousClose: null, change: null, percentChange: null },
			},
		};

		expect(describeLatestCloseParts(withoutChange, 'ars')).toEqual({
			closeText: `$${NBSP}5.940`,
			changeText: null,
			direction: null,
		});
	});
});

describe('describeReturnFigures', () => {
	const returnsLine = {
		periodReturns: [
			{ windowMonths: 1, fromSessionDate: '2026-09-10', percentChange: -15.2 },
			{ windowMonths: 3, fromSessionDate: '2026-07-09', percentChange: 0.02 },
			{ windowMonths: 12, fromSessionDate: null, percentChange: null },
		],
		pesoPeriodReturns: [
			{ windowMonths: 1, fromSessionDate: '2026-09-10', percentChange: -15.1 },
			{ windowMonths: 3, fromSessionDate: '2026-07-09', percentChange: 6.2 },
			{ windowMonths: 12, fromSessionDate: '2025-10-09', percentChange: 25.1 },
		],
		cclPeriodReturns: [],
	};

	test('labels each window and prints its return as the sentence does', () => {
		expect(describeReturnFigures(returnsLine, 'ars')).toEqual([
			{
				windowMonths: 1,
				label: '1 mes',
				percentChange: -15.1,
				percentText: `−15,1${NBSP}%`,
				direction: 'loss',
			},
			{
				windowMonths: 3,
				label: '3 meses',
				percentChange: 6.2,
				percentText: `+6,2${NBSP}%`,
				direction: 'gain',
			},
			{
				windowMonths: 12,
				label: '1 año',
				percentChange: 25.1,
				percentText: `+25,1${NBSP}%`,
				direction: 'gain',
			},
		]);
	});

	test('a return that prints as zero takes no color, and an unavailable one has no figure', () => {
		const [, quarter, year] = describeReturnFigures(returnsLine, 'usd');

		expect(quarter).toMatchObject({ percentText: `0,0${NBSP}%`, direction: null });
		expect(year).toMatchObject({ percentText: null, direction: null });
	});
});

describe('readPrintedDirection', () => {
	test('reads the printed sign only', () => {
		expect(readPrintedDirection(`+1,0${NBSP}%`)).toBe('gain');
		expect(readPrintedDirection(`−0,0${NBSP}%`)).toBe('loss');
		expect(readPrintedDirection(`0,0${NBSP}%`)).toBeNull();
	});
});
