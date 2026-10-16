import { groupHistoryByYear, selectRecentChanges } from '#web/lib/utils/line-wording/index.ts';

import { EventList } from './event-list.tsx';

import type { DisplayCurrency } from '#web/lib/utils/line-wording/index.ts';
import type { AvailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

type RecentChangesProps = { line: AvailableLine; currencies: readonly DisplayCurrency[] };

/**
 * The last month's Events, newest first, with Volatile Sessions collapsed under a count, then the
 * full history collapsed.
 */
export function RecentChanges({ line, currencies }: RecentChangesProps) {
	const { changes, volatileSessions } = selectRecentChanges(line);
	const hasChanges = changes.length > 0;
	const hasVolatileSessions = volatileSessions.length > 0;
	const isQuietMonth = !hasChanges && !hasVolatileSessions;
	const volatileSummary =
		volatileSessions.length === 1
			? '+ 1 rueda volátil (ver)'
			: `+ ${volatileSessions.length} ruedas volátiles (ver)`;
	const historyYears = groupHistoryByYear(line);

	return (
		<section>
			<h2>Últimos cambios</h2>
			{isQuietMonth && (
				<p>
					<strong>Sin cambios en el último mes.</strong>
				</p>
			)}
			{hasChanges && <EventList events={changes} currencies={currencies} />}
			{hasVolatileSessions && (
				<details>
					<summary>{volatileSummary}</summary>
					<EventList events={volatileSessions} currencies={currencies} />
				</details>
			)}
			{historyYears.length > 0 && (
				<details>
					<summary>Ver historial</summary>
					{historyYears.map(({ year, events }) => (
						<section key={year}>
							<h3>{year}</h3>
							<EventList events={events} currencies={currencies} />
						</section>
					))}
				</details>
			)}
		</section>
	);
}
