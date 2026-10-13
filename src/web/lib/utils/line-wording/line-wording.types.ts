import type { SnapshotPriceUnit } from '#web/lib/utils/snapshot-pages/index.ts';

/** A piece of reader-facing text; `strong` pieces carry the lead the reader scans for. */
export type PhraseSegment = string | Readonly<{ strong: string }>;

/** A sentence or fragment of the line page, as the wording table writes it. */
export type Phrase = readonly PhraseSegment[];

/**
 * How prices are shown: `priceUnit` is the snapshot's unit for every analyzed price, and a peso
 * line shows each level's peso equivalent first, since its reader looks for prices in pesos.
 */
export type PriceContext = Readonly<{
	priceUnit: SnapshotPriceUnit;
	isPesoLine: boolean;
}>;
