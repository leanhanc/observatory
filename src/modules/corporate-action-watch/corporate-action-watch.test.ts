import { describe, expect, test } from 'bun:test';

import {
	findCorporateActionCandidates,
	validateWatchRules,
	watchCorporateActions,
} from './corporate-action-watch.ts';
import { RELEVANT_FACTS_URL, watchRules } from './index.ts';

import type { CorporateAction } from '#modules/corporate-actions/index.ts';
import type { RelevantFact, WatchedTradingLine } from './corporate-action-watch.types.ts';

const COMAFI = 'BANCO COMAFI S.A.';
const CAJA_DE_VALORES = 'Caja de Valores S.A.';
const MACRO = 'BANCO MACRO S.A.';
const PDF_URL_PREFIX =
	'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/';

// Rows observed in the feed, from docs/research/open-bymadata-relevant-facts.md, unless a test says
// it adapted one.
const ETHA_REVERSE_SPLIT = createFact(
	501592,
	'2026-10-06T15:28:24',
	CAJA_DE_VALORES,
	'',
	'Hecho Relevante de Cedear - ETHA - Ishares Ethereum Trust - Anuncio de Reverse Stock Split',
);
const NOW_SPLIT = createFact(
	483240,
	'2025-12-11T13:27:09',
	COMAFI,
	'BCOM',
	'Hecho Relevante de Cedear - NOW - SERVICENOW INC. - Anuncia Stock Split',
);
const SPY_RATIO_CHANGE = createFact(
	493877,
	'2026-05-27T10:12:03',
	CAJA_DE_VALORES,
	'',
	'Hecho Relevante de Cedear - SPY - SPDR S&P 500 ETF TRUST: Anuncia cambio de ratio y split',
);
const HUT_RATIO_CHANGE = createFact(
	493878,
	'2026-05-27T10:12:25',
	CAJA_DE_VALORES,
	'',
	'Hecho relevante - HUT 8 CORP.: Anuncia cambio de ratio y split',
);
const SECTOR_FUNDS_SPLIT = createFact(
	482245,
	'2025-11-25T17:41:39',
	COMAFI,
	'BCOM',
	'Hecho Relevante de Cedear - XLK - The Technology Select Sector SPDR Fund - XLY - The Consumer Discretionary Select Sector SPDR Fund - XLB - The Materials Select Sector SPDR Fund - Anuncian Stock Split',
);
const NVDA_CASH_DISTRIBUTION = createFact(
	468069,
	'2025-04-04T09:55:18',
	COMAFI,
	'BCOM',
	'Aviso de pago de servicios o renta de Cedear - NVDA - NVIDIA CORPORATION',
);
const VALO_RELATED_PARTIES = createFact(
	468353,
	'2025-04-09T13:05:50',
	'BANCO DE VALORES S.A.',
	'VALO',
	'Hecho relevante - Informa transacciones con partes relacionadas',
);
const UL_FOLLOW_UPS = [
	createFact(
		479872,
		'2025-10-23T09:34:01',
		COMAFI,
		'BCOM',
		'Hecho Relevante de Cedear - UL - UNILEVER PLC-SPONSORED ADR -  Amplia información sobre Anuncio de Reverse Stock Split',
	),
	createFact(
		479389,
		'2025-10-13T17:54:30',
		COMAFI,
		'BCOM',
		'Hecho Relevante de Cedear - UL - UNILEVER PLC-SPONSORED ADR - Anuncia Reverse Stock Split',
	),
	createFact(
		479413,
		'2025-10-14T10:09:28',
		COMAFI,
		'BCOM',
		'Hecho Relevante de Cedear - UL - UNILEVER PLC-SPONSORED ADR - Anuncia Reverse Stock Split - Rectificativo',
	),
];
// SEMI's stock-dividend payment notice (479966), published under Telecom's issuer code.
const TECO_STOCK_DIVIDEND = createFact(
	479966,
	'2025-10-24T10:59:51',
	'TELECOM ARGENTINA S. A.',
	'TECO',
	'Aviso de pago de Capitalizaciones / Dividendo en acciones - Pago de dividendo en acciones',
);

