import { LARGE_MOVE_NOTE, describeEvent } from '#web/lib/utils/line-wording/index.ts';

import { CurrencyVariants } from './currency-variants.tsx';
import { PhraseText } from './phrase-text.tsx';

import type { DisplayCurrency } from '#web/lib/utils/line-wording/index.ts';
import type { SnapshotEvent } from '#web/lib/utils/snapshot-pages/index.ts';

type EventListProps = { events: readonly SnapshotEvent[]; currencies: readonly DisplayCurrency[] };

export function EventList({ events, currencies }: EventListProps) {
	return (
		<ul>
			{events.map((snapshotEvent, index) => (
				<li key={`${snapshotEvent.sessionDate}-${snapshotEvent.event.type}-${index}`}>
					<EventText snapshotEvent={snapshotEvent} currencies={currencies} />
					{snapshotEvent.coincidesWithLargeMove && ` ${LARGE_MOVE_NOTE}`}
				</li>
			))}
		</ul>
	);
}

/** Only a Structure Break names prices, so only it is written once per view. */
function EventText({
	snapshotEvent,
	currencies,
}: {
	snapshotEvent: SnapshotEvent;
	currencies: readonly DisplayCurrency[];
}) {
	const hasPrices = snapshotEvent.event.type === 'structure-break';
	const textCurrencies = hasPrices ? currencies : currencies.slice(0, 1);

	return (
		<CurrencyVariants
			currencies={textCurrencies}
			render={(currency) => <PhraseText phrase={describeEvent(snapshotEvent, currency)} />}
		/>
	);
}
