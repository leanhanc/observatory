import type { MepRateSource } from './dollarized-series.types.ts';

/**
 * The bond whose peso and local-dollar ("D") closes imply the MEP Rate: AL30
 * and AL30D, per ADR 0005. This selects the bond for the MEP Rate only; the
 * Instrument Catalog describes the lines without choosing them.
 *
 * Settlement is not represented in the Instrument Catalog. Callers must fetch
 * both lines with the same settlement term as the peso bars they dollarize.
 */
export const MEP_RATE_SOURCE: MepRateSource = Object.freeze({
	pesoBondTradingLineId: 'al30-bond-byma-ars',
	dollarBondTradingLineId: 'al30-bond-byma-usd-mep',
});
