import type {
	cedearInstrumentSchema,
	instrumentCatalogSchema,
	instrumentSchema,
	stockInstrumentSchema,
	tradingLineSchema,
} from './instrument-catalog.schema.ts';
import type * as v from 'valibot';

export type TradingLine = v.InferOutput<typeof tradingLineSchema>;
export type StockInstrument = v.InferOutput<typeof stockInstrumentSchema>;
export type CedearInstrument = v.InferOutput<typeof cedearInstrumentSchema>;
export type Instrument = v.InferOutput<typeof instrumentSchema>;
export type InstrumentCatalogValue = v.InferOutput<typeof instrumentCatalogSchema>;

export type InstrumentCatalogValidationIssue = Readonly<{
	code:
		| 'duplicate-instrument-id'
		| 'duplicate-trading-line'
		| 'duplicate-trading-line-id'
		| 'invalid-schema-version'
		| 'invalid-type'
		| 'invalid-underlying'
		| 'invalid-value';
	path: string;
	message: string;
}>;

export type InstrumentLookupResult =
	| Readonly<{
			ok: true;
			instrument: Instrument;
	  }>
	| Readonly<{
			ok: false;
			reason: 'instrument-not-found';
			instrumentId: string;
	  }>;

export type TradingLineLookupIssue = Readonly<{
	code: 'blank-id' | 'duplicate-id';
	path: string;
	message: string;
}>;

export type TradingLineLookupResult =
	| Readonly<{
			ok: true;
			tradingLines: readonly TradingLine[];
	  }>
	| Readonly<{
			ok: false;
			reason: 'invalid-request';
			issues: readonly TradingLineLookupIssue[];
	  }>
	| Readonly<{
			ok: false;
			reason: 'trading-line-not-found';
			missingTradingLineIds: readonly string[];
	  }>;

export type InstrumentCatalog = Readonly<{
	getInstruments(): readonly Instrument[];
	getInstrumentById(instrumentId: string): InstrumentLookupResult;
	getTradingLinesByIds(tradingLineIds: readonly string[]): TradingLineLookupResult;
}>;

export type InstrumentCatalogValidationResult =
	| Readonly<{
			isValid: true;
			catalog: InstrumentCatalogValue;
	  }>
	| Readonly<{
			isValid: false;
			issues: readonly InstrumentCatalogValidationIssue[];
	  }>;

export type InstrumentCatalogCreationResult =
	| Readonly<{
			ok: true;
			catalog: InstrumentCatalog;
	  }>
	| Readonly<{
			ok: false;
			reason: 'invalid-catalog';
			issues: readonly InstrumentCatalogValidationIssue[];
	  }>;
