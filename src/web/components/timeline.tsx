import { LARGE_MOVE_NOTE, describeEvent } from '#web/lib/utils/line-wording/index.ts';

import { CurrencyVariants } from './currency-variants.tsx';
import { PhraseText } from './phrase-text.tsx';

import type { DisplayCurrency } from '#web/lib/utils/line-wording/index.ts';
import type { SnapshotEvent } from '#web/lib/utils/snapshot-pages/index.ts';

type TimelineProps = { events: readonly SnapshotEvent[]; currencies: readonly DisplayCurrency[] };

/**
 * Events as a vertical timeline, newest first. Each Event's mark shows its kind, a square for a
 * trend change, a diamond for a pattern break and a circle for a volatile session, and its sentence
 * names it, so the mark carries no meaning the text does not.
 */
export function Timeline({ events, currencies }: TimelineProps) {
	return (
		<ol className="timeline">
			{events.map((snapshotEvent, index) => (
				<li key={`${snapshotEvent.sessionDate}-${snapshotEvent.event.type}-${index}`}>
					<EventMark type={snapshotEvent.event.type} />
					<p>
						<EventText snapshotEvent={snapshotEvent} currencies={currencies} />
						{snapshotEvent.coincidesWithLargeMove && ` ${LARGE_MOVE_NOTE}`}
					</p>
				</li>
			))}
		</ol>
	);
}

function EventMark({ type }: { type: SnapshotEvent['event']['type'] }) {
	return (
		<svg className="timeline-mark" viewBox="0 0 12 12" aria-hidden="true">
			{type === 'regime-transition' && (
				<rect x="1.5" y="1.5" width="9" height="9" fill="currentColor" />
			)}
			{type === 'structure-break' && (
				<path
					d="M6 1l5 5-5 5-5-5z"
					fill="var(--bg)"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
			)}
			{type === 'volatile-session' && (
				<circle
					cx="6"
					cy="6"
					r="4.25"
					fill="var(--bg)"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
			)}
		</svg>
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
