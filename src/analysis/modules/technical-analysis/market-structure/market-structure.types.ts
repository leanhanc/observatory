export type StructureClassification = 'uptrend' | 'downtrend' | 'range' | 'undefined';

export type ConfirmedSwing = Readonly<{
	kind: 'high' | 'low';
	price: number;
	occurredAtSession: string;
	confirmedAtSession: string;
}>;

export type ConfirmedHigh = ConfirmedSwing & Readonly<{ kind: 'high' }>;
export type ConfirmedLow = ConfirmedSwing & Readonly<{ kind: 'low' }>;

/** The latest swing of each kind confirmed by a session, or `null` before the first of its kind. */
export type LatestConfirmedSwings = Readonly<{
	high: ConfirmedHigh | null;
	low: ConfirmedLow | null;
}>;

export type MarketStructureSession = Readonly<{
	sessionDate: string;
	structure: StructureClassification;
	/**
	 * Whether two confirmed swings of each kind exist by this session. While false, Structure
	 * cannot be evaluated and its `undefined` means not enough history; once true it stays true,
	 * and `undefined` means an expired trend.
	 */
	hasSwingPairs: boolean;
	newlyConfirmedSwings: readonly ConfirmedSwing[];
}>;
