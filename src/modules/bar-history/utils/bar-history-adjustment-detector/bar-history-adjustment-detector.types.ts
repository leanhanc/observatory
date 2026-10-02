/**
 * One provider adjustment: every bar through `adjustedThroughSession` was multiplied by `ratio`.
 * Several adjustments apply cumulatively, so a bar is multiplied by the ratio of each adjustment
 * whose `adjustedThroughSession` is on or after its session.
 */
export type PriceAdjustment = Readonly<{
	ratio: number;
	adjustedThroughSession: string;
}>;

export type PriceRevision =
	| Readonly<{ kind: 'unchanged' }>
	| Readonly<{
			kind: 'adjustments';
			adjustments: readonly PriceAdjustment[];
	  }>
	| Readonly<{
			kind: 'corrections';
			sessionDates: readonly string[];
	  }>;
