import { describe, expect, test } from 'bun:test';

import { instrumentCatalog } from '#modules/instrument-catalog/index.ts';

import { MEP_RATE_SOURCE, validateMepRateSourceBars } from './index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { Instrument, TradingLine } from '#modules/instrument-catalog/index.ts';

const { pesoBondTradingLineId, dollarBondTradingLineId } = MEP_RATE_SOURCE;

describe('MEP_RATE_SOURCE', () => {
	test('names the AL30 peso line and its local-dollar line', () => {
		expect(MEP_RATE_SOURCE).toEqual({
			pesoBondTradingLineId: 'al30-bond-byma-ars',
			dollarBondTradingLineId: 'al30-bond-byma-usd-mep',
		});
	});

	test('resolves both lines through the repository catalog', () => {
		const resolution = instrumentCatalog.getTradingLinesByIds([
			pesoBondTradingLineId,
			dollarBondTradingLineId,
		]);

		expect(resolution.ok).toBeTrue();
	});

	test('takes both lines from the same Instrument', () => {
		const pesoBondInstrument = findOwningInstrument(pesoBondTradingLineId);
		const dollarBondInstrument = findOwningInstrument(dollarBondTradingLineId);

		expect(dollarBondInstrument.id).toBe(pesoBondInstrument.id);
	});

	test('takes the lines from a bond', () => {
		expect(findOwningInstrument(pesoBondTradingLineId).type).toBe('bond');
		expect(findOwningInstrument(dollarBondTradingLineId).type).toBe('bond');
	});

	test('uses a BYMA peso line for the peso leg', () => {
		const pesoBondLine = resolveTradingLine(pesoBondTradingLineId);

		expect(pesoBondLine.exchange).toBe('BYMA');
		expect(pesoBondLine.currency).toBe('ARS');
	});

	test('uses a BYMA dollar line for the dollar leg', () => {
		const dollarBondLine = resolveTradingLine(dollarBondTradingLineId);

		expect(dollarBondLine.exchange).toBe('BYMA');
		expect(dollarBondLine.currency).toBe('USD');
	});

	// The catalog has no operative-form field; the id suffix is its only
	// signal that a USD line is the local-dollar (MEP) line and not the cable line.
	test('uses the local-dollar line, not the cable line, for the dollar leg', () => {
		expect(dollarBondTradingLineId).toEndWith('-usd-mep');
	});
});

function resolveTradingLine(tradingLineId: string): TradingLine {
	const resolution = instrumentCatalog.getTradingLinesByIds([tradingLineId]);
	const tradingLine = resolution.ok ? resolution.tradingLines[0] : undefined;

	if (!tradingLine) {
		throw new Error(`Expected Trading Line ${tradingLineId} to exist.`);
	}

	return tradingLine;
}

function findOwningInstrument(tradingLineId: string): Instrument {
	const owningInstrument = instrumentCatalog
		.getInstruments()
		.find((instrument) =>
			instrument.tradingLines.some((tradingLine) => tradingLine.id === tradingLineId),
		);

	if (!owningInstrument) {
		throw new Error(`Expected an Instrument to own Trading Line ${tradingLineId}.`);
	}

	return owningInstrument;
}

describe('validateMepRateSourceBars', () => {
	const validBar: DailyBar = {
		sessionDate: '2025-10-13',
		open: 1000,
		high: 1010,
		low: 990,
		close: 1005,
		volume: 50,
	};

	test('accepts a zero open when it is the only invalid field, and records its session', () => {
		expect(validateMepRateSourceBars([{ ...validBar, open: 0 }])).toEqual({
			issues: [],
			zeroOpenSessions: ['2025-10-13'],
		});
	});

	test('still rejects a zero-open bar whose close is outside its range', () => {
		const validation = validateMepRateSourceBars([{ ...validBar, open: 0, close: 2000 }]);

		expect(validation.issues.map((issue) => issue.path)).toContain('bars[0].close');
	});
});
