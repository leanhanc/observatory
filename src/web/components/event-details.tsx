import { describeEvent } from '#web/lib/utils/line-formatting.ts';

import type { SnapshotEvent } from '#web/lib/utils/snapshot-pages.types.ts';

export function EventDetails({ snapshotEvent }: { snapshotEvent: SnapshotEvent }) {
	const { sessionDate, event, coincidesWithLargeMove } = snapshotEvent;
	const largeMoveNote = coincidesWithLargeMove
		? ' Unusually large price move that day; it may be a split rather than real trading.'
		: '';

	return (
		<>
			{sessionDate} · {event.type}: {describeEvent(event)}
			{largeMoveNote}
		</>
	);
}
