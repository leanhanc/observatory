/* oxlint-disable no-await-in-loop, no-console -- Sequential requests limit provider traffic; this development command reports what it merged into the catalog. */
import { rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import * as v from 'valibot';

import { checkIfIsoDateIsValid } from '#lib/utils/validation.ts';
import { resolvePreviousMarketDate } from '#modules/analysis-run/index.ts';
import {
	createOpenBymadataAdapter,
	createOpenBymadataBarHistoryAcquirer,
	validateDailyBars,
} from '#modules/bar-history/index.ts';
import {
	MEP_RATE_SOURCE,
	calculateMepRates,
	validateMepRateSourceBars,
} from '#modules/dollarized-series/index.ts';
import { instrumentCatalog, validateInstrumentCatalog } from '#modules/instrument-catalog/index.ts';
import {
	evaluateLiquidityEligibility,
	selectLiquidityWindow,
} from '#modules/liquidity-eligibility/index.ts';

import type { BarHistoryAcquirer, DailyBar, ValidationIssue } from '#modules/bar-history/index.ts';
import type {
	CedearInstrument,
	Instrument,
	InstrumentCatalogValidationIssue,
	InstrumentCatalogValue,
	StockInstrument,
} from '#modules/instrument-catalog/index.ts';
import type { LiquidityWindow } from '#modules/liquidity-eligibility/index.ts';

const OPEN_BYMADATA_URL = 'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free';
const LEADING_PANEL_URL = `${OPEN_BYMADATA_URL}/leading-equity`;
const CEDEAR_PANEL_URL = `${OPEN_BYMADATA_URL}/cedears`;
const TECHNICAL_SHEET_URL = `${OPEN_BYMADATA_URL}/bnown/fichatecnica/especies/general`;
const PANEL_PAGE_SIZE = 5_000;
// `excludeZeroPxAndQty: false` keeps rows without trades, so a panel lists its members even on
// weekends, when every price is zero. `T1` selects 24-hour settlement.
const PANEL_REQUEST_BODY = JSON.stringify({
	excludeZeroPxAndQty: false,
	T1: true,
	T0: false,
	page_size: PANEL_PAGE_SIZE,
});
const REQUEST_TIMEOUT_MS = 20_000;
// Open BYMADATA's anonymous rate limit is undocumented; this matches the research's pacing.
const REQUEST_PAUSE_MS = 2_000;
const MARKET_TIME_ZONE = 'America/Argentina/Buenos_Aires';
const PROGRESS_INTERVAL = 50;
const CATALOG_PATH = fileURLToPath(
	new URL('../src/modules/instrument-catalog/data/instrument-catalog.v1.json', import.meta.url),
);
const PESO_CURRENCY = 'ARS';
// Open BYMADATA's settlement code for 24HS.
const TWENTY_FOUR_HOUR_SETTLEMENT = '2';
// BYMA symbols are uppercase letters and digits, dot-padded when short. Anything else means the
// response changed shape, and accepting it would make every stored symbol look absent.
const BYMA_SYMBOL_PATTERN = /^[A-Z0-9.]+$/;

const panelRowSchema = v.object({
	symbol: v.pipe(v.string(), v.regex(BYMA_SYMBOL_PATTERN)),
	denominationCcy: v.string(),
	settlementType: v.string(),
});
const leadingPanelResponseSchema = v.object({
	content: v.object({ total_elements_count: v.number() }),
	data: v.array(panelRowSchema),
});
// Unlike the leading panel, the `cedears` panel is a bare array with no element count.
const cedearPanelResponseSchema = v.array(panelRowSchema);
const technicalSheetResponseSchema = v.object({
	data: v.array(
		v.object({
			mercadoOrigen: v.nullish(v.string()),
			simboloMercado: v.nullish(v.string()),
		}),
	),
});

// Shared

type PanelRow = v.InferOutput<typeof panelRowSchema>;

type InvalidPanelResponse = Readonly<{
	ok: false;
	reason: 'invalid-panel-response';
	message: string;
}>;

type PanelParse = Readonly<{ ok: true; symbols: readonly string[] }> | InvalidPanelResponse;

type InvalidCatalog = Readonly<{
	ok: false;
	reason: 'invalid-catalog';
	issues: readonly InstrumentCatalogValidationIssue[];
}>;

type ProviderFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type Pause = (milliseconds: number) => Promise<void>;

// Leading panel

export type LeadingPanelMerge =
	| Readonly<{
			ok: true;
			catalog: InstrumentCatalogValue;
			addedInstrumentIds: readonly string[];
			absentInstrumentIds: readonly string[];
	  }>
	| InvalidPanelResponse
	| InvalidCatalog;

// CEDEARs

export type CedearMergeDependencies = Readonly<{
	/** Already paced by the caller; the merge issues one request at a time. */
	fetchFromProvider: ProviderFetch;
	reportProgress?: (message: string) => void;
}>;

export type SkippedCedearCandidate = Readonly<{
	symbol: string;
	reason: 'catalog-conflict' | 'history-unavailable' | 'technical-sheet-unusable';
	message: string;
}>;

export type CedearMerge =
	| Readonly<{
			ok: true;
			catalog: InstrumentCatalogValue;
			measuredAtSession: string;
			candidateCount: number;
			/** Each `B` variant dropped from the candidates, with the listed base it duplicates. */
			droppedVariants: readonly Readonly<{ symbol: string; base: string }>[];
			addedInstrumentIds: readonly string[];
			/** Added because they are liquid; the Analysis Run will report them as `invalid-bars`. */
			addedWithInvalidBars: readonly Readonly<{ symbol: string; message: string }>[];
			absentInstrumentIds: readonly string[];
			ineligibleCount: number;
			skippedCandidates: readonly SkippedCedearCandidate[];
	  }>
	| InvalidPanelResponse
	| Readonly<{
			ok: false;
			reason: 'mep-rate-source-unavailable' | 'insufficient-market-sessions';
			message: string;
	  }>
	| InvalidCatalog;

type CedearCandidates = Readonly<{
	symbols: readonly string[];
	droppedVariants: readonly Readonly<{ symbol: string; base: string }>[];
}>;

type CandidateEvaluation =
	| Readonly<{ status: 'added'; cedear: CedearInstrument; invalidBarsMessage: string | null }>
	| Readonly<{ status: 'ineligible' }>
	| Readonly<{ status: 'skipped'; candidate: SkippedCedearCandidate }>;

type MepRateSourceWindow =
	| Readonly<{ ok: true; window: LiquidityWindow }>
	| Readonly<{
			ok: false;
			reason: 'mep-rate-source-unavailable' | 'insufficient-market-sessions';
			message: string;
	  }>;

type HistoryFetch =
	| Readonly<{ ok: true; bars: readonly DailyBar[] }>
	| Readonly<{ ok: false; message: string }>;

type CedearUnderlyingRead =
	| Readonly<{ ok: true; underlying: CedearInstrument['underlying'] }>
	| Readonly<{ ok: false; message: string }>;

// Generation

export type CatalogGenerationDependencies = Readonly<{
	fetchFromProvider: ProviderFetch;
	pause: Pause;
	reportProgress?: (message: string) => void;
}>;

export type CatalogGeneration =
	| Readonly<{
			ok: true;
			leaderMerge: Extract<LeadingPanelMerge, { ok: true }>;
			cedearMerge: Extract<CedearMerge, { ok: true }>;
	  }>
	| Extract<LeadingPanelMerge, { ok: false }>
	| Extract<CedearMerge, { ok: false }>;

/**
 * Generates the catalog from Open BYMADATA: merges the leading panel's stocks, then the
 * liquidity-eligible CEDEARs. Every request, across both stages, runs one at a time with
 * `REQUEST_PAUSE_MS` between the end of one and the start of the next; this is the only place
 * requests are paced. Returns no catalog when either stage fails, so a caller writes only a
 * successful result.
 */
export async function generateCatalog(
	storedCatalog: InstrumentCatalogValue,
	throughSession: string,
	dependencies: CatalogGenerationDependencies,
): Promise<CatalogGeneration> {
	const fetchFromProvider = createPacedFetch(dependencies.fetchFromProvider, dependencies.pause);
	const leadingPanel = await requestPanel(fetchFromProvider, LEADING_PANEL_URL);

	if (!leadingPanel.ok) {
		return leadingPanel;
	}

	const leaderMerge = mergeLeadingPanel(storedCatalog, leadingPanel.body);

	if (!leaderMerge.ok) {
		return leaderMerge;
	}

	const cedearMerge = await mergeLiquidCedears(leaderMerge.catalog, throughSession, {
		fetchFromProvider,
		reportProgress: dependencies.reportProgress ?? (() => {}),
	});

	if (!cedearMerge.ok) {
		return cedearMerge;
	}

	return { ok: true, leaderMerge, cedearMerge };
}

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

	const stocksBySymbol = mapInstrumentsByBymaPesoSymbol(currentCatalog.instruments, 'stock');
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

/**
 * Merges the liquidity-eligible CEDEARs of BYMA's `cedears` panel into the catalog. Candidates are
 * the panel's ARS 24-hour symbols except `B` variants. A candidate already owned by a catalog
 * CEDEAR is left unchanged and not fetched. A candidate whose identifier or symbol would conflict
 * with the catalog is skipped before any history is fetched. Every other candidate is measured
 * with the Analysis Run's liquidity-eligibility rule at the latest market session on or before
 * `throughSession`, and an eligible one is added with the underlying its technical sheet describes.
 *
 * A candidate whose history or technical sheet cannot be used is reported, not added. Returns no
 * catalog when the panel, the MEP rate source, the liquidity window or the merged catalog is
 * unusable.
 */
export async function mergeLiquidCedears(
	currentCatalog: InstrumentCatalogValue,
	throughSession: string,
	dependencies: CedearMergeDependencies,
): Promise<CedearMerge> {
	const { fetchFromProvider } = dependencies;
	const reportProgress = dependencies.reportProgress ?? (() => {});
	const panelRequest = await requestPanel(fetchFromProvider, CEDEAR_PANEL_URL);

	if (!panelRequest.ok) {
		return panelRequest;
	}

	const panel = parseCedearPanel(panelRequest.body);

	if (!panel.ok) {
		return panel;
	}

	const candidates = selectCedearCandidates(panel.symbols);
	const cedearsBySymbol = mapInstrumentsByBymaPesoSymbol(currentCatalog.instruments, 'cedear');
	const newCandidateSymbols = candidates.symbols.filter((symbol) => !cedearsBySymbol.has(symbol));
	const conflicts = findCatalogConflicts(currentCatalog, newCandidateSymbols);
	const fetchedCandidateSymbols = newCandidateSymbols.filter((symbol) => !conflicts.has(symbol));
	const candidateSymbolSet = new Set(candidates.symbols);
	const absentCedearIds = [...cedearsBySymbol]
		.filter(([symbol]) => !candidateSymbolSet.has(symbol))
		.map(([, cedear]) => cedear.id);
	// A no-op pause: `fetchFromProvider` already paces every request, including the acquirer's.
	const acquirer = createOpenBymadataBarHistoryAcquirer(
		createOpenBymadataAdapter(fetchFromProvider),
		() => Promise.resolve(),
	);
	const mepRateSourceWindow = await selectMepRateSourceWindow(
		acquirer,
		currentCatalog,
		throughSession,
	);

	if (!mepRateSourceWindow.ok) {
		return mepRateSourceWindow;
	}

	const { window } = mepRateSourceWindow;
	const evaluations: CandidateEvaluation[] = [...conflicts].map(([symbol, message]) => ({
		status: 'skipped',
		candidate: { symbol, reason: 'catalog-conflict', message },
	}));

	for (const [index, symbol] of fetchedCandidateSymbols.entries()) {
		evaluations.push(
			await evaluateCedearCandidate(symbol, window, throughSession, {
				acquirer,
				fetchFromProvider,
			}),
		);

		const isProgressPoint = (index + 1) % PROGRESS_INTERVAL === 0;

		if (isProgressPoint) {
			reportProgress(`Evaluated ${index + 1} of ${fetchedCandidateSymbols.length} CEDEARs.`);
		}
	}

	const addedEvaluations = evaluations.flatMap((evaluation) =>
		evaluation.status === 'added' ? [evaluation] : [],
	);
	const addedCedears = addedEvaluations.map((evaluation) => evaluation.cedear);
	const mergedCatalog = {
		...currentCatalog,
		instruments: [...currentCatalog.instruments, ...addedCedears],
	};
	const validation = validateInstrumentCatalog(mergedCatalog);

	if (!validation.isValid) {
		return { ok: false, reason: 'invalid-catalog', issues: validation.issues };
	}

	return {
		ok: true,
		catalog: validation.catalog,
		measuredAtSession: window.marketSessions.at(-1)!.sessionDate,
		candidateCount: candidates.symbols.length,
		droppedVariants: candidates.droppedVariants,
		addedInstrumentIds: addedCedears.map((cedear) => cedear.id),
		addedWithInvalidBars: addedEvaluations.flatMap(({ cedear, invalidBarsMessage }) =>
			invalidBarsMessage === null
				? []
				: [{ symbol: cedear.tradingLines[0]!.symbol, message: invalidBarsMessage }],
		),
		absentInstrumentIds: [...new Set(absentCedearIds)],
		ineligibleCount: evaluations.filter((evaluation) => evaluation.status === 'ineligible')
			.length,
		skippedCandidates: evaluations
			.flatMap((evaluation) =>
				evaluation.status === 'skipped' ? [evaluation.candidate] : [],
			)
			.toSorted((left, right) => left.symbol.localeCompare(right.symbol)),
	};
}

/** Serializes the catalog the way it is committed: tab-indented with a trailing newline. */
export function serializeCatalog(catalog: InstrumentCatalogValue): string {
	return `${JSON.stringify(catalog, null, '\t')}\n`;
}

/**
 * Resolves the session the CEDEARs' liquidity is measured at: `--through-session YYYY-MM-DD` when
 * given, otherwise the calendar date before `currentInstant`'s date in Buenos Aires, as for the
 * scheduled Analysis Run. Either way it must be a completed session, before today's market date.
 */
export function resolveThroughSession(args: readonly string[], currentInstant: string): string {
	const { values } = parseArgs({
		args: [...args],
		options: { 'through-session': { type: 'string' } },
		strict: true,
	});
	const throughSession = values['through-session'] ?? resolvePreviousMarketDate(currentInstant);
	const currentMarketDate = Temporal.Instant.from(currentInstant)
		.toZonedDateTimeISO(MARKET_TIME_ZONE)
		.toPlainDate()
		.toString();

	if (!checkIfIsoDateIsValid(throughSession)) {
		throw new Error('--through-session must be a real YYYY-MM-DD date.');
	}

	if (throughSession >= currentMarketDate) {
		throw new Error(
			`--through-session must be a completed session, before today's market date, ${currentMarketDate}.`,
		);
	}

	return throughSession;
}

// Panels

async function requestPanel(
	fetchFromProvider: ProviderFetch,
	url: string,
): Promise<Readonly<{ ok: true; body: unknown }> | InvalidPanelResponse> {
	try {
		const response = await fetchFromProvider(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: PANEL_REQUEST_BODY,
		});

		if (!response.ok) {
			return invalidPanelResponse(
				`The panel request to ${url} returned HTTP ${response.status}.`,
			);
		}

		return { ok: true, body: await response.json() };
	} catch (error) {
		return invalidPanelResponse(`The panel request to ${url} failed: ${String(error)}`);
	}
}

