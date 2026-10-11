import type { AnalysisSnapshotOverview } from '#modules/analysis-run/index.ts';

export type SnapshotLine = AnalysisSnapshotOverview['analyzedLines'][number];
export type AvailableLine = Extract<SnapshotLine, { status: 'available' }>;
export type UnavailableLine = Extract<SnapshotLine, { status: 'unavailable' }>;
export type SnapshotEvent = AvailableLine['events'][number];
