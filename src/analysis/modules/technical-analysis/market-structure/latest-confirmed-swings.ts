import type {
	ConfirmedHigh,
	ConfirmedLow,
	LatestConfirmedSwings,
	MarketStructureSession,
} from './market-structure.types.ts';

/**
 * Keeps the latest swing of each kind as Market Structure confirms them, one row per session. A
 * swing reaches a row only from its confirmation session, so a row never holds a candidate that
 * has occurred but is not yet confirmed. Every consumer of "the latest confirmed swing" reads these
 * rows, so a Structure Break's defining swing and the State's watch levels cannot diverge.
 */
export function trackLatestConfirmedSwings(
	structures: readonly MarketStructureSession[],
): readonly LatestConfirmedSwings[] {
	let high: ConfirmedHigh | null = null;
	let low: ConfirmedLow | null = null;

	return structures.map((session) => {
		for (const swing of session.newlyConfirmedSwings) {
			if (swing.kind === 'high') {
				high = { ...swing, kind: 'high' };
			} else {
				low = { ...swing, kind: 'low' };
			}
		}

		return { high, low };
	});
}
