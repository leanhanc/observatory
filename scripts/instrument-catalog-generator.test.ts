import { describe, expect, test } from 'bun:test';

import { instrumentCatalog } from '#modules/instrument-catalog/index.ts';

import {
	generateCatalog,
	mergeLeadingPanel,
	mergeLiquidCedears,
	resolveThroughSession,
	serializeCatalog,
} from './instrument-catalog-generator.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
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
			underlying: { market: 'NASDAQ', ticker: 'AAPL' },
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

// 140 consecutive calendar days stand in for market sessions. The through-session is the 130th,
// so the window holds sessions 5–129 and ten sessions follow it.
const sessionDates = Array.from({ length: 140 }, (_, index) =>
	Temporal.PlainDate.from('2026-01-01').add({ days: index }).toString(),
);
const THROUGH_SESSION = sessionDates[129]!;
const sessionsThrough = sessionDates.slice(0, 130);
const catalogWithMepSource: InstrumentCatalogValue = {
	...currentCatalog,
	instruments: [
		...currentCatalog.instruments,
		{
			id: 'al30-bond',
			type: 'bond',
			tradingLines: [
				{ id: 'al30-bond-byma-ars', symbol: 'AL30', exchange: 'BYMA', currency: 'ARS' },
				{
					id: 'al30-bond-byma-usd-mep',
					symbol: 'AL30D',
					exchange: 'BYMA',
					currency: 'USD',
				},
			],
		},
	],
};
// AL30 at 1000 pesos and AL30D at 1 dollar make every MEP Rate 1000, so a CEDEAR closing at 1000
// pesos is worth one dollar and its volume is its traded value in USD.
const mepRateSourceHistories = {
	AL30: createDailyBars(sessionDates, 1000, 1),
	AL30D: createDailyBars(sessionDates, 1, 1),
};
const liquidBars = createDailyBars(sessionsThrough, 1000, 100_000);
const thinBars = createDailyBars(sessionsThrough, 1000, 1_000);

