import * as v from 'valibot';

import { mapValibotIssues } from '#lib/utils/validation.ts';

import { instrumentCatalogSchema, resolveSchemaIssueCode } from './instrument-catalog.schema.ts';

import type {
	CedearInstrument,
	Instrument,
	InstrumentCatalog,
	InstrumentCatalogCreationResult,
	InstrumentCatalogValidationIssue,
	InstrumentCatalogValidationResult,
	TradingLine,
	TradingLineLookupIssue,
	TradingLineLookupResult,
} from './instrument-catalog.types.ts';

export function createInstrumentCatalog(value: unknown): InstrumentCatalogCreationResult {
	const validation = validateInstrumentCatalog(value);

	if (!validation.isValid) {
		return {
			ok: false,
			reason: 'invalid-catalog',
			issues: validation.issues,
		};
	}

	const instruments = structuredClone(validation.catalog.instruments);
	const instrumentEntries = instruments.map((instrument) => [instrument.id, instrument] as const);
	const tradingLineEntries = instruments.flatMap((instrument) =>
		instrument.tradingLines.map((tradingLine) => [tradingLine.id, tradingLine] as const),
	);
	const instrumentsById = new Map(instrumentEntries);
	const tradingLinesById = new Map(tradingLineEntries);

	return {
		ok: true,
		catalog: buildInstrumentCatalog(instruments, instrumentsById, tradingLinesById),
	};
}

export function validateInstrumentCatalog(value: unknown): InstrumentCatalogValidationResult {
	const schemaValidation = v.safeParse(instrumentCatalogSchema, value);

	if (!schemaValidation.success) {
		return {
			isValid: false,
			issues: mapValibotIssues(schemaValidation.issues, resolveSchemaIssueCode),
		};
	}

	const issues = validateCompleteCatalog(schemaValidation.output.instruments);

	if (issues.length > 0) {
		return { isValid: false, issues };
	}

	return { isValid: true, catalog: schemaValidation.output };
}

function buildInstrumentCatalog(
	instruments: readonly Instrument[],
	instrumentsById: ReadonlyMap<string, Instrument>,
	tradingLinesById: ReadonlyMap<string, TradingLine>,
): InstrumentCatalog {
	return {
		getInstruments: () => structuredClone(instruments),
		getInstrumentById: (instrumentId) => {
			const instrument = instrumentsById.get(instrumentId);

			if (!instrument) {
				return { ok: false, reason: 'instrument-not-found', instrumentId };
			}

			return { ok: true, instrument: structuredClone(instrument) };
		},
		getTradingLinesByIds: (tradingLineIds) =>
			resolveTradingLinesByIds(tradingLinesById, tradingLineIds),
	};
}

function resolveTradingLinesByIds(
	tradingLinesById: ReadonlyMap<string, TradingLine>,
	tradingLineIds: readonly string[],
): TradingLineLookupResult {
	const requestIssues = validateTradingLineLookupRequest(tradingLineIds);

	if (requestIssues.length > 0) {
		return { ok: false, reason: 'invalid-request', issues: requestIssues };
	}

	const missingTradingLineIds = tradingLineIds.filter(
		(tradingLineId) => !tradingLinesById.has(tradingLineId),
	);

	if (missingTradingLineIds.length > 0) {
		return {
			ok: false,
			reason: 'trading-line-not-found',
			missingTradingLineIds,
		};
	}

	const tradingLines = tradingLineIds.map((tradingLineId) => {
		const tradingLine = tradingLinesById.get(tradingLineId);

		if (!tradingLine) {
			throw new Error(`Expected Trading Line ${tradingLineId} to exist after validation.`);
		}

		return structuredClone(tradingLine);
	});

	return { ok: true, tradingLines };
}

function validateTradingLineLookupRequest(
	tradingLineIds: readonly string[],
): TradingLineLookupIssue[] {
	const issues: TradingLineLookupIssue[] = [];
	const seenTradingLineIds = new Set<string>();

	for (const [index, tradingLineId] of tradingLineIds.entries()) {
		if (tradingLineId.trim().length === 0) {
			issues.push({
				code: 'blank-id',
				path: `tradingLineIds[${index}]`,
				message: 'Trading Line ID must not be blank.',
			});
		}

		if (seenTradingLineIds.has(tradingLineId)) {
			issues.push({
				code: 'duplicate-id',
				path: `tradingLineIds[${index}]`,
				message: `Trading Line ${tradingLineId} occurs more than once.`,
			});
		}

		seenTradingLineIds.add(tradingLineId);
	}

	return issues;
}