function parseLeadingPanel(panelResponse: unknown): PanelParse {
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

	return selectPesoTwentyFourHourSymbols(data, 'leading panel');
}

function parseCedearPanel(panelResponse: unknown): PanelParse {
	const parse = v.safeParse(cedearPanelResponseSchema, panelResponse);

	if (!parse.success) {
		return invalidPanelResponse('The CEDEAR panel response does not have the expected shape.');
	}

	// Without an element count, a full page is the only sign that rows may have been cut off.
	const mayBeTruncated = parse.output.length >= PANEL_PAGE_SIZE;

	if (mayBeTruncated) {
		return invalidPanelResponse(
			`The CEDEAR panel returned ${parse.output.length} rows, a full page; it may be truncated.`,
		);
	}

	return selectPesoTwentyFourHourSymbols(parse.output, 'CEDEAR panel');
}

function selectPesoTwentyFourHourSymbols(rows: readonly PanelRow[], panelName: string): PanelParse {
	const pesoTwentyFourHourRows = rows.filter(
		(row) =>
			row.denominationCcy === PESO_CURRENCY &&
			row.settlementType === TWENTY_FOUR_HOUR_SETTLEMENT,
	);

	if (pesoTwentyFourHourRows.length === 0) {
		return invalidPanelResponse(`The ${panelName} has no ARS 24-hour rows.`);
	}

	const symbols = pesoTwentyFourHourRows.map((row) => row.symbol);
	const duplicateSymbols = symbols.filter((symbol, index) => symbols.indexOf(symbol) !== index);

	if (duplicateSymbols.length > 0) {
		return invalidPanelResponse(
			`The ${panelName} lists ${duplicateSymbols.join(', ')} more than once.`,
		);
	}

	return { ok: true, symbols };
}

