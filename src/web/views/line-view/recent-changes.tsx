import { Timeline } from '#web/components/timeline.tsx';
import { groupHistoryByYear, selectRecentChanges } from '#web/lib/utils/line-wording/index.ts';

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
		<section className="line-section" aria-labelledby="changes-heading">
			<h2 id="changes-heading">Últimos cambios</h2>
			{isQuietMonth && (
				<p className="quiet-month">
					<strong>Sin cambios en el último mes.</strong>
				</p>
			)}
			{hasChanges && <Timeline events={changes} currencies={currencies} />}
			{hasVolatileSessions && (
				<details>
					<summary>{volatileSummary}</summary>
					<Timeline events={volatileSessions} currencies={currencies} />
				</details>
			)}
			{historyYears.length > 0 && (
				<details>
					<summary>Ver historial</summary>
					{historyYears.map(({ year, events }) => (
						<section key={year} className="history-year">
							<h3>{year}</h3>
							<Timeline events={events} currencies={currencies} />
						</section>
					))}
				</details>
			)}
		</section>
	);
}