const TRADING_LINES: readonly WatchedTradingLine[] = [
	createLine('etha-cedear-byma-ars', 'ETHA', 'cedear'),
	createLine('now-cedear-byma-ars', 'NOW', 'cedear'),
	createLine('spy-cedear-byma-ars', 'SPY', 'cedear'),
	createLine('hut-cedear-byma-ars', 'HUT', 'cedear'),
	createLine('xlk-cedear-byma-ars', 'XLK', 'cedear'),
	createLine('xlb-cedear-byma-ars', 'XLB', 'cedear'),
	createLine('ul-cedear-byma-ars', 'UL', 'cedear'),
	createLine('nvda-cedear-byma-ars', 'NVDA', 'cedear'),
	createLine('teco2-stock-byma-ars', 'TECO2', 'stock'),
	createLine('macro-stock-byma-ars', 'BMA', 'stock'),
	createLine('valo-stock-byma-ars', 'VALO', 'stock'),
];

const ETHA_ENTRY: CorporateAction = {
	tradingLineId: 'etha-cedear-byma-ars',
	exDate: '2026-10-06',
	priceFactor: 3,
	kind: 'reverse-split',
	sourceUrl: `${PDF_URL_PREFIX}501592`,
};

describe('the committed watch rules', () => {
	test('name the program issuers, aliases, phrases and excluded prefix', () => {
		expect(watchRules).toEqual({
			schemaVersion: 1,
			cedearProgramIssuers: [COMAFI, CAJA_DE_VALORES, MACRO],
			stockIssuerCodes: { SUPV: 'GSUP', TECO2: 'TECO', TGNO4: 'TGNO', TGSU2: 'TGSU' },
			cedearNameAliases: { 'HUT 8 CORP.': 'HUT' },
			eventPhrases: [
				'stock split',
				'reverse stock split',
				'cambio de ratio',
				'dividendo en acciones',
				'dividendos en acciones',
				'capitalizaciones',
				'stock dividend',
				'dividendo opcional',
			],
			excludedTitlePrefixes: ['Aviso de pago de servicios o renta de Cedear'],
		});
	});
});

describe('validateWatchRules', () => {
	test.each([
		['eventPhrases', ['Stock Split']],
		['eventPhrases', ['stock split', 'stock split']],
		['eventPhrases', [' stock split']],
		['cedearProgramIssuers', []],
		['stockIssuerCodes', { TECO2: 'teco' }],
		['cedearNameAliases', { 'HUT 8 CORP.': 'Hut' }],
	])('rejects %s %p', (field, value) => {
		const validation = validateWatchRules({ ...watchRules, [field]: value });

		expect(validation.isValid).toBe(false);
		expect(!validation.isValid && validation.issues[0]!.path).toStartWith(field);
	});

	test('rejects an extra field', () => {
		expect(validateWatchRules({ ...watchRules, note: 'unsupported' }).isValid).toBe(false);
	});
});

