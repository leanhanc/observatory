/** A piece of reader-facing text; `strong` pieces carry the lead the reader scans for. */
export type PhraseSegment = string | Readonly<{ strong: string }>;

/** A sentence or fragment of the line page, as the wording table writes it. */
export type Phrase = readonly PhraseSegment[];

/**
 * The currency a line page view shows every price in: `ars` in pesos, `usd` in MEP dollars, the
 * analyzed unit, and `ccl` in CCL dollars. A view names no other currency's price.
 */
export type DisplayCurrency = 'ars' | 'usd' | 'ccl';

/** Whether a printed change is a gain or a loss: the only figures the page colors green or red. */
export type ChangeDirection = 'gain' | 'loss';
