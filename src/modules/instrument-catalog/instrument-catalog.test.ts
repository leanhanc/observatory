import { describe, expect, test } from 'bun:test';

import { instrumentCatalog } from './index.ts';
import { createInstrumentCatalog, validateInstrumentCatalog } from './instrument-catalog.ts';

import type { Instrument, InstrumentCatalog } from './instrument-catalog.types.ts';

const validCatalog = {
	schemaVersion: 1,
	instruments: [
		{
			id: 'apple-stock',
			type: 'stock',
			tradingLines: [
				{
					id: 'apple-stock-nasdaq-usd',
					symbol: 'AAPL',
					exchange: 'NASDAQ',
					currency: 'USD',
				},
			],
		},
		{
			id: 'apple-cedear',
			type: 'cedear',
			underlyingInstrumentId: 'apple-stock',
			tradingLines: [
				{
					id: 'apple-cedear-byma-ars',
					symbol: 'AAPL',
					exchange: 'BYMA',
					currency: 'ARS',
				},
			],
		},
	],
} as const;

describe('Instrument Catalog validation', () => {
	test.each([
		['unsupported schema version', { ...validCatalog, schemaVersion: 2 }],
		['empty catalog', { ...validCatalog, instruments: [] }],
		[
			'unsupported Instrument type',
			{
				...validCatalog,
				instruments: [{ ...validCatalog.instruments[0], type: 'fund' }],
			},
		],
		[
			'additional Instrument field',
			{
				...validCatalog,
				instruments: [{ ...validCatalog.instruments[0], name: 'Apple Inc.' }],
			},
		],
		[
			'empty Trading Lines',
			{
				...validCatalog,
				instruments: [{ ...validCatalog.instruments[0], tradingLines: [] }],
			},
		],
		[
			'invalid Instrument ID',
			{
				...validCatalog,
				instruments: [{ ...validCatalog.instruments[0], id: 'Apple Stock' }],
			},
		],
		[
			'invalid Trading Line ID',
			{
				...validCatalog,
				instruments: [
					{
						...validCatalog.instruments[0],
						tradingLines: [
							{
								...validCatalog.instruments[0].tradingLines[0],
								id: 'AAPL',
							},
						],
					},
				],
			},
		],
		[
			'blank symbol',
			{
				...validCatalog,
				instruments: [
					{
						...validCatalog.instruments[0],
						tradingLines: [
							{
								...validCatalog.instruments[0].tradingLines[0],
								symbol: '   ',
							},
						],
					},
				],
			},
		],
		[
			'unsupported exchange',
			{
				...validCatalog,
				instruments: [
					{
						...validCatalog.instruments[0],
						tradingLines: [
							{
								...validCatalog.instruments[0].tradingLines[0],
								exchange: 'NYSE',
							},
						],
					},
				],
			},
		],
		[
			'unsupported currency',
			{
				...validCatalog,
				instruments: [
					{
						...validCatalog.instruments[0],
						tradingLines: [
							{
								...validCatalog.instruments[0].tradingLines[0],
								currency: 'EUR',
							},
						],
					},
				],
			},
		],
	])('rejects %s', (_label, value) => {
		const result = validateInstrumentCatalog(value);

		expect(result.isValid).toBeFalse();
	});

	test('infers and returns a valid complete catalog', () => {
		const result = validateInstrumentCatalog(validCatalog);

		expect(result).toEqual({ isValid: true, catalog: validCatalog });
	});

	test('reports every duplicate Instrument ID location', () => {
		const value = structuredClone(validCatalog);
		Reflect.set(value.instruments[1], 'id', 'apple-stock');
		const result = validateInstrumentCatalog(value);

		expect(selectIssuePaths(result, 'duplicate-instrument-id')).toEqual([
			'instruments[0].id',
			'instruments[1].id',
		]);
	});

	test('reports every globally duplicate Trading Line ID location', () => {
		const value = structuredClone(validCatalog);
		Reflect.set(value.instruments[1].tradingLines[0], 'id', 'apple-stock-nasdaq-usd');
		const result = validateInstrumentCatalog(value);

		expect(selectIssuePaths(result, 'duplicate-trading-line-id')).toEqual([
			'instruments[0].tradingLines[0].id',
			'instruments[1].tradingLines[0].id',
		]);
	});

	test('rejects equivalent Trading Lines with different IDs', () => {
		const value = structuredClone(validCatalog);
		Reflect.set(value.instruments[1].tradingLines, 0, {
			id: 'duplicate-apple-line',
			symbol: 'AAPL',
			exchange: 'NASDAQ',
			currency: 'USD',
		});
		const result = validateInstrumentCatalog(value);

		expect(selectIssuePaths(result, 'duplicate-trading-line')).toEqual([
			'instruments[0].tradingLines[0]',
			'instruments[1].tradingLines[0]',
		]);
	});

	test('rejects a CEDEAR whose underlying Instrument is missing', () => {
		const value = structuredClone(validCatalog);
		Reflect.set(value.instruments[1], 'underlyingInstrumentId', 'missing-stock');
		const result = validateInstrumentCatalog(value);

		expect(selectIssuePaths(result, 'invalid-underlying')).toEqual([
			'instruments[1].underlyingInstrumentId',
		]);
	});

	test('rejects a CEDEAR whose underlying Instrument is another CEDEAR', () => {
		const value = structuredClone(validCatalog);
		Array.prototype.push.call(value.instruments, {
			id: 'second-cedear',
			type: 'cedear',
			underlyingInstrumentId: 'apple-cedear',
			tradingLines: [
				{
					id: 'second-cedear-byma-ars',
					symbol: 'AAP2',
					exchange: 'BYMA',
					currency: 'ARS',
				},
			],
		});
		const result = validateInstrumentCatalog(value);

		expect(selectIssuePaths(result, 'invalid-underlying')).toEqual([
			'instruments[2].underlyingInstrumentId',
		]);
	});

	test('does not create a partial catalog from invalid input', () => {
		const value = structuredClone(validCatalog);
		Reflect.set(value.instruments[1], 'underlyingInstrumentId', 'missing-stock');

		expect(createInstrumentCatalog(value)).toMatchObject({
			ok: false,
			reason: 'invalid-catalog',
		});
	});
});

