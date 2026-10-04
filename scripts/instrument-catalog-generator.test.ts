import { describe, expect, test } from 'bun:test';

import { instrumentCatalog } from '#modules/instrument-catalog/index.ts';

import { mergeLeadingPanel, serializeCatalog } from './instrument-catalog-generator.ts';

import type { InstrumentCatalogValue } from '#modules/instrument-catalog/index.ts';

const currentCatalog: InstrumentCatalogValue = {
	schemaVersion: 1,
	instruments: [
		{
			id: 'galicia-stock',
			type: 'stock',
			tradingLines: [
				{ id: 'galicia-stock-byma-ars', symbol: 'GGAL', exchange: 'BYMA', currency: 'ARS' },
				{
					id: 'galicia-stock-byma-usd-mep',
					symbol: 'GGALD',
					exchange: 'BYMA',
					currency: 'USD',
				},
			],
		},
		{
			id: 'ypf-stock',
			type: 'stock',
			tradingLines: [
				{ id: 'ypf-stock-byma-ars', symbol: 'YPFD', exchange: 'BYMA', currency: 'ARS' },
			],
		},
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
				{ id: 'apple-cedear-byma-ars', symbol: 'AAPL', exchange: 'BYMA', currency: 'ARS' },
			],
		},
	],
};

describe('Leading panel merge', () => {
	test('keeps existing leaders unchanged and adds new leaders in symbol order', () => {
		const merge = expectMerged(currentCatalog, buildPanel(['YPFD', 'TECO2', 'GGAL', 'ALUA']));

		expect(merge.catalog.instruments.slice(0, 4)).toEqual([...currentCatalog.instruments]);
		expect(merge.addedInstrumentIds).toEqual(['alua-stock', 'teco2-stock']);
		expect(merge.catalog.instruments.slice(4)).toEqual([
			{
				id: 'alua-stock',
				type: 'stock',
				tradingLines: [
					{
						id: 'alua-stock-byma-ars',
						symbol: 'ALUA',
						exchange: 'BYMA',
						currency: 'ARS',
					},
				],
			},
			{
				id: 'teco2-stock',
				type: 'stock',
				tradingLines: [
					{
						id: 'teco2-stock-byma-ars',
						symbol: 'TECO2',
						exchange: 'BYMA',
						currency: 'ARS',
					},
				],
			},
		]);
	});

	test('replaces punctuation in a symbol when deriving the Instrument id', () => {
		const merge = expectMerged(currentCatalog, buildPanel(['GGAL', 'YPFD', 'BMA.']));

		expect(merge.catalog.instruments.at(-1)).toEqual({
			id: 'bma-stock',
			type: 'stock',
			tradingLines: [
				{ id: 'bma-stock-byma-ars', symbol: 'BMA.', exchange: 'BYMA', currency: 'ARS' },
			],
		});
	});

	test('reports a stock whose BYMA ARS line is absent from the panel without deleting it', () => {
		const merge = expectMerged(currentCatalog, buildPanel(['GGAL', 'ALUA']));

		expect(merge.absentInstrumentIds).toEqual(['ypf-stock']);
		expect(merge.catalog.instruments.map((instrument) => instrument.id)).toContain('ypf-stock');
	});

	test('reports only BYMA ARS lines of stocks as absent, not USD lines, NASDAQ stocks or CEDEARs', () => {
		const merge = expectMerged(currentCatalog, buildPanel(['GGAL', 'YPFD']));

		expect(merge.absentInstrumentIds).toEqual([]);
		expect(merge.addedInstrumentIds).toEqual([]);
	});

	test('ignores rows in other currencies or settlements', () => {
		const panel = buildPanelFromRows([
			buildRow('GGAL'),
			buildRow('YPFD'),
			buildRow('GGALD', { denominationCcy: 'USD' }),
			buildRow('GGALC', { denominationCcy: 'EXT' }),
			buildRow('ALUA', { settlementType: '1' }),
		]);
		const merge = expectMerged(currentCatalog, panel);

		expect(merge.addedInstrumentIds).toEqual([]);
		expect(merge.catalog).toEqual(currentCatalog);
	});

	test('produces an identical file when re-run over its own output', () => {
		const panel = buildPanel(['TECO2', 'GGAL', 'ALUA', 'YPFD']);
		const firstMerge = expectMerged(currentCatalog, panel);
		const secondMerge = expectMerged(firstMerge.catalog, panel);

		expect(secondMerge.addedInstrumentIds).toEqual([]);
		expect(serializeCatalog(secondMerge.catalog)).toBe(serializeCatalog(firstMerge.catalog));
	});

	test('does not depend on the panel row order', () => {
		const merge = expectMerged(currentCatalog, buildPanel(['TECO2', 'GGAL', 'ALUA', 'YPFD']));
		const reorderedMerge = expectMerged(
			currentCatalog,
			buildPanel(['ALUA', 'YPFD', 'TECO2', 'GGAL']),
		);

		expect(serializeCatalog(reorderedMerge.catalog)).toBe(serializeCatalog(merge.catalog));
	});

	test.each([
		['a non-object response', 'Service unavailable'],
		['a response without rows', { content: { total_elements_count: 0 } }],
		['a row without a symbol', buildPanelFromRows([{ ...buildRow('GGAL'), symbol: '' }])],
		['a lowercase symbol', buildPanel(['ggal', 'YPFD'])],
		['a padded symbol', buildPanel([' GGAL', 'YPFD'])],
		['a symbol listed twice', buildPanel(['GGAL', 'YPFD', 'GGAL'])],
		['an empty panel', buildPanel([])],
		[
			'a paginated response',
			{ content: { total_elements_count: 3 }, data: [buildRow('GGAL'), buildRow('YPFD')] },
		],
		[
			'a panel without ARS 24-hour rows',
			buildPanelFromRows([buildRow('GGALD', { denominationCcy: 'USD' })]),
		],
	])('returns no catalog for %s', (_label, panelResponse) => {
		const merge = mergeLeadingPanel(currentCatalog, panelResponse);

		expect(merge).toMatchObject({ ok: false, reason: 'invalid-panel-response' });
		expect(merge).not.toHaveProperty('catalog');
	});

	test('returns no catalog when an added stock would duplicate an Instrument id', () => {
		const catalogWithBond: InstrumentCatalogValue = {
			...currentCatalog,
			instruments: [
				...currentCatalog.instruments,
				{
					id: 'alua-stock',
					type: 'bond',
					tradingLines: [
						{
							id: 'alua-bond-byma-ars',
							symbol: 'AL99',
							exchange: 'BYMA',
							currency: 'ARS',
						},
					],
				},
			],
		};
		const merge = mergeLeadingPanel(catalogWithBond, buildPanel(['GGAL', 'YPFD', 'ALUA']));

		expect(merge).toMatchObject({
			ok: false,
			reason: 'invalid-catalog',
			issues: [{ code: 'duplicate-instrument-id' }, { code: 'duplicate-instrument-id' }],
		});
		expect(merge).not.toHaveProperty('catalog');
	});

	test('returns no catalog when an added stock would duplicate a CEDEAR line', () => {
		const merge = mergeLeadingPanel(currentCatalog, buildPanel(['GGAL', 'YPFD', 'AAPL']));

		expect(merge).toMatchObject({
			ok: false,
			reason: 'invalid-catalog',
			issues: [{ code: 'duplicate-trading-line' }, { code: 'duplicate-trading-line' }],
		});
	});
});