describe('findCorporateActionCandidates', () => {
	test("matches ETHA's reverse split and marks it listed", () => {
		const candidates = findCandidates([ETHA_REVERSE_SPLIT], [ETHA_ENTRY]);

		expect(candidates).toEqual([
			{
				tradingLineId: 'etha-cedear-byma-ars',
				isListed: true,
				notices: [
					{
						documentId: 501592,
						publishedAt: '2026-10-06T15:28:24',
						title: ETHA_REVERSE_SPLIT.title,
						pdfUrl: `${PDF_URL_PREFIX}501592`,
					},
				],
			},
		]);
	});

	test("matches NOW's split and marks it unlisted", () => {
		const candidates = findCandidates([NOW_SPLIT], [ETHA_ENTRY]);

		expect(candidates).toMatchObject([
			{ tradingLineId: 'now-cedear-byma-ars', isListed: false },
		]);
	});

	test('matches a ticker before a colon and a company-name alias', () => {
		const candidates = findCandidates([SPY_RATIO_CHANGE, HUT_RATIO_CHANGE]);

		expect(summarize(candidates)).toEqual([
			['spy-cedear-byma-ars', [493877]],
			['hut-cedear-byma-ars', [493878]],
		]);
	});

	test('matches every analyzed ticker of a multi-ticker notice', () => {
		const candidates = findCandidates([SECTOR_FUNDS_SPLIT]);

		expect(summarize(candidates)).toEqual([
			['xlk-cedear-byma-ars', [482245]],
			['xlb-cedear-byma-ars', [482245]],
		]);
	});

	test('matches a suffixed local stock through its issuer code', () => {
		const candidates = findCandidates([TECO_STOCK_DIVIDEND]);

		expect(summarize(candidates)).toEqual([['teco2-stock-byma-ars', [479966]]]);
	});

	test('does not match a suffixed stock by its own symbol', () => {
		const candidates = findCandidates([{ ...TECO_STOCK_DIVIDEND, especie: 'TECO2' }]);

		expect(candidates).toEqual([]);
	});

	test("matches Banco Macro's own notice to its stock, but not its CEDEAR notices", () => {
		// Adapted: Macro's CEDEAR notice shape with an event, and its own payment notice.
		const macroCedearSplit = createFact(
			900001,
			'2026-10-05T10:00:00',
			MACRO,
			'BMA',
			'Hecho Relevante de Cedear - RCTB4 - TELEBRAS PN (recibos de cartera) - Anuncio de Stock Split',
		);
		const macroShareDistribution = createFact(
			900002,
			'2026-10-06T10:00:00',
			MACRO,
			'BMA',
			'Aviso de pago de Capitalizaciones / Dividendo en acciones - Pago de dividendo en acciones',
		);

		const candidates = findCandidates([macroCedearSplit, macroShareDistribution]);

		expect(summarize(candidates)).toEqual([['macro-stock-byma-ars', [900002]]]);
	});

	test('does not match a CEDEAR ticker in a notice from a local issuer', () => {
		// Adapted: a local issuer's title that names a CEDEAR ticker as a piece.
		const localNotice = createFact(
			900003,
			'2026-10-05T10:00:00',
			'MOLINOS JUAN SEMINO S.A.',
			'SEMI',
			'Hecho relevante - NOW - Anuncio de Stock Split',
		);

		expect(findCandidates([localNotice])).toEqual([]);
	});

	test('excludes CEDEAR cash distributions even when the title names an event', () => {
		// Adapted: the cash-distribution prefix with an event phrase appended.
		const cashDistribution = {
			...NVDA_CASH_DISTRIBUTION,
			title: `${NVDA_CASH_DISTRIBUTION.title} - Dividendo en acciones`,
		};

		expect(findCandidates([NVDA_CASH_DISTRIBUTION, cashDistribution])).toEqual([]);
	});

	test('does not match "transacciones" or "CORPORATION"', () => {
		expect(findCandidates([VALO_RELATED_PARTIES, NVDA_CASH_DISTRIBUTION])).toEqual([]);
	});

	test('matches a phrase only as whole words', () => {
		// With bare phrases, substring matching would hit both titles; whole-word matching hits neither.
		const bareRules = {
			...watchRules,
			eventPhrases: ['acciones', 'ratio'],
			excludedTitlePrefixes: [],
		};
		const candidates = findCorporateActionCandidates(
			[VALO_RELATED_PARTIES, NVDA_CASH_DISTRIBUTION],
			TRADING_LINES,
			[],
			bareRules,
		);

		expect(candidates).toEqual([]);
	});

	test('matches a phrase across the double spaces publishers type', () => {
		const doubleSpaced = {
			...NOW_SPLIT,
			title: 'Hecho Relevante de Cedear - NOW - SERVICENOW INC. - Anuncia Stock  Split',
		};

		expect(summarize(findCandidates([doubleSpaced]))).toEqual([
			['now-cedear-byma-ars', [483240]],
		]);
	});

	test('groups an event and its follow-ups into one candidate, in publication order', () => {
		const candidates = findCandidates(UL_FOLLOW_UPS);

		expect(summarize(candidates)).toEqual([['ul-cedear-byma-ars', [479389, 479413, 479872]]]);
	});

	test.each([
		['the publication is 10 days before the ex-date', '2026-10-16', true],
		['the publication is 10 days after the ex-date', '2026-09-26', true],
		['the publication is 11 days before the ex-date', '2026-10-17', false],
		['the publication is 11 days after the ex-date', '2026-09-25', false],
	])('marks a candidate listed when %s: %s', (_, exDate, isListed) => {
		const candidates = findCandidates([ETHA_REVERSE_SPLIT], [{ ...ETHA_ENTRY, exDate }]);

		expect(candidates[0]!.isListed).toBe(isListed);
	});

	test("does not take another line's entry as listing a candidate", () => {
		const candidates = findCandidates([NOW_SPLIT], [{ ...ETHA_ENTRY, exDate: '2025-12-18' }]);

		expect(candidates[0]!.isListed).toBe(false);
	});
});