function invalidPanelResponse(message: string): InvalidPanelResponse {
	return { ok: false, reason: 'invalid-panel-response', message };
}

// Catalog records

function mapInstrumentsByBymaPesoSymbol(
	instruments: readonly Instrument[],
	type: Instrument['type'] | 'any',
): Map<string, Instrument> {
	const instrumentsBySymbol = new Map<string, Instrument>();

	for (const instrument of instruments) {
		const isRequestedType = type === 'any' || instrument.type === type;

		if (!isRequestedType) {
			continue;
		}

		for (const tradingLine of instrument.tradingLines) {
			const isBymaPesoLine =
				tradingLine.exchange === 'BYMA' && tradingLine.currency === PESO_CURRENCY;

			if (isBymaPesoLine) {
				instrumentsBySymbol.set(tradingLine.symbol, instrument);
			}
		}
	}

	return instrumentsBySymbol;
}

// Panels carry no issuer name (`description` and `securityDesc` are empty), so a new Instrument's
// id comes from its BYMA symbol.
function deriveInstrumentId(symbol: string, type: 'stock' | 'cedear'): string {
	const symbolSlug = symbol
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, '-')
		.replaceAll(/^-|-$/g, '');

	return `${symbolSlug}-${type}`;
}

function deriveBymaPesoLineId(instrumentId: string): string {
	return `${instrumentId}-byma-ars`;
}

