import { LARGE_MOVE_NOTE, describeEvent } from '#web/lib/utils/line-wording/index.ts';

import { PhraseText } from './phrase-text.tsx';

import type { SnapshotEvent, SnapshotPriceUnit } from '#web/lib/utils/snapshot-pages/index.ts';

type EventListProps = { events: readonly SnapshotEvent[]; priceUnit: SnapshotPriceUnit };

export function EventList({ events, priceUnit }: EventListProps) {
	return (
		<ul>
			{events.map((snapshotEvent, index) => (
				<li key={`${snapshotEvent.sessionDate}-${snapshotEvent.event.type}-${index}`}>
					<PhraseText phrase={describeEvent(snapshotEvent, priceUnit)} />
					{snapshotEvent.coincidesWithLargeMove && ` ${LARGE_MOVE_NOTE}`}
				</li>
			))}
		</ul>
	);
}