function validateCompleteCatalog(
	instruments: readonly Instrument[],
): InstrumentCatalogValidationIssue[] {
	const issues: InstrumentCatalogValidationIssue[] = [];
	const instrumentLocations = collectInstrumentLocations(instruments);
	const tradingLineLocations = collectTradingLineLocations(instruments);
	const equivalentTradingLineLocations = collectEquivalentTradingLineLocations(instruments);

	addDuplicateLocationIssues(
		issues,
		instrumentLocations,
		'duplicate-instrument-id',
		'Instrument',
	);
	addDuplicateLocationIssues(
		issues,
		tradingLineLocations,
		'duplicate-trading-line-id',
		'Trading Line',
	);
	addDuplicateLocationIssues(
		issues,
		equivalentTradingLineLocations,
		'duplicate-trading-line',
		'Trading Line identity',
	);
	addInvalidUnderlyingIssues(issues, instruments);

	return issues;
}

function collectInstrumentLocations(instruments: readonly Instrument[]): Map<string, string[]> {
	const locations = new Map<string, string[]>();

	for (const [index, instrument] of instruments.entries()) {
		addLocation(locations, instrument.id, `instruments[${index}].id`);
	}

	return locations;
}

function collectTradingLineLocations(instruments: readonly Instrument[]): Map<string, string[]> {
	const locations = new Map<string, string[]>();

	for (const [instrumentIndex, instrument] of instruments.entries()) {
		for (const [tradingLineIndex, tradingLine] of instrument.tradingLines.entries()) {
			addLocation(
				locations,
				tradingLine.id,
				`instruments[${instrumentIndex}].tradingLines[${tradingLineIndex}].id`,
			);
		}
	}

	return locations;
}

function collectEquivalentTradingLineLocations(
	instruments: readonly Instrument[],
): Map<string, string[]> {
	const locations = new Map<string, string[]>();

	for (const [instrumentIndex, instrument] of instruments.entries()) {
		for (const [tradingLineIndex, tradingLine] of instrument.tradingLines.entries()) {
			const identity = [tradingLine.exchange, tradingLine.symbol, tradingLine.currency].join(
				':',
			);
			const path = `instruments[${instrumentIndex}].tradingLines[${tradingLineIndex}]`;
			addLocation(locations, identity, path);
		}
	}

	return locations;
}

function addLocation(locations: Map<string, string[]>, key: string, path: string): void {
	const existingLocations = locations.get(key) ?? [];
	existingLocations.push(path);
	locations.set(key, existingLocations);
}

function addDuplicateLocationIssues(
	issues: InstrumentCatalogValidationIssue[],
	locationsByValue: ReadonlyMap<string, readonly string[]>,
	code: 'duplicate-instrument-id' | 'duplicate-trading-line' | 'duplicate-trading-line-id',
	label: string,
): void {
	for (const [value, locations] of locationsByValue) {
		if (locations.length < 2) {
			continue;
		}

		for (const path of locations) {
			issues.push({
				code,
				path,
				message: `${label} ${value} occurs more than once.`,
			});
		}
	}
}

function addInvalidUnderlyingIssues(
	issues: InstrumentCatalogValidationIssue[],
	instruments: readonly Instrument[],
): void {
	const instrumentsById = new Map(instruments.map((instrument) => [instrument.id, instrument]));

	for (const [index, instrument] of instruments.entries()) {
		if (instrument.type !== 'cedear') {
			continue;
		}

		const underlyingInstrument = instrumentsById.get(instrument.underlyingInstrumentId);
		const hasValidUnderlying = underlyingInstrument?.type === 'stock';

		if (hasValidUnderlying) {
			continue;
		}

		issues.push(createInvalidUnderlyingIssue(instrument, index));
	}
}

function createInvalidUnderlyingIssue(
	instrument: CedearInstrument,
	index: number,
): InstrumentCatalogValidationIssue {
	return {
		code: 'invalid-underlying',
		path: `instruments[${index}].underlyingInstrumentId`,
		message: `CEDEAR ${instrument.id} must reference an existing stock Instrument.`,
	};
}