function buildLeaderStock(symbol: string): StockInstrument {
	const instrumentId = deriveInstrumentId(symbol, 'stock');

	return {
		id: instrumentId,
		type: 'stock',
		tradingLines: [
			{ id: deriveBymaPesoLineId(instrumentId), symbol, exchange: 'BYMA', currency: 'ARS' },
		],
	};
}

function buildCedear(symbol: string, underlying: CedearInstrument['underlying']): CedearInstrument {
	const instrumentId = deriveInstrumentId(symbol, 'cedear');

	return {
		id: instrumentId,
		type: 'cedear',
		underlying,
		tradingLines: [
			{ id: deriveBymaPesoLineId(instrumentId), symbol, exchange: 'BYMA', currency: 'ARS' },
		],
	};
}

// CEDEAR candidates

/**
 * Drops `B` variants, the same security on another line (`AAPLB` shares `AAPL`'s ISIN): a symbol
 * ending in `B` whose base, after removing the `B` and any dot padding (`C...B`), is also listed.
 * The panel carries no ISIN to confirm the pairing, so each drop is returned for the report. A
 * `…B` symbol without a listed base, such as `ABNB` or `B` itself, is a candidate. Sorted, so
 * evaluation and the added Instruments follow symbol order whatever the panel's row order.
 */
