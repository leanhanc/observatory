import type { BarHistoryCorrection, DailyBar } from '../../bar-history.types.ts';

export type MergeDailyBarsResult = Readonly<{
	bars: readonly DailyBar[];
	corrections: readonly BarHistoryCorrection[];
}>;
