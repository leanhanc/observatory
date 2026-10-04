/* oxlint-disable no-console -- This development command reports what it merged into the catalog. */
import { rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import * as v from 'valibot';

import { instrumentCatalog, validateInstrumentCatalog } from '#modules/instrument-catalog/index.ts';

import type {
	Instrument,
	InstrumentCatalogValidationIssue,
	InstrumentCatalogValue,
	StockInstrument,
} from '#modules/instrument-catalog/index.ts';

const LEADING_PANEL_URL =
	'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/leading-equity';
// `excludeZeroPxAndQty: false` keeps rows without trades, so the panel lists its members even on
// weekends, when every price is zero. `T1` selects 24-hour settlement.
const LEADING_PANEL_REQUEST_BODY = JSON.stringify({
	excludeZeroPxAndQty: false,
	T1: true,
	T0: false,
	page_size: 5_000,
});
const REQUEST_TIMEOUT_MS = 20_000;
const CATALOG_PATH = fileURLToPath(
	new URL('../src/modules/instrument-catalog/data/instrument-catalog.v1.json', import.meta.url),
);
const PESO_CURRENCY = 'ARS';
// Open BYMADATA's settlement code for 24HS.
const TWENTY_FOUR_HOUR_SETTLEMENT = '2';
// BYMA symbols are uppercase letters and digits, dot-padded when short. Anything else means the
// response changed shape, and accepting it would make every stored symbol look absent.
const BYMA_SYMBOL_PATTERN = /^[A-Z0-9.]+$/;

const leadingPanelResponseSchema = v.object({
	content: v.object({ total_elements_count: v.number() }),
	data: v.array(
		v.object({
			symbol: v.pipe(v.string(), v.regex(BYMA_SYMBOL_PATTERN)),
			denominationCcy: v.string(),
			settlementType: v.string(),
		}),
	),
});

type LeadingPanelParse =
	| Readonly<{ ok: true; symbols: readonly string[] }>
	| Readonly<{ ok: false; reason: 'invalid-panel-response'; message: string }>;

export type LeadingPanelMerge =
	| Readonly<{
			ok: true;
			catalog: InstrumentCatalogValue;
			addedInstrumentIds: readonly string[];
			absentInstrumentIds: readonly string[];
	  }>
	| Readonly<{ ok: false; reason: 'invalid-panel-response'; message: string }>
	| Readonly<{
			ok: false;
			reason: 'invalid-catalog';
			issues: readonly InstrumentCatalogValidationIssue[];
	  }>;

/**
 * Merges the leading panel's peso 24-hour lines into a version-1 catalog as stock Instruments.
 * Existing Instruments are never changed or removed. Catalog stocks with a BYMA ARS line absent
 * from the panel are reported, not deleted; they are departed leaders only while the catalog's
 * BYMA ARS stocks are exactly the leaders. Returns no catalog when the panel response or the
 * merged catalog is invalid, so a caller writes only a successful result.
 */
export function mergeLeadingPanel(
	currentCatalog: InstrumentCatalogValue,
	panelResponse: unknown,
): LeadingPanelMerge {
	const panel = parseLeadingPanel(panelResponse);

	if (!panel.ok) {
		return panel;
	}

	const stocksBySymbol = mapStocksByBymaPesoSymbol(currentCatalog.instruments);
	const leaderSymbols = new Set(panel.symbols);
	const newLeaderSymbols = panel.symbols
		.filter((symbol) => !stocksBySymbol.has(symbol))
		.toSorted();
	const addedStocks = newLeaderSymbols.map(buildLeaderStock);
	const absentStockIds = [...stocksBySymbol]
		.filter(([symbol]) => !leaderSymbols.has(symbol))
		.map(([, stock]) => stock.id);
	const absentInstrumentIds = [...new Set(absentStockIds)];
	const mergedCatalog = {
		...currentCatalog,
		instruments: [...currentCatalog.instruments, ...addedStocks],
	};
	const validation = validateInstrumentCatalog(mergedCatalog);

	if (!validation.isValid) {
		return { ok: false, reason: 'invalid-catalog', issues: validation.issues };
	}

	return {
		ok: true,
		catalog: validation.catalog,
		addedInstrumentIds: addedStocks.map((stock) => stock.id),
		absentInstrumentIds,
	};
}

/** Serializes the catalog the way it is committed: tab-indented with a trailing newline. */
export function serializeCatalog(catalog: InstrumentCatalogValue): string {
	return `${JSON.stringify(catalog, null, '\t')}\n`;
}

function parseLeadingPanel(panelResponse: unknown): LeadingPanelParse {
	const parse = v.safeParse(leadingPanelResponseSchema, panelResponse);

	if (!parse.success) {
		return invalidPanelResponse('The leading panel response does not have the expected shape.');
	}

	const { content, data } = parse.output;
	// A paginated or truncated response would make every omitted leader look departed.
	const isComplete = data.length === content.total_elements_count;

	if (!isComplete) {
		return invalidPanelResponse(
			`The leading panel returned ${data.length} of ${content.total_elements_count} rows.`,
		);
	}

	const pesoTwentyFourHourRows = data.filter(
		(row) =>
			row.denominationCcy === PESO_CURRENCY &&
			row.settlementType === TWENTY_FOUR_HOUR_SETTLEMENT,
	);

	if (pesoTwentyFourHourRows.length === 0) {
		return invalidPanelResponse('The leading panel has no ARS 24-hour rows.');
	}

	const symbols = pesoTwentyFourHourRows.map((row) => row.symbol);
	const duplicateSymbols = symbols.filter((symbol, index) => symbols.indexOf(symbol) !== index);

	if (duplicateSymbols.length > 0) {
		return invalidPanelResponse(
			`The leading panel lists ${duplicateSymbols.join(', ')} more than once.`,
		);
	}

	return { ok: true, symbols };
}

function invalidPanelResponse(message: string): LeadingPanelParse {
	return { ok: false, reason: 'invalid-panel-response', message };
}

function mapStocksByBymaPesoSymbol(instruments: readonly Instrument[]): Map<string, Instrument> {
	const stocksBySymbol = new Map<string, Instrument>();

	for (const instrument of instruments) {
		if (instrument.type !== 'stock') {
			continue;
		}

		for (const tradingLine of instrument.tradingLines) {
			const isBymaPesoLine =
				tradingLine.exchange === 'BYMA' && tradingLine.currency === PESO_CURRENCY;

			if (isBymaPesoLine) {
				stocksBySymbol.set(tradingLine.symbol, instrument);
			}
		}
	}

	return stocksBySymbol;
}

// The panel carries no issuer name (`description` and `securityDesc` are empty), so a new
// Instrument's id comes from its BYMA symbol.
function buildLeaderStock(symbol: string): StockInstrument {
	const symbolSlug = symbol
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, '-')
		.replaceAll(/^-|-$/g, '');
	const instrumentId = `${symbolSlug}-stock`;

	return {
		id: instrumentId,
		type: 'stock',
		tradingLines: [
			{ id: `${instrumentId}-byma-ars`, symbol, exchange: 'BYMA', currency: 'ARS' },
		],
	};
}

