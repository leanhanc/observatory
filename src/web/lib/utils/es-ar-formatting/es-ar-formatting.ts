// A non-breaking space keeps a number together with its unit or sign when a line wraps.
const NBSP = ' ';
const MINUS_SIGN = '−';

// Written out rather than taken from `Intl.DateTimeFormat`, whose es-AR output varies across ICU
// versions ("sept" or "sep", and a comma after the weekday).
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = [
	'enero',
	'febrero',
	'marzo',
	'abril',
	'mayo',
	'junio',
	'julio',
	'agosto',
	'septiembre',
	'octubre',
	'noviembre',
	'diciembre',
];
const SHORT_MONTHS = [
	'ene',
	'feb',
	'mar',
	'abr',
	'may',
	'jun',
	'jul',
	'ago',
	'sep',
	'oct',
	'nov',
	'dic',
];

// Pesos are written `$` and dollars `U$S`, as Argentines write them. MEP and CCL dollars share
// `U$S`; the page's currency view and note say which.
const PESO_PREFIX = '$';
const DOLLAR_PREFIX = 'U$S';

const oneDecimalFormat = new Intl.NumberFormat('es-AR', {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});
const signedOneDecimalFormat = new Intl.NumberFormat('es-AR', {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
	signDisplay: 'exceptZero',
});
const alwaysSignedOneDecimalFormat = new Intl.NumberFormat('es-AR', {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
	signDisplay: 'always',
});
const wholeNumberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const twoDecimalFormat = new Intl.NumberFormat('es-AR', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});
const exactPriceFormat = new Intl.NumberFormat('es-AR', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 4,
});
// Prices under one keep three significant digits, so a cheap line does not round to a few cents.
const smallPriceFormat = new Intl.NumberFormat('es-AR', {
	minimumSignificantDigits: 2,
	maximumSignificantDigits: 3,
});

/** Formats a whole number in es-AR, for example `34` or `5.662`. */
export function formatWholeNumber(value: number): string {
	return useMinusSign(wholeNumberFormat.format(value));
}

/** Formats a number with one decimal in es-AR, for example `1,4`. */
export function formatOneDecimal(value: number): string {
	return useMinusSign(oneDecimalFormat.format(value));
}

/** Formats a percentage without its sign, for example `4,9 %`. */
export function formatPercent(value: number): string {
	return `${formatOneDecimal(Math.abs(value))}${NBSP}%`;
}

/** Formats a number with one decimal and its sign, for example `−1,3` or `+4,2`; zero has no sign. */
export function formatSignedOneDecimal(value: number): string {
	return useMinusSign(signedOneDecimalFormat.format(value));
}

/** Formats a percentage with its sign, for example `−17,8 %` or `+41,6 %`; zero has no sign. */
export function formatSignedPercent(value: number): string {
	return `${useMinusSign(signedOneDecimalFormat.format(value))}${NBSP}%`;
}

/**
 * Formats the percentage of a change whose amount does not round to zero, with the change's sign
 * even when the percentage rounds to zero: `−0,0 %` next to `−$ 50`.
 */
export function formatPercentOfNonzeroChange(value: number): string {
	return `${useMinusSign(alwaysSignedOneDecimalFormat.format(value))}${NBSP}%`;
}

/** Formats a price in MEP or CCL dollars, for example `U$S 4,04`. */
export function formatDollars(value: number): string {
	const amount = selectDollarPriceFormat(value).format(value);
	return `${DOLLAR_PREFIX}${NBSP}${useMinusSign(amount)}`;
}

// Chosen by the rounded value, so 0,9996 shows as 1,00 rather than with three significant digits.
function selectDollarPriceFormat(value: number): Intl.NumberFormat {
	const isUnderOne = Math.abs(value) < 0.995;
	return isUnderOne ? smallPriceFormat : twoDecimalFormat;
}

/** Formats a dollar price with up to four decimals, for raw evidence, for example `U$S 3,6812`. */
export function formatExactDollars(value: number): string {
	return `${DOLLAR_PREFIX}${NBSP}${useMinusSign(exactPriceFormat.format(value))}`;
}

/** Formats an exchange rate with two decimals and no unit, for raw evidence, for example `1.612,38`. */
export function formatExactRate(value: number): string {
	return useMinusSign(twoDecimalFormat.format(value));
}

/** Formats an amount in pesos with two decimals, for raw evidence, for example `$ 5.790,50`. */
export function formatExactPesos(value: number): string {
	return `${PESO_PREFIX}${NBSP}${useMinusSign(twoDecimalFormat.format(value))}`;
}

