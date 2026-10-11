import type {
	BarHistory,
	BarHistoryCorrection,
	DailyBar,
	SessionDateRange,
} from '../../bar-history.types.ts';
import type { MergeDailyBarsResult } from './bar-history-reconciler.types.ts';

export function mergeDailyBars(
	existingBars: readonly DailyBar[],
	incomingBars: readonly DailyBar[],
): MergeDailyBarsResult {
	const barsBySessionDate = new Map<string, DailyBar>();

	for (const bar of existingBars) {
		barsBySessionDate.set(bar.sessionDate, { ...bar });
	}

	const corrections: BarHistoryCorrection[] = [];

	for (const incomingBar of incomingBars) {
		const existingBar = barsBySessionDate.get(incomingBar.sessionDate);

		if (existingBar && !Bun.deepEquals(existingBar, incomingBar, true)) {
			corrections.push({
				sessionDate: incomingBar.sessionDate,
				previousBar: { ...existingBar },
				correctedBar: { ...incomingBar },
			});
		}

		barsBySessionDate.set(incomingBar.sessionDate, { ...incomingBar });
	}

	const bars = [...barsBySessionDate.values()].toSorted((left, right) =>
		left.sessionDate.localeCompare(right.sessionDate),
	);

	return { bars, corrections };
}

export function findMissingStoredSessionDates(
	existingBars: readonly DailyBar[],
	incomingBars: readonly DailyBar[],
	window: SessionDateRange,
): readonly string[] {
	const incomingSessionDates = new Set(incomingBars.map((bar) => bar.sessionDate));

	return existingBars
		.filter((bar) => checkIfSessionDateIsInsideRange(bar.sessionDate, window))
		.filter((bar) => !incomingSessionDates.has(bar.sessionDate))
		.map((bar) => bar.sessionDate);
}

export function findOutOfWindowSessionDates(
	bars: readonly DailyBar[],
	window: SessionDateRange,
): readonly string[] {
	return bars
		.filter((bar) => !checkIfSessionDateIsInsideRange(bar.sessionDate, window))
		.map((bar) => bar.sessionDate);
}

export function checkIfBarHistoriesAreEqual(left: BarHistory, right: BarHistory): boolean {
	return Bun.deepEquals(left, right, true);
}

function checkIfSessionDateIsInsideRange(sessionDate: string, range: SessionDateRange): boolean {
	return sessionDate >= range.start && sessionDate <= range.end;
}
