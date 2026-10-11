import { formatEvaluatedValue } from '#web/lib/utils/line-formatting/index.ts';

import { EventDetails } from './event-details.tsx';

import type { AvailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

export function AvailableLineDetails({ line }: { line: AvailableLine }) {
	const { sessionDate, regime, structure, rsi, priceRelativeToEmaInAtr } = line.latestState;
	const hasEvents = line.events.length > 0;

	return (
		<>
			<h2>State at the close of {sessionDate}</h2>
			<ul>
				<li>Regime: {formatEvaluatedValue(regime)}</li>
				<li>Structure: {formatEvaluatedValue(structure)}</li>
				<li>RSI: {formatEvaluatedValue(rsi)}</li>
				<li>
					Price relative to EMA, in ATRs: {formatEvaluatedValue(priceRelativeToEmaInAtr)}
				</li>
			</ul>
			<h2>Events</h2>
			{hasEvents ? (
				<ul>
					{line.events.map((snapshotEvent, index) => (
						<li
							key={`${snapshotEvent.sessionDate}-${snapshotEvent.event.type}-${index}`}
						>
							<EventDetails snapshotEvent={snapshotEvent} />
						</li>
					))}
				</ul>
			) : (
				<p>No Events.</p>
			)}
		</>
	);
}
