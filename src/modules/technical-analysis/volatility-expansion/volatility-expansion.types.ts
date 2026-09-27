export type VolatilityExpansionEvent = Readonly<{
	type: 'volatility-expansion';
	trueRange: number;
	baselineAtr: number;
	baselineThroughSessionDate: string;
	expansionMultiple: number;
}>;

export type VolatilityExpansionSession = Readonly<{
	sessionDate: string;
	event: VolatilityExpansionEvent | null;
}>;
