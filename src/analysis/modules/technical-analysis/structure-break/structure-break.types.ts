import type { ConfirmedSwing } from '../market-structure/index.ts';

type ConfirmedHigh = ConfirmedSwing & Readonly<{ kind: 'high' }>;
type ConfirmedLow = ConfirmedSwing & Readonly<{ kind: 'low' }>;

type DownwardStructureBreakEvent = Readonly<{
	type: 'structure-break';
	direction: 'downward';
	priorStructure: 'uptrend';
	definingSwing: ConfirmedLow;
	closePrice: number;
}>;

type UpwardStructureBreakEvent = Readonly<{
	type: 'structure-break';
	direction: 'upward';
	priorStructure: 'downtrend';
	definingSwing: ConfirmedHigh;
	closePrice: number;
}>;

export type StructureBreakEvent = DownwardStructureBreakEvent | UpwardStructureBreakEvent;

export type StructureBreakSession = Readonly<{
	sessionDate: string;
	event: StructureBreakEvent | null;
}>;
