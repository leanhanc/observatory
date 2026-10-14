import {
	describeLevels,
	describeLongTermDistance,
	describeMomentum,
	describePattern,
	describeRawEvidence,
	describePendingTransition,
	describePeriodReturns,
	describeShortTermStretch,
	describeSwingDates,
	describeTippingPoints,
	describeTrend,
} from '#web/lib/utils/line-wording/index.ts';

import { PhraseText } from './phrase-text.tsx';
import { RecentChanges } from './recent-changes.tsx';

import type { PriceContext } from '#web/lib/utils/line-wording/index.ts';
import type { AvailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

type AvailableLineDetailsProps = { line: AvailableLine; context: PriceContext };

/**
 * Sections 1 to 5 of the line page: what the line is doing, its support and resistance, what would
 * change it, its last changes and the detail. Tier 2 is open and collapsible, tier 3 is collapsed.
 */
export function AvailableLineDetails({ line, context }: AvailableLineDetailsProps) {
	const { latestState: state, pesoEquivalents, periodReturns } = line;
	const longTermDistance = describeLongTermDistance(state.priceRelativeToLongTermEmaInPercent);
	const pendingTransition = describePendingTransition(state.pendingRegimeTransition);
	const momentum = describeMomentum(state.rsi);

	return (
		<>
			<section>
				<h2>Qué está haciendo</h2>
				<p>
					<PhraseText phrase={describeTrend(state.regime)} />
				</p>
				<p>
					<PhraseText phrase={describePeriodReturns(periodReturns, context.priceUnit)} />
				</p>
				{longTermDistance !== null && (
					<details open>
						<summary>Media móvil de 200 ruedas</summary>
						<p>
							<PhraseText phrase={longTermDistance} />
						</p>
					</details>
				)}
			</section>
			<section>
				<h2>Soporte y resistencia</h2>
				<ul>
					{describeLevels(state, pesoEquivalents, context).map((phrase, index) => (
						<li key={index}>
							<PhraseText phrase={phrase} />
						</li>
					))}
				</ul>
			</section>
			<section>
				<h2>Qué observar</h2>
				<p>
					<PhraseText phrase={describePattern(state, pesoEquivalents, context)} />
				</p>
				{describeTippingPoints(state, pesoEquivalents, context).map((phrase, index) => (
					<p key={index}>
						<PhraseText phrase={phrase} />
					</p>
				))}
				{pendingTransition !== null && (
					<p>
						<PhraseText phrase={pendingTransition} />
					</p>
				)}
			</section>
			<RecentChanges line={line} context={context} />
			<section>
				<h2>Detalle</h2>
				{momentum !== null && (
					<details open>
						<summary>Momentum</summary>
						<p>
							<PhraseText phrase={momentum} />
						</p>
					</details>
				)}
				<details>
					<summary>Más detalle</summary>
					<DetailList line={line} context={context} />
				</details>
			</section>
		</>
	);
}

function DetailList({ line, context }: AvailableLineDetailsProps) {
	const shortTermStretch = describeShortTermStretch(line.latestState.priceRelativeToEmaInAtr);
	const swingDates = describeSwingDates(line.latestState);

	return (
		<>
			{shortTermStretch !== null && (
				<p>
					<PhraseText phrase={shortTermStretch} />
				</p>
			)}
			{swingDates !== null && <p>{swingDates}</p>}
			<ul>
				{describeRawEvidence(line, context).map((fact) => (
					<li key={fact}>{fact}</li>
				))}
			</ul>
		</>
	);
}
