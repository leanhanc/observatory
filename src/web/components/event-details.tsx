import { describeEvent } from '#web/lib/utils/line-formatting/index.ts';

import type { SnapshotEvent, SnapshotPriceUnit } from '#web/lib/utils/snapshot-pages/index.ts';

type EventDetailsProps = { snapshotEvent: SnapshotEvent; priceUnit: SnapshotPriceUnit };

export function EventDetails({ snapshotEvent, priceUnit }: EventDetailsProps) {
	const { sessionDate, event, coincidesWithLargeMove } = snapshotEvent;
	const largeMoveNote = coincidesWithLargeMove
		? ' Unusually large price move that day; it may be a split rather than real trading.'
		: '';

	return (
		<>
			{sessionDate} · {event.type}: {describeEvent(event, priceUnit)}
			{largeMoveNote}
		</>
	);
}