describe('CEDEAR merge', () => {
	test('adds an eligible candidate with the underlying its technical sheet describes', async () => {
		const { merge, requests } = await runCedearMerge({
			panel: buildCedearPanel(['MELI', 'THIN']),
			histories: { MELI: liquidBars, THIN: thinBars },
			sheets: { MELI: buildSheet('NASDAQ', 'MELI') },
		});
		const result = expectCedearMerged(merge);

		expect(result.catalog.instruments.at(-1)).toEqual({
			id: 'meli-cedear',
			type: 'cedear',
			underlying: { market: 'NASDAQ', ticker: 'MELI' },
			tradingLines: [
				{ id: 'meli-cedear-byma-ars', symbol: 'MELI', exchange: 'BYMA', currency: 'ARS' },
			],
		});
		expect(result.addedInstrumentIds).toEqual(['meli-cedear']);
		expect(result.ineligibleCount).toBe(1);
		expect(result.measuredAtSession).toBe(THROUGH_SESSION);
		expect(requests).not.toContain('sheet:THIN');
	});

	test('drops B variants, reports each with its base, and keeps a B symbol without a listed base', async () => {
		const { merge, requests } = await runCedearMerge({
			panel: buildCedearPanel(['AAPL', 'AAPLB', 'C', 'C...B', 'ABNB']),
			histories: { C: thinBars, ABNB: thinBars },
			sheets: {},
		});
		const result = expectCedearMerged(merge);

		expect(result.candidateCount).toBe(3);
		expect(result.droppedVariants).toEqual([
			{ symbol: 'AAPLB', base: 'AAPL' },
			{ symbol: 'C...B', base: 'C' },
		]);
		expect(requests.filter((request) => request.startsWith('history:'))).toEqual([
			'history:AL30',
			'history:AL30D',
			'history:ABNB',
			'history:C',
		]);
	});

	test.each([
		['B alone is a candidate', ['B'], [], ['B']],
		['BB is a variant of a listed B', ['B', 'BB'], [{ symbol: 'BB', base: 'B' }], ['B']],
		['BB without a listed B is a candidate', ['BB'], [], ['BB']],
	])('%s', async (_label, symbols, droppedVariants, candidates) => {
		const histories = Object.fromEntries(symbols.map((symbol) => [symbol, thinBars]));
		const { merge, requests } = await runCedearMerge({
			panel: buildCedearPanel(symbols),
			histories,
			sheets: {},
		});

		expect(expectCedearMerged(merge).droppedVariants).toEqual(droppedVariants);
		expect(
			requests
				.filter((request) => request.startsWith('history:') && !request.includes('AL30'))
				.map((request) => request.replace('history:', '')),
		).toEqual(candidates);
	});

	test('leaves an existing CEDEAR unchanged without fetching it', async () => {
		const { merge, requests } = await runCedearMerge({
			panel: buildCedearPanel(['AAPL']),
			histories: {},
			sheets: {},
		});
		const result = expectCedearMerged(merge);

		expect(result.catalog).toEqual(catalogWithMepSource);
		expect(result.absentInstrumentIds).toEqual([]);
		expect(requests).not.toContain('history:AAPL');
		expect(requests).not.toContain('sheet:AAPL');
	});

	test('derives a clean identifier from a dotted symbol', async () => {
		const { merge } = await runCedearMerge({
			panel: buildCedearPanel(['BA.C']),
			histories: { 'BA.C': liquidBars },
			sheets: { 'BA.C': buildSheet('NYSE', 'BAC') },
		});

		expect(expectCedearMerged(merge).addedInstrumentIds).toEqual(['ba-c-cedear']);
	});

	test('reports a catalog CEDEAR owning a B variant as absent', async () => {
		const catalogWithVariantCedear: InstrumentCatalogValue = {
			...catalogWithMepSource,
			instruments: [
				...catalogWithMepSource.instruments,
				{
					id: 'aaplb-cedear',
					type: 'cedear',
					underlying: { market: 'NASDAQ', ticker: 'AAPL' },
					tradingLines: [
						{
							id: 'aaplb-cedear-byma-ars',
							symbol: 'AAPLB',
							exchange: 'BYMA',
							currency: 'ARS',
						},
					],
				},
			],
		};
		const { merge } = await runCedearMerge(
			{ panel: buildCedearPanel(['AAPL', 'AAPLB']), histories: {}, sheets: {} },
			catalogWithVariantCedear,
		);

		expect(expectCedearMerged(merge).absentInstrumentIds).toEqual(['aaplb-cedear']);
	});

	test('trims the market and ticker of the technical sheet', async () => {
		const { merge } = await runCedearMerge({
			panel: buildCedearPanel(['MELI']),
			histories: { MELI: liquidBars },
			sheets: { MELI: buildSheet('NYSE ', ' X ') },
		});

		expect(expectCedearMerged(merge).catalog.instruments.at(-1)).toMatchObject({
			underlying: { market: 'NYSE', ticker: 'X' },
		});
	});

	test('measures at the previous market session when the through-session has no MEP Rate', async () => {
		const { merge } = await runCedearMerge({
			panel: buildCedearPanel(['MELI']),
			histories: {
				AL30D: createDailyBars(sessionDates.slice(0, 129), 1, 1),
				MELI: liquidBars,
			},
			sheets: { MELI: buildSheet('NASDAQ', 'MELI') },
		});

		expect(expectCedearMerged(merge).measuredAtSession).toBe(sessionDates[128]!);
	});

	test('adds a liquid candidate with invalid bars and reports it', async () => {
		const brokenBars = liquidBars.map((bar, index) =>
			index === 100 ? { ...bar, close: bar.high * 2 } : bar,
		);
		const { merge } = await runCedearMerge({
			panel: buildCedearPanel(['MELI']),
			histories: { MELI: brokenBars },
			sheets: { MELI: buildSheet('NASDAQ', 'MELI') },
		});
		const result = expectCedearMerged(merge);

		expect(result.addedInstrumentIds).toEqual(['meli-cedear']);
		expect(result.addedWithInvalidBars).toEqual([
			{ symbol: 'MELI', message: expect.stringContaining('bars[100].close') },
		]);
	});

	test('reports a catalog CEDEAR absent from the panel without deleting it', async () => {
		const { merge } = await runCedearMerge({
			panel: buildCedearPanel(['THIN']),
			histories: { THIN: thinBars },
			sheets: {},
		});
		const result = expectCedearMerged(merge);

		expect(result.absentInstrumentIds).toEqual(['apple-cedear']);
		expect(result.catalog.instruments.map((instrument) => instrument.id)).toContain(
			'apple-cedear',
		);
	});

	test('reports candidates whose history or technical sheet is unusable and adds the rest', async () => {
		const { merge } = await runCedearMerge({
			panel: buildCedearPanel(['MELI', 'FAIL', 'NOSHEET', 'BLANK', 'TWOSHEETS']),
			histories: {
				MELI: liquidBars,
				FAIL: 'http-error',
				NOSHEET: liquidBars,
				BLANK: liquidBars,
				TWOSHEETS: liquidBars,
			},
			sheets: {
				MELI: buildSheet('NASDAQ', 'MELI'),
				NOSHEET: { content: {}, data: [] },
				BLANK: buildSheet(' ', 'BLANK'),
				TWOSHEETS: {
					data: [...buildSheet('NYSE', 'A').data, ...buildSheet('NYSE', 'B').data],
				},
			},
		});
		const result = expectCedearMerged(merge);

		expect(result.addedInstrumentIds).toEqual(['meli-cedear']);
		expect(result.skippedCandidates.map(({ symbol, reason }) => `${symbol}:${reason}`)).toEqual(
			[
				'BLANK:technical-sheet-unusable',
				'FAIL:history-unavailable',
				'NOSHEET:technical-sheet-unusable',
				'TWOSHEETS:technical-sheet-unusable',
			],
		);
	});

	test('requests history and selects the window through the through-session', async () => {
		// Missing sessions 5–17 leave 112 of the 125 sessions through the through-session traded,
		// below 90%. A window ending ten sessions later would hold only 3 of them and pass.
		const gappedSessions = sessionDates.filter((_, index) => index < 5 || index > 17);
		const { merge, requests } = await runCedearMerge({
			panel: buildCedearPanel(['GAPPY']),
			histories: { GAPPY: createDailyBars(gappedSessions, 1000, 100_000) },
			sheets: { GAPPY: buildSheet('NASDAQ', 'GAPPY') },
		});

		expect(expectCedearMerged(merge).addedInstrumentIds).toEqual([]);
		expect(requests).not.toContain('sheet:GAPPY');
	});

	test('adds CEDEARs in symbol order whatever the panel order', async () => {
		const histories = { MELI: liquidBars, ZZZ: liquidBars, AAA: liquidBars };
		const sheets = {
			MELI: buildSheet('NASDAQ', 'MELI'),
			ZZZ: buildSheet('NYSE', 'ZZZ'),
			AAA: buildSheet('NYSE', 'AAA'),
		};
		const first = await runCedearMerge({
			panel: buildCedearPanel(['ZZZ', 'MELI', 'AAA']),
			histories,
			sheets,
		});
		const second = await runCedearMerge({
			panel: buildCedearPanel(['AAA', 'ZZZ', 'MELI']),
			histories,
			sheets,
		});
		const firstResult = expectCedearMerged(first.merge);

		expect(firstResult.addedInstrumentIds).toEqual(['aaa-cedear', 'meli-cedear', 'zzz-cedear']);
		expect(serializeCatalog(expectCedearMerged(second.merge).catalog)).toBe(
			serializeCatalog(firstResult.catalog),
		);
	});

	test('pauses two seconds, once, between the end of one request and the start of the next', async () => {
		const events: string[] = [];
		const generation = await generateCatalog(catalogWithMepSource, THROUGH_SESSION, {
			fetchFromProvider: createFakeProvider(
				{
					panel: buildCedearPanel(['MELI']),
					histories: { MELI: liquidBars },
					sheets: { MELI: buildSheet('NASDAQ', 'MELI') },
				},
				events,
			),
			pause: (milliseconds) => {
				events.push(`pause:${milliseconds}`);
				return Promise.resolve();
			},
		});

		expect(generation.ok).toBeTrue();
		expect(events).toEqual([
			'leading-panel',
			'pause:2000',
			'panel',
			'pause:2000',
			'history:AL30',
			'pause:2000',
			'history:AL30D',
			'pause:2000',
			'history:MELI',
			'pause:2000',
			'sheet:MELI',
		]);
	});

	test.each([
		[
			'the peso bond cannot be fetched',
			{ AL30: 'http-error' as const },
			'mep-rate-source-unavailable',
		],
		[
			'fewer than 125 market sessions',
			{ AL30: createDailyBars(sessionDates.slice(6), 1000, 1) },
			'insufficient-market-sessions',
		],
		[
			'a MEP rate source bar has a close above its high',
			{
				AL30: mepRateSourceHistories.AL30.map((bar, index) =>
					index === 50 ? { ...bar, close: bar.high * 2 } : bar,
				),
			},
			'mep-rate-source-unavailable',
		],
	])('returns no catalog when %s', async (_label, mepOverrides, reason) => {
		const { merge, requests } = await runCedearMerge({
			panel: buildCedearPanel(['MELI']),
			histories: { ...mepOverrides, MELI: liquidBars },
			sheets: { MELI: buildSheet('NASDAQ', 'MELI') },
		});

		expect(merge).toMatchObject({ ok: false, reason });
		expect(merge).not.toHaveProperty('catalog');
		expect(requests).not.toContain('history:MELI');
	});

	test('accepts a zero open on a MEP rate source bar, as the Analysis Run does', async () => {
		const { merge } = await runCedearMerge({
			panel: buildCedearPanel(['MELI']),
			histories: {
				AL30: mepRateSourceHistories.AL30.map((bar, index) =>
					index === 50 ? { ...bar, open: 0 } : bar,
				),
				MELI: liquidBars,
			},
			sheets: { MELI: buildSheet('NASDAQ', 'MELI') },
		});

		expect(expectCedearMerged(merge).addedInstrumentIds).toEqual(['meli-cedear']);
	});

	test.each([
		['a failed request', 'http-error'],
		['a non-array response', { content: {}, data: [] }],
		[
			'a full page that may be truncated',
			buildCedearPanel(Array.from({ length: 5000 }, (_, i) => `S${i}`)),
		],
		['a panel without ARS 24-hour rows', [{ ...buildRow('AAPLD'), denominationCcy: 'USD' }]],
		['a lowercase symbol', buildCedearPanel(['meli'])],
		['a symbol listed twice', buildCedearPanel(['MELI', 'MELI'])],
	])('returns no catalog for %s', async (_label, panel) => {
		const { merge, requests } = await runCedearMerge({ panel, histories: {}, sheets: {} });

		expect(merge).toMatchObject({ ok: false, reason: 'invalid-panel-response' });
		expect(requests).toEqual(['panel']);
	});

	test('skips, before fetching, candidates that would conflict with the catalog', async () => {
		const catalogWithTakenId: InstrumentCatalogValue = {
			...catalogWithMepSource,
			instruments: [
				...catalogWithMepSource.instruments,
				{
					id: 'taken-cedear',
					type: 'bond',
					tradingLines: [
						{
							id: 'taken-bond-byma-ars',
							symbol: 'TK30',
							exchange: 'BYMA',
							currency: 'ARS',
						},
					],
				},
			],
		};
		const { merge, requests } = await runCedearMerge(
			{
				panel: buildCedearPanel(['GGAL', 'TAKEN', 'BA.C', 'BA..C', 'MELI']),
				histories: { MELI: liquidBars },
				sheets: { MELI: buildSheet('NASDAQ', 'MELI') },
			},
			catalogWithTakenId,
		);
		const result = expectCedearMerged(merge);
		const historyRequests = requests.filter((request) => request.startsWith('history:'));

		expect(result.addedInstrumentIds).toEqual(['meli-cedear']);
		expect(result.skippedCandidates.map(({ symbol, reason }) => `${symbol}:${reason}`)).toEqual(
			[
				'BA..C:catalog-conflict',
				'BA.C:catalog-conflict',
				'GGAL:catalog-conflict',
				'TAKEN:catalog-conflict',
			],
		);
		expect(historyRequests).toEqual(['history:AL30', 'history:AL30D', 'history:MELI']);
	});
});