function selectCedearCandidates(symbols: readonly string[]): CedearCandidates {
	const listedSymbols = new Set(symbols);
	const droppedVariants = symbols.flatMap((symbol) => {
		const base = symbol.slice(0, -1).replace(/\.+$/, '');
		const isBVariant = symbol.endsWith('B') && base.length > 0 && listedSymbols.has(base);

		return isBVariant ? [{ symbol, base }] : [];
	});
	const droppedSymbols = new Set(droppedVariants.map((variant) => variant.symbol));

	return {
		symbols: symbols.filter((symbol) => !droppedSymbols.has(symbol)).toSorted(),
		droppedVariants: droppedVariants.toSorted((left, right) =>
			left.symbol.localeCompare(right.symbol),
		),
	};
}

/**
 * Finds the new candidates that could not be added without breaking the catalog, before any of
 * their history is fetched: a symbol another Instrument already trades on BYMA in ARS, or a
 * derived identifier taken by an existing Instrument or Trading Line or shared by two candidates.
 * Final validation would reject them too, but only after the whole generation.
 */
function findCatalogConflicts(
	catalog: InstrumentCatalogValue,
	candidateSymbols: readonly string[],
): ReadonlyMap<string, string> {
	const ownersBySymbol = mapInstrumentsByBymaPesoSymbol(catalog.instruments, 'any');
	const existingIds = new Set(
		catalog.instruments.flatMap((instrument) => [
			instrument.id,
			...instrument.tradingLines.map((tradingLine) => tradingLine.id),
		]),
	);
	const candidateIds = candidateSymbols.map((symbol) => deriveInstrumentId(symbol, 'cedear'));
	const conflicts = new Map<string, string>();

	for (const [index, symbol] of candidateSymbols.entries()) {
		const instrumentId = candidateIds[index]!;
		const owner = ownersBySymbol.get(symbol);
		const isIdTaken =
			existingIds.has(instrumentId) || existingIds.has(deriveBymaPesoLineId(instrumentId));
		const isIdShared =
			candidateIds.indexOf(instrumentId) !== candidateIds.lastIndexOf(instrumentId);

		if (owner) {
			conflicts.set(symbol, `${owner.id} already owns the BYMA ARS ${symbol} line.`);
		} else if (isIdTaken) {
			conflicts.set(symbol, `The identifier ${instrumentId} is already in the catalog.`);
		} else if (isIdShared) {
			conflicts.set(symbol, `Another candidate also derives the identifier ${instrumentId}.`);
		}
	}

	return conflicts;
}

