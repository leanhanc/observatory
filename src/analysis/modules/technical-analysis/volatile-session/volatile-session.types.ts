export type VolatileSessionEvent = Readonly<{
	type: 'volatile-session';
	trueRange: number;
	baselineAtr: number;
	baselineThroughSessionDate: string;
	atrMultiple: number;
}>;

export type VolatileSessionRow = Readonly<{
	sessionDate: string;
	event: VolatileSessionEvent | null;
}>;
