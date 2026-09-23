export type StructureClassification = 'uptrend' | 'downtrend' | 'range' | 'undefined';

export type ConfirmedSwing = Readonly<{
	kind: 'high' | 'low';
	price: number;
	occurredAtSession: string;
	confirmedAtSession: string;
}>;

export type MarketStructureSession = Readonly<{
	sessionDate: string;
	structure: StructureClassification;
	newlyConfirmedSwings: readonly ConfirmedSwing[];
}>;