describe('Committed catalog', () => {
	test('is the generator output for a panel listing its own BYMA ARS stocks', async () => {
		const committedCatalog: InstrumentCatalogValue = {
			schemaVersion: 1,
			instruments: instrumentCatalog.getInstruments(),
		};
		const bymaPesoStockSymbols = committedCatalog.instruments
			.filter((instrument) => instrument.type === 'stock')
			.flatMap((stock) => stock.tradingLines)
			.filter((line) => line.exchange === 'BYMA' && line.currency === 'ARS')
			.map((line) => line.symbol);
		const committedFile = await Bun.file(
			new URL(
				'../src/modules/instrument-catalog/data/instrument-catalog.v1.json',
				import.meta.url,
			),
		).text();
		const merge = expectMerged(committedCatalog, buildPanel(bymaPesoStockSymbols));

		expect(merge.addedInstrumentIds).toEqual([]);
		expect(merge.absentInstrumentIds).toEqual([]);
		expect(serializeCatalog(merge.catalog)).toBe(committedFile);
	});
});

type PanelRow = Readonly<{ symbol: string; denominationCcy: string; settlementType: string }>;

function buildRow(symbol: string, overrides: Partial<PanelRow> = {}): PanelRow {
	return {
		symbol,
		denominationCcy: 'ARS',
		settlementType: '2',
		...overrides,
	};
}

function buildPanel(symbols: readonly string[]) {
	return buildPanelFromRows(symbols.map((symbol) => buildRow(symbol)));
}

function buildPanelFromRows(rows: readonly PanelRow[]) {
	return {
		content: { page_number: 1, page_count: 1, total_elements_count: rows.length },
		data: rows.map((row) => ({ ...row, securityType: 'CS', closingPrice: 0 })),
	};
}

function expectMerged(catalog: InstrumentCatalogValue, panelResponse: unknown) {
	const merge = mergeLeadingPanel(catalog, panelResponse);

	if (!merge.ok) {
		throw new Error(`Expected a successful merge, got ${merge.reason}.`);
	}

	return merge;
}
