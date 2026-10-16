import { describe, expect, test } from 'bun:test';

import {
	formatDollars,
	formatExactDollars,
	formatExactRate,
	formatLongDate,
	formatOneDecimal,
	formatPercent,
	formatPesos,
	formatShortDate,
	formatShortDateList,
	formatSignedPercent,
	formatWholeNumber,
} from './es-ar-formatting.ts';

// Numbers keep their unit and sign on one line with a non-breaking space.
const NBSP = ' ';

describe('es-AR numbers', () => {
	test('groups thousands with a dot and separates decimals with a comma', () => {
		expect(formatWholeNumber(5662.4)).toBe('5.662');
		expect(formatOneDecimal(1.43)).toBe('1,4');
	});

	test('writes negative numbers with a minus sign, not a hyphen', () => {
		expect(formatOneDecimal(-1.43)).toBe('−1,4');
	});

	test('a signed percentage carries its sign, and zero carries none', () => {
		expect(formatSignedPercent(-17.83)).toBe(`−17,8${NBSP}%`);
		expect(formatSignedPercent(41.6)).toBe(`+41,6${NBSP}%`);
		expect(formatSignedPercent(-0.04)).toBe(`0,0${NBSP}%`);
	});

	test('an unsigned percentage drops the sign, for wording that says above or below', () => {
		expect(formatPercent(-4.53)).toBe(`4,5${NBSP}%`);
	});

	test('a MEP or CCL dollar price is US$ with two decimals', () => {
		expect(formatDollars(4.0412)).toBe(`US$${NBSP}4,04`);
		expect(formatDollars(1234.5)).toBe(`US$${NBSP}1.234,50`);
	});

	test('a price under one keeps three significant digits', () => {
		expect(formatDollars(0.01234)).toBe(`US$${NBSP}0,0123`);
		expect(formatDollars(0.5)).toBe(`US$${NBSP}0,50`);
	});

	test('raw evidence keeps four decimals for dollars and two for a rate, which has no unit', () => {
		expect(formatExactDollars(3.684)).toBe(`US$${NBSP}3,684`);
		expect(formatExactDollars(3.51293)).toBe(`US$${NBSP}3,5129`);
		expect(formatExactRate(1612.384)).toBe('1.612,38');
	});

	test('pesos are whole from a thousand up, with two decimals below', () => {
		expect(formatPesos(5662.4)).toBe(`5.662${NBSP}pesos`);
		expect(formatPesos(45.3)).toBe(`45,30${NBSP}pesos`);
	});

	test('the format follows the rounded value at each cutoff', () => {
		expect(formatDollars(0.99951)).toBe(`US$${NBSP}1,00`);
		expect(formatPesos(999.996)).toBe(`1.000${NBSP}pesos`);
	});
});

describe('es-AR dates', () => {
	test('a heading date names the weekday, day, month and year without a comma', () => {
		expect(formatLongDate('2026-10-09')).toBe('viernes 9 de octubre de 2026');
		expect(formatLongDate('2026-03-01')).toBe('domingo 1 de marzo de 2026');
	});

	test('a list date is the day and a three-letter month', () => {
		expect(formatShortDate('2026-10-09')).toBe(`9${NBSP}oct`);
		expect(formatShortDate('2026-09-29')).toBe(`29${NBSP}sep`);
	});

	test('a list of dates names each month once, after its last day', () => {
		expect(formatShortDateList(['2026-09-25', '2026-09-26', '2026-09-29'])).toBe(
			`25, 26 y 29${NBSP}sep`,
		);
		expect(formatShortDateList(['2026-09-30', '2026-10-01', '2026-10-02'])).toBe(
			`30${NBSP}sep, 1 y 2${NBSP}oct`,
		);
	});
});