describe('Through-session', () => {
	test('defaults to the calendar date before today in Buenos Aires', () => {
		// 02:00 UTC on 2026-10-08 is still 2026-10-07 in Buenos Aires.
		expect(resolveThroughSession([], '2026-10-08T02:00:00Z')).toBe('2026-10-06');
	});

	test('takes an explicit completed session over the default', () => {
		expect(
			resolveThroughSession(['--through-session', '2026-10-02'], '2026-10-07T09:00:00Z'),
		).toBe('2026-10-02');
	});

	test.each([
		['an impossible date', ['--through-session', '2026-02-30']],
		["today's market date", ['--through-session', '2026-10-07']],
		['a future date', ['--through-session', '2026-10-08']],
	])('rejects %s', (_label, args) => {
		expect(() => resolveThroughSession(args, '2026-10-07T09:00:00Z')).toThrow();
	});
});

describe('Catalog generation', () => {
	test('returns no catalog when the leading panel request fails', async () => {
		const requests: string[] = [];
		const generation = await generateCatalog(catalogWithMepSource, THROUGH_SESSION, {
			fetchFromProvider: createFakeProvider(
				{ leadingPanel: 'http-error', panel: [], histories: {}, sheets: {} },
				requests,
			),
			pause: () => Promise.resolve(),
		});

		expect(generation).toMatchObject({ ok: false, reason: 'invalid-panel-response' });
		expect(requests).toEqual(['leading-panel']);
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

	test('is the generator output for a CEDEAR panel listing its own CEDEARs', async () => {
		const committedCatalog: InstrumentCatalogValue = {
			schemaVersion: 1,
			instruments: instrumentCatalog.getInstruments(),
		};
		const bymaPesoCedearSymbols = committedCatalog.instruments
			.filter((instrument) => instrument.type === 'cedear')
			.flatMap((cedear) => cedear.tradingLines)
			.filter((line) => line.exchange === 'BYMA' && line.currency === 'ARS')
			.map((line) => line.symbol);
		const committedFile = await Bun.file(
			new URL(
				'../src/modules/instrument-catalog/data/instrument-catalog.v1.json',
				import.meta.url,
			),
		).text();
		const { merge, requests } = await runCedearMerge(
			{ panel: buildCedearPanel(bymaPesoCedearSymbols), histories: {}, sheets: {} },
			committedCatalog,
		);
		const result = expectCedearMerged(merge);

		expect(result.addedInstrumentIds).toEqual([]);
		expect(result.absentInstrumentIds).toEqual([]);
		expect(requests).toEqual(['panel', 'history:AL30', 'history:AL30D']);
		expect(serializeCatalog(result.catalog)).toBe(committedFile);
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

type HistoryResponse = readonly DailyBar[] | 'http-error';

type FakeCedearProvider = Readonly<{
	leadingPanel?: unknown;
	panel: unknown;
	histories: Readonly<Record<string, HistoryResponse>>;
	sheets: Readonly<Record<string, unknown>>;
}>;

async function runCedearMerge(
	provider: FakeCedearProvider,
	catalog: InstrumentCatalogValue = catalogWithMepSource,
) {
	const requests: string[] = [];
	const merge = await mergeLiquidCedears(catalog, THROUGH_SESSION, {
		fetchFromProvider: createFakeProvider(provider, requests),
	});

	return { merge, requests };
}

function createFakeProvider(provider: FakeCedearProvider, requests: string[]) {
	const histories: Readonly<Record<string, HistoryResponse>> = {
		...mepRateSourceHistories,
		...provider.histories,
	};

	return (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const url = new URL(input instanceof Request ? input.url : input);

		if (url.pathname.endsWith('/leading-equity')) {
			requests.push('leading-panel');
			return Promise.resolve(
				createJsonResponse(provider.leadingPanel ?? buildPanel(['GGAL'])),
			);
		}

		if (url.pathname.endsWith('/cedears')) {
			requests.push('panel');
			return Promise.resolve(createJsonResponse(provider.panel));
		}

		if (url.pathname.endsWith('/general')) {
			const { symbol } = JSON.parse(init?.body as string) as { symbol: string };
			requests.push(`sheet:${symbol}`);
			const sheet = provider.sheets[symbol];
			return Promise.resolve(
				sheet === undefined ? new Response(null, { status: 500 }) : Response.json(sheet),
			);
		}

		const symbol = url.searchParams.get('symbol')!.replace(' 24HS', '');
		requests.push(`history:${symbol}`);
		return Promise.resolve(createHistoryResponse(histories[symbol]));
	};
}

function createJsonResponse(body: unknown): Response {
	return body === 'http-error' ? new Response(null, { status: 500 }) : Response.json(body);
}

function createHistoryResponse(history: HistoryResponse | undefined): Response {
	if (!history || history === 'http-error') {
		return new Response(null, { status: 500 });
	}

	return Response.json({
		s: 'ok',
		t: history.map((bar) => convertSessionDateToEpochSeconds(bar.sessionDate)),
		o: history.map((bar) => bar.open),
		h: history.map((bar) => bar.high),
		l: history.map((bar) => bar.low),
		c: history.map((bar) => bar.close),
		v: history.map((bar) => bar.volume),
	});
}

function convertSessionDateToEpochSeconds(sessionDate: string): number {
	const zonedMidnight = Temporal.PlainDate.from(sessionDate).toZonedDateTime(
		'America/Argentina/Buenos_Aires',
	);
	return zonedMidnight.epochMilliseconds / 1_000;
}

function createDailyBars(
	dates: readonly string[],
	price: number,
	volume: number,
): readonly DailyBar[] {
	return dates.map((sessionDate) => ({
		sessionDate,
		open: price,
		high: price,
		low: price,
		close: price,
		volume,
	}));
}

function buildCedearPanel(symbols: readonly string[]) {
	return symbols.map((symbol) => ({ ...buildRow(symbol), securityType: 'CD', closingPrice: 0 }));
}

function buildSheet(market: string, ticker: string) {
	return {
		content: { total_elements_count: 1 },
		data: [{ tipoEspecie: 'Cedears', mercadoOrigen: market, simboloMercado: ticker }],
	};
}

function expectCedearMerged(merge: Awaited<ReturnType<typeof mergeLiquidCedears>>) {
	if (!merge.ok) {
		throw new Error(`Expected a successful CEDEAR merge, got ${merge.reason}.`);
	}

	return merge;
}
