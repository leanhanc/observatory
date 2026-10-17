import type { AvailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

type PricedLine = Pick<AvailableLine, 'latestState' | 'pesoEquivalents' | 'cclEquivalents'>;
type ReadableRegime = NonNullable<AvailableLine['latestState']['regime']>;

/** A trend tipping point the "Qué observar" sentences name, with the short tag its ruler prints. */
export type NamedTippingPoint = Readonly<{
	side: 'bullish' | 'bearish';
	tag: string;
}>;

/**
 * The swing a trending pattern's sentence names as its break level: the high in a downtrend and the
 * low in an uptrend. `null` for the other patterns, which name no level.
 */
export function selectPatternLevel(line: PricedLine): 'high' | 'low' | null {
	const { structure, lastConfirmedSwingHigh, lastConfirmedSwingLow } = line.latestState;

	if (structure === 'downtrend' && lastConfirmedSwingHigh !== null) {
		return 'high';
	}

	if (structure === 'uptrend' && lastConfirmedSwingLow !== null) {
		return 'low';
	}

	return null;
}

// Each trend names the change its tipping points would bring, as its sentence does: leaving a trend
// needs only the near edge, and a mixed trend shows both edges toward the trends it could enter.
const NAMED_TIPPING_POINTS: Record<ReadableRegime, readonly NamedTippingPoint[]> = {
	bearish: [{ side: 'bearish', tag: 'deja de ser bajista' }],
	bullish: [{ side: 'bullish', tag: 'deja de ser alcista' }],
	mixed: [
		{ side: 'bullish', tag: 'pasa a ser alcista' },
		{ side: 'bearish', tag: 'pasa a ser bajista' },
	],
};

/** The tipping points the trend tipping-point sentences name, none while Regime is unreadable. */
export function selectNamedTippingPoints(line: PricedLine): readonly NamedTippingPoint[] {
	const { regime, regimeTippingCloses } = line.latestState;

	if (regime === null || regimeTippingCloses === null) {
		return [];
	}

	return NAMED_TIPPING_POINTS[regime];
}