describe('watchCorporateActions', () => {
	test('posts the seven days ending on the Requested-Through Session', async () => {
		const requests: { url: string; method: string | undefined; body: unknown }[] = [];

		const watch = await watchCorporateActions({
			fetchFromProvider: (input, init) => {
				const url = input instanceof Request ? input.url : input.toString();
				requests.push({ url, method: init?.method, body: init?.body });
				return Promise.resolve(createFeedResponse([ETHA_REVERSE_SPLIT]));
			},
			requestedThroughSession: '2026-10-08',
			tradingLines: TRADING_LINES,
			corporateActions: [ETHA_ENTRY],
			rules: watchRules,
		});

		expect(requests).toHaveLength(1);
		expect(requests[0]!.url).toBe(RELEVANT_FACTS_URL);
		expect(requests[0]!.method).toBe('POST');
		expect(JSON.parse(requests[0]!.body as string)).toEqual({
			publishDate: '2026-10-02',
			publishToDate: '2026-10-08',
			textFilter: null,
			filter: true,
			dateEntryFrom: null,
			dateEntryTo: null,
			page_size: 5000,
		});
		expect(watch).toMatchObject({
			status: 'available',
			publishedFrom: '2026-10-02',
			publishedThrough: '2026-10-08',
			candidates: [{ tradingLineId: 'etha-cedear-byma-ars', isListed: true }],
		});
	});

	test.each([
		['an HTTP error', () => new Response(null, { status: 503 }), 'HTTP 503'],
		['a body that is not JSON', () => new Response('<html>maintenance</html>'), 'not JSON'],
		['an unexpected shape', () => Response.json({ data: [] }), 'expected shape'],
		[
			'a malformed publication time',
			() =>
				Response.json({
					content: { total_elements_count: 1 },
					data: [{ ...toFeedRow(NOW_SPLIT), fecha: '2025-13-11 13:27:09.0' }],
				}),
			'expected shape',
		],
		[
			'a paginated answer',
			() =>
				Response.json({
					content: { total_elements_count: 300 },
					data: [toFeedRow(NOW_SPLIT)],
				}),
			'1 of 300 rows',
		],
	])('records the watch as unavailable on %s', async (_, respond, messagePart) => {
		const watch = await watchWithFeed(() => Promise.resolve(respond()));

		expect(watch).toMatchObject({
			status: 'unavailable',
			publishedFrom: '2026-10-02',
			publishedThrough: '2026-10-08',
			message: expect.stringContaining(messagePart),
		});
	});

	test('records the watch as unavailable when the request fails', async () => {
		const watch = await watchWithFeed(() => Promise.reject(new Error('timeout')));

		expect(watch).toMatchObject({
			status: 'unavailable',
			message: expect.stringContaining('reached'),
		});
	});
});

function findCandidates(
	facts: readonly RelevantFact[],
	corporateActions: readonly CorporateAction[] = [],
) {
	return findCorporateActionCandidates(facts, TRADING_LINES, corporateActions, watchRules);
}

function summarize(
	candidates: ReturnType<typeof findCandidates>,
): readonly (readonly [string, readonly number[]])[] {
	return candidates.map((candidate) => [
		candidate.tradingLineId,
		candidate.notices.map((notice) => notice.documentId),
	]);
}

function watchWithFeed(fetchFromProvider: () => Promise<Response>) {
	return watchCorporateActions({
		fetchFromProvider,
		requestedThroughSession: '2026-10-08',
		tradingLines: TRADING_LINES,
		corporateActions: [],
		rules: watchRules,
	});
}

function createFeedResponse(facts: readonly RelevantFact[]): Response {
	return Response.json({
		content: {
			page_number: 1,
			page_count: 1,
			page_size: 5000,
			total_elements_count: facts.length,
		},
		data: facts.map(toFeedRow),
	});
}

function toFeedRow(fact: RelevantFact) {
	return {
		especie: fact.especie,
		fecha: `${fact.publishedAt.replace('T', ' ')}.0`,
		tipoArchivo: 'pdf',
		descarga: fact.documentId,
		referencia: fact.title,
		emisor: fact.emisor,
	};
}

function createFact(
	documentId: number,
	publishedAt: string,
	emisor: string,
	especie: string,
	title: string,
): RelevantFact {
	return { documentId, publishedAt, emisor, especie, title };
}

function createLine(
	tradingLineId: string,
	symbol: string,
	instrumentType: 'stock' | 'cedear',
): WatchedTradingLine {
	return { tradingLineId, symbol, instrumentType };
}