describe('Instrument Catalog interface', () => {
	test('loads the initial Galicia, Apple stock, and Apple CEDEAR entries', () => {
		const instruments = instrumentCatalog.getInstruments();

		expect(instruments.map((instrument) => instrument.id).toSorted()).toEqual([
			'apple-cedear',
			'apple-stock',
			'galicia-stock',
		]);
		expect(instrumentCatalog.getInstrumentById('apple-cedear')).toMatchObject({
			ok: true,
			instrument: {
				type: 'cedear',
				underlyingInstrumentId: 'apple-stock',
			},
		});
	});

	test('returns an explicit missing-Instrument result', () => {
		expect(instrumentCatalog.getInstrumentById('missing-stock')).toEqual({
			ok: false,
			reason: 'instrument-not-found',
			instrumentId: 'missing-stock',
		});
	});

	test('resolves Trading Lines in requested order', () => {
		const result = instrumentCatalog.getTradingLinesByIds([
			'apple-cedear-byma-ars',
			'galicia-stock-byma-ars',
		]);

		expect(result).toMatchObject({
			ok: true,
			tradingLines: [{ id: 'apple-cedear-byma-ars' }, { id: 'galicia-stock-byma-ars' }],
		});
	});

	test('resolves an empty Trading Line request', () => {
		expect(instrumentCatalog.getTradingLinesByIds([])).toEqual({
			ok: true,
			tradingLines: [],
		});
	});

	test('rejects blank and duplicate Trading Line IDs together', () => {
		const result = instrumentCatalog.getTradingLinesByIds([
			' ',
			'apple-cedear-byma-ars',
			'apple-cedear-byma-ars',
		]);

		expect(result).toMatchObject({
			ok: false,
			reason: 'invalid-request',
			issues: [{ code: 'blank-id' }, { code: 'duplicate-id' }],
		});
	});

	test('reports every missing Trading Line without a partial result', () => {
		const result = instrumentCatalog.getTradingLinesByIds([
			'missing-first',
			'apple-stock-nasdaq-usd',
			'missing-second',
		]);

		expect(result).toEqual({
			ok: false,
			reason: 'trading-line-not-found',
			missingTradingLineIds: ['missing-first', 'missing-second'],
		});
	});

	test('protects later reads from nested consumer mutation', () => {
		const catalog = getCreatedCatalog(validCatalog);
		const instruments = catalog.getInstruments();
		const appleStock = getRequiredInstrument(instruments, 'apple-stock');
		const appleTradingLine = appleStock.tradingLines[0];

		if (!appleTradingLine) {
			throw new Error('Expected Apple stock to contain one Trading Line.');
		}

		Reflect.set(appleStock, 'id', 'mutated-stock');
		Reflect.set(appleTradingLine, 'symbol', 'MUTATED');
		Reflect.set(instruments, 'length', 0);

		expect(catalog.getInstrumentById('apple-stock')).toMatchObject({
			ok: true,
			instrument: {
				id: 'apple-stock',
				tradingLines: [{ symbol: 'AAPL' }],
			},
		});
		expect(catalog.getInstruments()).toHaveLength(2);
	});

	test('provides the existing Bar History descriptor without provider policy', () => {
		const result = instrumentCatalog.getTradingLinesByIds(['apple-cedear-byma-ars']);

		if (!result.ok) {
			throw new Error('Expected the Apple CEDEAR Trading Line to exist.');
		}

		const tradingLine = result.tradingLines[0];

		if (!tradingLine) {
			throw new Error('Expected one resolved Trading Line.');
		}

		const barHistoryDescriptor = {
			tradingLineId: tradingLine.id,
			symbol: tradingLine.symbol,
		};

		expect(barHistoryDescriptor).toEqual({
			tradingLineId: 'apple-cedear-byma-ars',
			symbol: 'AAPL',
		});
		expect(tradingLine).not.toHaveProperty('provider');
		expect(tradingLine).not.toHaveProperty('analysisTradingLineId');
	});
});

function selectIssuePaths(
	result: ReturnType<typeof validateInstrumentCatalog>,
	code: string,
): string[] {
	if (result.isValid) {
		return [];
	}

	return result.issues.filter((issue) => issue.code === code).map((issue) => issue.path);
}

function getCreatedCatalog(value: unknown): InstrumentCatalog {
	const creation = createInstrumentCatalog(value);

	if (!creation.ok) {
		throw new Error('Expected a valid Instrument Catalog.');
	}

	return creation.catalog;
}

function getRequiredInstrument(
	instruments: readonly Instrument[],
	instrumentId: string,
): Instrument {
	const instrument = instruments.find((candidate) => candidate.id === instrumentId);

	if (!instrument) {
		throw new Error(`Expected Instrument ${instrumentId} to exist.`);
	}

	return instrument;
}
