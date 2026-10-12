import {
	formatEvaluatedPercent,
	formatEvaluatedValue,
	formatPendingRegimeTransition,
	formatPesoSwingLevel,
	formatPesos,
	formatSwingLevel,
} from '#web/lib/utils/line-formatting/index.ts';

import { EventDetails } from './event-details.tsx';

import type { AvailableLine, SnapshotPriceUnit } from '#web/lib/utils/snapshot-pages/index.ts';

type AvailableLineDetailsProps = { line: AvailableLine; priceUnit: SnapshotPriceUnit };

export function AvailableLineDetails({ line, priceUnit }: AvailableLineDetailsProps) {
	const {
		sessionDate,
		regime,
		pendingRegimeTransition,
		structure,
		lastConfirmedSwingHigh,
		lastConfirmedSwingLow,
		rsi,
		priceRelativeToEmaInAtr,
		priceRelativeToLongTermEmaInPercent,
	} = line.latestState;
	const { pesoEquivalents } = line;
	const hasEvents = line.events.length > 0;

	return (
		<>
			<h2>State at the close of {sessionDate}</h2>
			<ul>
				<li>Regime: {formatEvaluatedValue(regime)}</li>
				<li>
					Pending Regime transition:{' '}
					{formatPendingRegimeTransition(pendingRegimeTransition)}
				</li>
				<li>Structure: {formatEvaluatedValue(structure)}</li>
				<li>
					Last confirmed swing high: {formatSwingLevel(lastConfirmedSwingHigh, priceUnit)}
				</li>
				<li>
					Last confirmed swing low: {formatSwingLevel(lastConfirmedSwingLow, priceUnit)}
				</li>
				<li>RSI: {formatEvaluatedValue(rsi)}</li>
				<li>
					Price relative to EMA, in ATRs: {formatEvaluatedValue(priceRelativeToEmaInAtr)}
				</li>
				<li>
					Price relative to the long-term EMA:{' '}
					{formatEvaluatedPercent(priceRelativeToLongTermEmaInPercent)}
				</li>
			</ul>
			<h3>In pesos</h3>
			<ul>
				<li>
					Close on {pesoEquivalents.sessionDate}: {formatPesos(pesoEquivalents.close)}
				</li>
				<li>
					Last confirmed swing high:{' '}
					{formatPesoSwingLevel(pesoEquivalents.lastConfirmedSwingHigh, pesoEquivalents)}
				</li>
				<li>
					Last confirmed swing low:{' '}
					{formatPesoSwingLevel(pesoEquivalents.lastConfirmedSwingLow, pesoEquivalents)}
				</li>
			</ul>
			<p>
				Swing levels are found on prices in MEP dollars. Their peso equivalents move with
				the MEP rate and are not prices at which the line turned in pesos.
			</p>
			<h2>Events</h2>
			{hasEvents ? (
				<ul>
					{line.events.map((snapshotEvent, index) => (
						<li
							key={`${snapshotEvent.sessionDate}-${snapshotEvent.event.type}-${index}`}
						>
							<EventDetails snapshotEvent={snapshotEvent} priceUnit={priceUnit} />
						</li>
					))}
				</ul>
			) : (
				<p>No Events.</p>
			)}
		</>
	);
}
