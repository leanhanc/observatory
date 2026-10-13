import { measureRegimeInputs } from './regime-engine.ts';
import { measureRegimeBand } from './regime-policy.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { RegimeBand } from './regime-policy.ts';
import type { RegimeTippingCloses, RegimeTippingClosesSession } from './regime.types.ts';

/**
 * Reports, for each completed session, the closes beyond which Regime's price condition would
 * propose a directional Regime, and whether EMA50 already meets the proposal's other condition.
 * `null` while Regime's measurements are unavailable.
 *
 * The closes are the edges of the same band `proposeRegime` reads, as of the session. A later
 * close moves EMA200 and ATR14 too, so a later session's edge is close to this one but not equal.
 * Expects complete, validated Daily Bars ordered oldest to newest.
 */
export function calculateRegimeTippingCloses(
	bars: readonly DailyBar[],
): readonly RegimeTippingClosesSession[] {
	return measureRegimeInputs(bars).map(({ sessionDate, ema50, ema200, atr14 }) => {
		const band = measureRegimeBand(ema50, ema200, atr14);

		return {
			sessionDate,
			tippingCloses: band === null ? null : describeTippingCloses(band),
		};
	});
}

function describeTippingCloses(band: RegimeBand): RegimeTippingCloses {
	return {
		bullish: { closeAbove: band.upperEdge, isFastEmaAligned: band.averageAlignment > 0 },
		bearish: { closeBelow: band.lowerEdge, isFastEmaAligned: band.averageAlignment < 0 },
	};
}
