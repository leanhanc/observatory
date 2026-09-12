import storedInstrumentCatalog from './data/instrument-catalog.v1.json' with { type: 'json' };
import { createInstrumentCatalog } from './instrument-catalog.ts';

const catalogCreation = createInstrumentCatalog(storedInstrumentCatalog);

if (!catalogCreation.ok) {
	throw new Error('The stored Instrument Catalog is invalid.', {
		cause: catalogCreation.issues,
	});
}

export const instrumentCatalog = catalogCreation.catalog;

export type {
	CedearInstrument,
	Instrument,
	InstrumentCatalog,
	InstrumentLookupResult,
	StockInstrument,
	TradingLine,
	TradingLineLookupIssue,
	TradingLineLookupResult,
} from './instrument-catalog.types.ts';
