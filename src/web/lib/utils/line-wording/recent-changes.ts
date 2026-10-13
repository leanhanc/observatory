import type { AvailableLine, SnapshotEvent } from '#web/lib/utils/snapshot-pages/index.ts';

// "Últimos cambios" covers the same month as the one-month period return, so the page never says
// "no changes in the last month" about a different month than the return beside it.
const RECENT_CHANGES_WINDOW_MONTHS = 1;

/** The Events of the last month, newest first, with Volatile Sessions kept apart for collapsing. */
export type RecentChanges = Readonly<{
	changes: readonly SnapshotEvent[];
	volatileSessions: readonly SnapshotEvent[];
}>;

/**
 * Selects the Events after the start of the line's one-month period return, the month its State
 * describes. When that return is unavailable, the line's history is shorter than a month, so every
 * Event is within it.
 *
 * @throws {Error} when the snapshot has no one-month period return, since the page could not say
 * which month it describes.
 */
export function selectRecentChanges(line: AvailableLine): RecentChanges {
	const monthReturn = line.periodReturns.find(
		({ windowMonths }) => windowMonths === RECENT_CHANGES_WINDOW_MONTHS,
	);

	if (monthReturn === undefined) {
		throw new Error(
			`${line.tradingLineId} has no one-month period return to bound its recent changes.`,
		);
	}

	const { fromSessionDate } = monthReturn;
	const recentEvents =
		fromSessionDate === null
			? line.events
			: line.events.filter(({ sessionDate }) => sessionDate > fromSessionDate);
	const newestFirst = recentEvents.toReversed();

	return {
		changes: newestFirst.filter(({ event }) => event.type !== 'volatile-session'),
		volatileSessions: newestFirst.filter(({ event }) => event.type === 'volatile-session'),
	};
}

/** One calendar year of the full history; list dates carry no year, so the year heads them. */
export type HistoryYear = Readonly<{ year: string; events: readonly SnapshotEvent[] }>;

/** Every Event of the analyzed window, newest first, grouped by calendar year. */
export function groupHistoryByYear(line: AvailableLine): readonly HistoryYear[] {
	const years: HistoryYear[] = [];

	for (const snapshotEvent of line.events.toReversed()) {
		const year = snapshotEvent.sessionDate.slice(0, 4);
		const currentYear = years.at(-1);

		if (currentYear?.year === year) {
			years[years.length - 1] = { year, events: [...currentYear.events, snapshotEvent] };
			continue;
		}

		years.push({ year, events: [snapshotEvent] });
	}

	return years;
}