async function selectMepRateSourceWindow(
	acquirer: BarHistoryAcquirer,
	catalog: InstrumentCatalogValue,
	throughSession: string,
): Promise<MepRateSourceWindow> {
	const { pesoBondTradingLineId, dollarBondTradingLineId } = MEP_RATE_SOURCE;
	const pesoBond = await fetchMepRateSourceLine(
		acquirer,
		catalog,
		pesoBondTradingLineId,
		throughSession,
	);

	if (!pesoBond.ok) {
		return { ok: false, reason: 'mep-rate-source-unavailable', message: pesoBond.message };
	}

	const dollarBond = await fetchMepRateSourceLine(
		acquirer,
		catalog,
		dollarBondTradingLineId,
		throughSession,
	);

	if (!dollarBond.ok) {
		return { ok: false, reason: 'mep-rate-source-unavailable', message: dollarBond.message };
	}

	const mepRates = calculateMepRates(pesoBond.bars, dollarBond.bars);
	const selection = selectLiquidityWindow(mepRates, throughSession);

	if (!selection.ok) {
		return {
			ok: false,
			reason: 'insufficient-market-sessions',
			message: `The MEP rate source has ${selection.marketSessionCount} market sessions through ${throughSession}, fewer than the liquidity window needs.`,
		};
	}

	return { ok: true, window: selection.window };
}