async function generate(): Promise<void> {
	// Importing the catalog module already validated the stored file and would have thrown.
	const storedCatalog: InstrumentCatalogValue = {
		schemaVersion: 1,
		instruments: instrumentCatalog.getInstruments(),
	};
	const response = await fetch(LEADING_PANEL_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: LEADING_PANEL_REQUEST_BODY,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	if (!response.ok) {
		throw new Error(`The leading panel request failed with HTTP ${response.status}.`);
	}

	const merge = mergeLeadingPanel(storedCatalog, await response.json());

	if (!merge.ok) {
		throw new Error(`${merge.reason}: ${describeMergeFailure(merge)}`);
	}

	await writeCatalogAtomically(serializeCatalog(merge.catalog));
	printReport(merge);
}

// Renaming within one directory replaces the file in one step, so an interrupted write never
// leaves a truncated catalog behind.
async function writeCatalogAtomically(contents: string): Promise<void> {
	const temporaryPath = `${CATALOG_PATH}.${process.pid}.tmp`;

	await Bun.write(temporaryPath, contents);
	await rename(temporaryPath, CATALOG_PATH);
}

function describeMergeFailure(merge: Extract<LeadingPanelMerge, { ok: false }>): string {
	if (merge.reason === 'invalid-panel-response') {
		return merge.message;
	}

	return merge.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
}

function printReport(merge: Extract<LeadingPanelMerge, { ok: true }>): void {
	const { addedInstrumentIds, absentInstrumentIds } = merge;
	const mayContainSymbolChange = addedInstrumentIds.length > 0 && absentInstrumentIds.length > 0;

	console.log(`Added ${addedInstrumentIds.length}: ${addedInstrumentIds.join(', ') || 'none'}.`);

	if (absentInstrumentIds.length > 0) {
		console.log(
			`Catalog stocks with a BYMA ARS line absent from the leading panel, kept: ${absentInstrumentIds.join(', ')}.`,
		);
	}

	if (mayContainSymbolChange) {
		console.log(
			'Stocks were both added and found absent. Before committing, check whether any is the same company under a changed symbol; if so, update the existing line symbol instead of keeping a new Instrument.',
		);
	}

	console.log(`Written to ${CATALOG_PATH}.`);
}

if (import.meta.main) {
	try {
		await generate();
	} catch (error) {
		console.error(
			`Catalog generation failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exitCode = 1;
	}
}
