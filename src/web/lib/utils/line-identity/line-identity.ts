import { instrumentCatalog } from '#modules/instrument-catalog/index.ts';

import type { Instrument, InstrumentCatalog } from '#modules/instrument-catalog/index.ts';
import type { SnapshotLine } from '#web/lib/utils/snapshot-pages/index.ts';

/** Who the line is, as the reader knows it from their broker. */
export type LineIdentity = Readonly<{
	ticker: string;
	/** `null` for a type the wording table does not name, or a line missing from the Catalog. */
	typeLabel: string | null;
	/** The CEDEAR's Underlying, such as `AAPL · NASDAQ`; `null` for any other line. */
	underlying: string | null;
	/** A line traded in pesos shows its levels' peso equivalents first. */
	isPesoLine: boolean;
}>;

const TYPE_LABELS: Record<Instrument['type'], string | null> = {
	stock: 'Acción argentina',
	cedear: 'CEDEAR',
	bond: null,
};

/**
 * Looks the line up in the Instrument Catalog. A line the Catalog no longer lists keeps its Trading
 * Line ID as its name and shows prices in the snapshot's unit only, since its currency is unknown.
 */
export function describeLineIdentity(
	line: Pick<SnapshotLine, 'instrumentId' | 'tradingLineId'>,
	catalog: InstrumentCatalog = instrumentCatalog,
): LineIdentity {
	const tradingLineLookup = catalog.getTradingLinesByIds([line.tradingLineId]);
	const instrumentLookup = catalog.getInstrumentById(line.instrumentId);

	if (!tradingLineLookup.ok || !instrumentLookup.ok) {
		return { ticker: line.tradingLineId, typeLabel: null, underlying: null, isPesoLine: false };
	}

	const tradingLine = tradingLineLookup.tradingLines[0]!;
	const { instrument } = instrumentLookup;
	const underlying =
		instrument.type === 'cedear'
			? `${instrument.underlying.ticker} · ${instrument.underlying.market}`
			: null;

	return {
		ticker: tradingLine.symbol,
		typeLabel: TYPE_LABELS[instrument.type],
		underlying,
		isPesoLine: tradingLine.currency === 'ARS',
	};
}