/** Formats an amount in pesos, whole from a thousand up, for example `$ 5.662` or `$ 45,30`. */
export function formatPesos(value: number): string {
	// Chosen by the rounded value, so 999,996 shows as 1.000 rather than 1.000,00.
	const isUnderAThousand = Math.abs(value) < 999.995;
	const amount = isUnderAThousand
		? twoDecimalFormat.format(value)
		: wholeNumberFormat.format(value);
	return `${PESO_PREFIX}${NBSP}${useMinusSign(amount)}`;
}

/**
 * Formats a change in pesos with its sign first, in the decimals its close is written with, so a
 * change on a close of thousands is whole: `+$ 60` on 5.940, `−$ 0,30` on 45,30. A change
 * that rounds to zero has no sign.
 */
export function formatSignedPesoChange(change: number, close: number): string {
	const isWholeClose = Math.abs(close) >= 999.995;
	const format = isWholeClose ? wholeNumberFormat : twoDecimalFormat;
	const amount = `${PESO_PREFIX}${NBSP}${format.format(Math.abs(change))}`;
	return signAmount(change, amount);
}

/**
 * Formats a change in MEP or CCL dollars with its sign first, in exactly the decimals its close is
 * printed with: `−U$S 0,01` on 3,81, `−U$S 0,002` on 0,343, and two on 0,33, which drops its third
 * digit as a trailing zero. A change that rounds to zero there has no sign, even when its
 * percentage does not round to zero.
 */
export function formatSignedDollarChange(change: number, close: number): string {
	const fractionDigits = countDollarFractionDigits(close);
	const format = new Intl.NumberFormat('es-AR', {
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	});
	const amount = `${DOLLAR_PREFIX}${NBSP}${format.format(Math.abs(change))}`;
	return signAmount(change, amount);
}

// The decimals `formatDollars` prints the close with, after it drops trailing zeros.
function countDollarFractionDigits(close: number): number {
	const fraction = selectDollarPriceFormat(close)
		.formatToParts(close)
		.find((part) => part.type === 'fraction');
	return fraction?.value.length ?? 0;
}

/** Whether a formatted amount, such as `U$S 0,00` or `−$ 50`, reads as zero. */
export function checkIfAmountIsZero(formattedAmount: string): boolean {
	return !/[1-9]/.test(formattedAmount);
}

function signAmount(change: number, amount: string): string {
	const isZero = checkIfAmountIsZero(amount);

	if (isZero) {
		return amount;
	}

	const sign = change > 0 ? '+' : MINUS_SIGN;
	return `${sign}${amount}`;
}

/** Formats a session date for a heading, for example `viernes 9 de octubre de 2026`. */
export function formatLongDate(sessionDate: string): string {
	const date = parseSessionDate(sessionDate);
	const weekday = WEEKDAYS[date.getUTCDay()]!;
	const month = MONTHS[date.getUTCMonth()]!;
	return `${weekday} ${date.getUTCDate()} de ${month} de ${date.getUTCFullYear()}`;
}

/** Formats a session date for a list, for example `9 oct`. */
export function formatShortDate(sessionDate: string): string {
	const date = parseSessionDate(sessionDate);
	return `${date.getUTCDate()}${NBSP}${SHORT_MONTHS[date.getUTCMonth()]!}`;
}

/**
 * Lists session dates in Spanish, naming each month once after its last day, for example
 * `25, 26 y 29 sep` or `30 sep, 1 y 2 oct`.
 */
export function formatShortDateList(sessionDates: readonly string[]): string {
	const dates = sessionDates.map(parseSessionDate);
	const items = dates.map((date, index) => {
		const nextDate = dates[index + 1];
		const isLastOfItsMonth =
			nextDate === undefined || nextDate.getUTCMonth() !== date.getUTCMonth();
		const day = String(date.getUTCDate());

		if (!isLastOfItsMonth) {
			return day;
		}

		return `${day}${NBSP}${SHORT_MONTHS[date.getUTCMonth()]!}`;
	});

	return joinWithY(items);
}

function joinWithY(items: readonly string[]): string {
	if (items.length <= 1) {
		return items.join('');
	}

	return `${items.slice(0, -1).join(', ')} y ${items.at(-1)!}`;
}

// Session dates are calendar dates with no time zone; reading them as UTC keeps the day intact.
function parseSessionDate(sessionDate: string): Date {
	return new Date(`${sessionDate}T00:00:00Z`);
}

function useMinusSign(formatted: string): string {
	return formatted.replace('-', MINUS_SIGN);
}