// Validated as the Analysis Run validates it, so generation fails where a run could not publish.
async function fetchMepRateSourceLine(
	acquirer: BarHistoryAcquirer,
	catalog: InstrumentCatalogValue,
	tradingLineId: string,
	throughSession: string,
): Promise<HistoryFetch> {
	const tradingLine = catalog.instruments
		.flatMap((instrument) => instrument.tradingLines)
		.find((line) => line.id === tradingLineId);

	if (!tradingLine) {
		throw new Error(`The catalog has no MEP rate source Trading Line ${tradingLineId}.`);
	}

	const history = await fetchHistory(acquirer, tradingLine.symbol, throughSession);

	if (!history.ok) {
		return { ok: false, message: `${tradingLineId}: ${history.message}` };
	}

	const { issues } = validateMepRateSourceBars(history.bars);

	if (issues.length > 0) {
		return { ok: false, message: `${tradingLineId}: ${describeBarIssues(issues)}` };
	}

	return history;
}

// Eligibility reads only each bar's date, close and volume. Bars are validated only to report a
// liquid line the Analysis Run will reject as `invalid-bars`; such a line is still added.
async function evaluateCedearCandidate(
	symbol: string,
	window: LiquidityWindow,
	throughSession: string,
	providers: Readonly<{ acquirer: BarHistoryAcquirer; fetchFromProvider: ProviderFetch }>,
): Promise<CandidateEvaluation> {
	const history = await fetchHistory(providers.acquirer, symbol, throughSession);

	if (!history.ok) {
		return {
			status: 'skipped',
			candidate: { symbol, reason: 'history-unavailable', message: history.message },
		};
	}

	const { isEligible } = evaluateLiquidityEligibility(history.bars, window);

	if (!isEligible) {
		return { status: 'ineligible' };
	}

	const underlyingRead = await readCedearUnderlying(providers.fetchFromProvider, symbol);

	if (!underlyingRead.ok) {
		return {
			status: 'skipped',
			candidate: {
				symbol,
				reason: 'technical-sheet-unusable',
				message: underlyingRead.message,
			},
		};
	}

	const { issues } = validateDailyBars(history.bars, true, 'bars');

	return {
		status: 'added',
		cedear: buildCedear(symbol, underlyingRead.underlying),
		invalidBarsMessage: issues.length > 0 ? describeBarIssues(issues) : null,
	};
}

async function fetchHistory(
	acquirer: BarHistoryAcquirer,
	symbol: string,
	throughSession: string,
): Promise<HistoryFetch> {
	const acquisition = await acquirer.acquire({
		requestedThroughSession: throughSession,
		lines: [
			{
				tradingLine: { tradingLineId: symbol, symbol },
				existingHistory: null,
				mode: 'initial-backfill',
			},
		],
	});

	if (!acquisition.ok) {
		return { ok: false, message: acquisition.message };
	}

	const line = acquisition.lines[0];

	if (line?.status === 'failed') {
		return { ok: false, message: line.message };
	}

	if (line?.status !== 'available') {
		return { ok: false, message: `No history for ${symbol}.` };
	}

	return { ok: true, bars: line.bars };
}

function describeBarIssues(issues: readonly ValidationIssue[]): string {
	const firstIssue = issues[0];

	return `${issues.length} invalid Daily Bar issue(s); first: ${firstIssue?.path}: ${firstIssue?.message}`;
}

async function readCedearUnderlying(
	fetchFromProvider: ProviderFetch,
	symbol: string,
): Promise<CedearUnderlyingRead> {
	let sheetResponse: unknown;

	try {
		const response = await fetchFromProvider(TECHNICAL_SHEET_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ symbol }),
		});

		if (!response.ok) {
			return { ok: false, message: `The technical sheet returned HTTP ${response.status}.` };
		}

		sheetResponse = await response.json();
	} catch (error) {
		return { ok: false, message: `The technical sheet request failed: ${String(error)}` };
	}

	const parse = v.safeParse(technicalSheetResponseSchema, sheetResponse);

	if (!parse.success) {
		return { ok: false, message: 'The technical sheet does not have the expected shape.' };
	}

	const [sheet, ...otherSheets] = parse.output.data;
	const market = sheet?.mercadoOrigen?.trim() ?? '';
	const ticker = sheet?.simboloMercado?.trim() ?? '';
	const hasOneUsableSheet = otherSheets.length === 0 && market !== '' && ticker !== '';

	if (!hasOneUsableSheet) {
		return {
			ok: false,
			message: `The technical sheet has ${parse.output.data.length} record(s) without a single usable market and ticker.`,
		};
	}

	return { ok: true, underlying: { market, ticker } };
}

