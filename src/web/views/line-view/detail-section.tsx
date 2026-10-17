import { CurrencyVariants } from '#web/components/currency-variants.tsx';
import { Meter } from '#web/components/meter.tsx';
import { PhraseText } from '#web/components/phrase-text.tsx';
import {
	formatSignedOneDecimal,
	formatWholeNumber,
} from '#web/lib/utils/es-ar-formatting/index.ts';
import {
	describeMomentum,
	describeRawEvidence,
	describeShortTermStretch,
	describeSwingDates,
} from '#web/lib/utils/line-wording/index.ts';
import { placeOnScale } from '#web/lib/utils/visual-scale/index.ts';

import type { DisplayCurrency } from '#web/lib/utils/line-wording/index.ts';
import type { AvailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

type DetailSectionProps = Readonly<{ line: AvailableLine; currencies: readonly DisplayCurrency[] }>;

// RSI's conventional zones: readings beyond them mean recent moves were one-sided. They are display
// marks only; the analysis uses no RSI threshold.
const RSI_SCALE = { min: 0, max: 100 } as const;
const RSI_LOWER_ZONE_EDGE = 30;
const RSI_UPPER_ZONE_EDGE = 70;
// The stretch is drawn on ±3 ATR; a reading beyond reaches the end, and its sentence says how far.
const STRETCH_SCALE = { min: -3, max: 3 } as const;

/** "Detalle": momentum and the short-term stretch, then the swing dates and the exact prices. */
export function DetailSection({ line, currencies }: DetailSectionProps) {
	const { latestState: state } = line;
	const momentum = describeMomentum(state.rsi);
	const shortTermStretch = describeShortTermStretch(state.priceRelativeToEmaInAtr);
	const swingDates = describeSwingDates(state);

	return (
		<section className="line-section" aria-labelledby="detail-heading">
			<h2 id="detail-heading">Detalle</h2>
			<div className="detail-grid">
				{momentum !== null && state.rsi !== null && (
					<div className="detail-card">
						<h3>Momentum</h3>
						<RsiMeter rsi={state.rsi} />
						<p>
							<PhraseText phrase={momentum} />
						</p>
					</div>
				)}
				{shortTermStretch !== null && state.priceRelativeToEmaInAtr !== null && (
					<div className="detail-card">
						<h3>Estiramiento de corto plazo</h3>
						<StretchMeter stretch={state.priceRelativeToEmaInAtr} />
						<p>
							<PhraseText phrase={shortTermStretch} />
						</p>
					</div>
				)}
			</div>
			<details>
				<summary>Más detalle</summary>
				{swingDates !== null && <p>{swingDates}</p>}
				<CurrencyVariants
					currencies={currencies}
					as="div"
					render={(currency) => (
						<ul className="prose-list">
							{describeRawEvidence(line, currency).map((fact) => (
								<li key={fact}>{fact}</li>
							))}
						</ul>
					)}
				/>
			</details>
		</section>
	);
}

function RsiMeter({ rsi }: { rsi: number }) {
	const position = placeOnScale(rsi, RSI_SCALE);

	return (
		<Meter
			zones={[
				{ from: 0, to: RSI_LOWER_ZONE_EDGE },
				{ from: RSI_UPPER_ZONE_EDGE, to: 100 },
			]}
			ticks={[RSI_LOWER_ZONE_EDGE, RSI_UPPER_ZONE_EDGE]}
			needle={position}
			reading={{ position, label: formatWholeNumber(rsi) }}
			tags={[
				{ position: 3, label: '0' },
				{ position: RSI_LOWER_ZONE_EDGE, label: '30' },
				{ position: RSI_UPPER_ZONE_EDGE, label: '70' },
				{ position: 97, label: '100' },
			]}
		/>
	);
}

function StretchMeter({ stretch }: { stretch: number }) {
	const zeroPosition = placeOnScale(0, STRETCH_SCALE);
	const position = placeOnScale(stretch, STRETCH_SCALE);
	const reading = formatSignedOneDecimal(stretch);

	return (
		<Meter
			fill={{ from: zeroPosition, to: position }}
			ticks={[zeroPosition]}
			reading={{ position, label: reading }}
			tags={[
				{ position: 3, label: '−3' },
				{ position: zeroPosition, label: 'media 20' },
				{ position: 97, label: '+3' },
			]}
		/>
	);
}
