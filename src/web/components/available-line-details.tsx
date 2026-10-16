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

import { CurrencyVariants } from './currency-variants.tsx';
import { PhraseText } from './phrase-text.tsx';
import { RecentChanges } from './recent-changes.tsx';

import type { DisplayCurrency } from '#web/lib/utils/line-wording/index.ts';
import type { AvailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

type AvailableLineDetailsProps = { line: AvailableLine; currencies: readonly DisplayCurrency[] };

/**
 * Sections 1 to 5 of the line page: what the line is doing, its support and resistance, what would
 * change it, its last changes and the detail. Tier 2 is open and collapsible, tier 3 is collapsed.
 * Each phrase that names a price is rendered once per offered currency view.
 */
export function AvailableLineDetails({ line, currencies }: AvailableLineDetailsProps) {
	const { latestState: state } = line;
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
					<CurrencyVariants
						currencies={currencies}
						render={(currency) => (
							<PhraseText phrase={describePeriodReturns(line, currency)} />
						)}
					/>
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
				<CurrencyVariants
					currencies={currencies}
					as="div"
					render={(currency) => (
						<ul>
							{describeLevels(line, currency).map((phrase, index) => (
								<li key={index}>
									<PhraseText phrase={phrase} />
								</li>
							))}
						</ul>
					)}
				/>
			</section>
			<section>
				<h2>Qué observar</h2>
				<p>
					<CurrencyVariants
						currencies={currencies}
						render={(currency) => (
							<PhraseText phrase={describePattern(line, currency)} />
						)}
					/>
				</p>
				<CurrencyVariants
					currencies={currencies}
					as="div"
					render={(currency) =>
						describeTippingPoints(line, currency).map((phrase, index) => (
							<p key={index}>
								<PhraseText phrase={phrase} />
							</p>
						))
					}
				/>
				{pendingTransition !== null && (
					<p>
						<PhraseText phrase={pendingTransition} />
					</p>
				)}
			</section>
			<RecentChanges line={line} currencies={currencies} />
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
					<DetailList line={line} currencies={currencies} />
				</details>
			</section>
		</>
	);
}

function DetailList({ line, currencies }: AvailableLineDetailsProps) {
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
			<CurrencyVariants
				currencies={currencies}
				as="div"
				render={(currency) => (
					<ul>
						{describeRawEvidence(line, currency).map((fact) => (
							<li key={fact}>{fact}</li>
						))}
					</ul>
				)}
			/>
		</>
	);
}
