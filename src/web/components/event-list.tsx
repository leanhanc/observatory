import { LARGE_MOVE_NOTE, describeEvent } from '#web/lib/utils/line-wording/index.ts';

import { PhraseText } from './phrase-text.tsx';

import type { PriceContext } from '#web/lib/utils/line-wording/index.ts';
import type { SnapshotEvent } from '#web/lib/utils/snapshot-pages/index.ts';

type EventListProps = { events: readonly SnapshotEvent[]; context: PriceContext };

export function EventList({ events, context }: EventListProps) {
	return (
		<ul>
			{events.map((snapshotEvent, index) => (
				<li key={`${snapshotEvent.sessionDate}-${snapshotEvent.event.type}-${index}`}>
					<PhraseText phrase={describeEvent(snapshotEvent, context)} />
					{snapshotEvent.coincidesWithLargeMove && ` ${LARGE_MOVE_NOTE}`}
				</li>
			))}
		</ul>
	);
}