/**
 * Wraps a fetch so requests run one at a time, each starting `REQUEST_PAUSE_MS` after the
 * previous one ended. Callers await every request, so a request never overlaps another.
 */
function createPacedFetch(fetchFromProvider: ProviderFetch, pause: Pause): ProviderFetch {
	let hasRequested = false;

	return async (input, init) => {
		if (hasRequested) {
			await pause(REQUEST_PAUSE_MS);
		}

		hasRequested = true;
		return fetchFromProvider(input, init);
	};
}

// Command

async function generate(): Promise<void> {
	const throughSession = resolveThroughSession(
		Bun.argv.slice(2),
		Temporal.Now.instant().toString(),
	);
	// Importing the catalog module already validated the stored file and would have thrown.
	const storedCatalog: InstrumentCatalogValue = {
		schemaVersion: 1,
		instruments: instrumentCatalog.getInstruments(),
	};
	const generation = await generateCatalog(storedCatalog, throughSession, {
		fetchFromProvider: fetchWithTimeout,
		pause: Bun.sleep,
		reportProgress: console.log,
	});

	if (!generation.ok) {
		throw new Error(`${generation.reason}: ${describeGenerationFailure(generation)}`);
	}

	await writeCatalogAtomically(serializeCatalog(generation.cedearMerge.catalog));
	printLeaderReport(generation.leaderMerge);
	printCedearReport(generation.cedearMerge);
	console.log(`Written to ${CATALOG_PATH}.`);
}

function fetchWithTimeout(input: string | URL | Request, init?: RequestInit): Promise<Response> {
	return fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

// Renaming within one directory replaces the file in one step, so an interrupted write never
// leaves a truncated catalog behind.
async function writeCatalogAtomically(contents: string): Promise<void> {
	const temporaryPath = `${CATALOG_PATH}.${process.pid}.tmp`;

	await Bun.write(temporaryPath, contents);
	await rename(temporaryPath, CATALOG_PATH);
}

function describeGenerationFailure(generation: Extract<CatalogGeneration, { ok: false }>): string {
	if (generation.reason !== 'invalid-catalog') {
		return generation.message;
	}

	return generation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
}

function printLeaderReport(merge: Extract<LeadingPanelMerge, { ok: true }>): void {
	const { addedInstrumentIds, absentInstrumentIds } = merge;
	const mayContainSymbolChange = addedInstrumentIds.length > 0 && absentInstrumentIds.length > 0;

	console.log(
		`Leaders added ${addedInstrumentIds.length}: ${addedInstrumentIds.join(', ') || 'none'}.`,
	);

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
}

function printCedearReport(merge: Extract<CedearMerge, { ok: true }>): void {
	const { droppedVariants, addedInstrumentIds, addedWithInvalidBars, absentInstrumentIds } =
		merge;
	const droppedVariantPairs = droppedVariants.map(({ symbol, base }) => `${symbol} → ${base}`);

	console.log(
		`CEDEAR liquidity measured at ${merge.measuredAtSession}: ${merge.candidateCount} candidates, ${addedInstrumentIds.length} added, ${merge.ineligibleCount} ineligible.`,
	);
	console.log(
		`B variants dropped (${droppedVariants.length}): ${droppedVariantPairs.join(', ') || 'none'}.`,
	);
	console.log(`CEDEARs added: ${addedInstrumentIds.join(', ') || 'none'}.`);

	for (const { symbol, message } of addedWithInvalidBars) {
		console.log(
			`Added with invalid bars, the Analysis Run will report it: ${symbol}: ${message}`,
		);
	}

	if (absentInstrumentIds.length > 0) {
		console.log(
			`Catalog CEDEARs with a BYMA ARS line absent from the CEDEAR candidates, kept: ${absentInstrumentIds.join(', ')}.`,
		);
	}

	for (const candidate of merge.skippedCandidates) {
		console.log(`Not added, ${candidate.reason}: ${candidate.symbol}: ${candidate.message}`);
	}
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
