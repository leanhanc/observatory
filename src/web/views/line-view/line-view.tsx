import { describeLineIdentity } from '#web/lib/utils/line-identity/index.ts';
import { selectDisplayCurrencies } from '#web/lib/utils/line-wording/index.ts';

import { DetailSection } from './detail-section.tsx';
import { LevelsSection } from './levels-section.tsx';
import { LineHeader } from './line-header.tsx';
import { PriceSection } from './price-section.tsx';
import { RecentChanges } from './recent-changes.tsx';
import { TrendSection } from './trend-section.tsx';
import { UnavailableNotice } from './unavailable-notice.tsx';
import { WatchSection } from './watch-section.tsx';

import type { LinePageProps } from '#web/lib/utils/snapshot-pages/index.ts';

/**
 * A line's page, in its fixed order: who the line is and its last close, the currency and the
 * chart, what it is doing, its support and resistance, what to watch, its last changes and the
 * detail. An unavailable line shows its identity and why it was not analyzed.
 */
export function LineView({ requestedThroughSession, line }: LinePageProps) {
	const identity = describeLineIdentity(line);
	// An unavailable line shows no prices, so it has no currency views.
	const currencies =
		line.status === 'available' ? selectDisplayCurrencies(line, identity.isPesoLine) : [];

	return (
		<main className="line-page">
			<LineHeader
				identity={identity}
				line={line}
				requestedThroughSession={requestedThroughSession}
				currencies={currencies}
			/>
			{line.status === 'available' ? (
				<>
					<PriceSection ticker={identity.ticker} line={line} currencies={currencies} />
					<TrendSection line={line} currencies={currencies} />
					<LevelsSection line={line} currencies={currencies} />
					<WatchSection line={line} currencies={currencies} />
					<RecentChanges line={line} currencies={currencies} />
					<DetailSection line={line} currencies={currencies} />
				</>
			) : (
				<UnavailableNotice line={line} />
			)}
		</main>
	);
}
