import { CurrencyVariants } from '#web/components/currency-variants.tsx';
import { PhraseText } from '#web/components/phrase-text.tsx';
import { Ruler } from '#web/components/ruler.tsx';
import { formatSignedPercent } from '#web/lib/utils/es-ar-formatting/index.ts';
import {
	describePattern,
	describePendingTransition,
	describeTippingPoints,
	selectNamedTippingPoints,
	selectPatternLevel,
} from '#web/lib/utils/line-wording/index.ts';
import { buildPaddedDomain, placeOnScale } from '#web/lib/utils/visual-scale/index.ts';

import type { RulerMark } from '#web/components/ruler.tsx';
import type { DisplayCurrency } from '#web/lib/utils/line-wording/index.ts';
import type { AvailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

type WatchSectionProps = Readonly<{ line: AvailableLine; currencies: readonly DisplayCurrency[] }>;

const RULER_PADDING_RATIO = 0.08;

/**
 * "Qué observar": the close that would break the pattern and the closes that would change the
 * trend, each with how far the close would have to move to reach it.
 */
export function WatchSection({ line, currencies }: WatchSectionProps) {
	const patternDistance = selectPatternDistance(line);
	const tippingDistances = selectNamedTippingPoints(line).map(({ side }) =>
		side === 'bullish'
			? line.watchDistances.bullishCloseAbove
			: line.watchDistances.bearishCloseBelow,
	);
	const pendingTransition = describePendingTransition(line.latestState.pendingRegimeTransition);

	return (
		<section className="line-section" aria-labelledby="watch-heading">
			<h2 id="watch-heading">Qué observar</h2>
			<WatchRuler patternDistance={patternDistance} tippingDistances={tippingDistances} />
			<ol className="watch-list">
				<li>
					<WatchDistance distance={patternDistance} />
					<p>
						<CurrencyVariants
							currencies={currencies}
							render={(currency) => (
								<PhraseText phrase={describePattern(line, currency)} />
							)}
						/>
					</p>
				</li>
				{tippingDistances.map((distance, index) => (
					<li key={index}>
						<WatchDistance distance={distance} />
						<p>
							<CurrencyVariants
								currencies={currencies}
								render={(currency) => {
									const phrase = describeTippingPoints(line, currency)[index];
									return phrase === undefined ? null : (
										<PhraseText phrase={phrase} />
									);
								}}
							/>
						</p>
					</li>
				))}
			</ol>
			{pendingTransition !== null && (
				<p>
					<PhraseText phrase={pendingTransition} />
				</p>
			)}
		</section>
	);
}

function selectPatternDistance(line: AvailableLine): number | null {
	const patternLevel = selectPatternLevel(line);

	if (patternLevel === 'high') {
		return line.watchDistances.lastConfirmedSwingHigh;
	}

	if (patternLevel === 'low') {
		return line.watchDistances.lastConfirmedSwingLow;
	}

	return null;
}

function WatchDistance({ distance }: { distance: number | null }) {
	return (
		<span className="watch-distance figure">
			{distance === null ? '' : formatSignedPercent(distance)}
		</span>
	);
}

/**
 * The close at zero and each level the section names at its distance from it: the pattern's break
 * level as a tick and the trend's tipping points in accent. The distances are the same in every
 * currency, so the ruler is drawn once.
 */
function WatchRuler({
	patternDistance,
	tippingDistances,
}: {
	patternDistance: number | null;
	tippingDistances: readonly (number | null)[];
}) {
	const readableTippingDistances = tippingDistances.filter((distance) => distance !== null);
	const hasLevels = patternDistance !== null || readableTippingDistances.length > 0;

	if (!hasLevels) {
		return null;
	}

	const levelDistances = [patternDistance, ...readableTippingDistances].filter(
		(distance) => distance !== null,
	);
	const domain = buildPaddedDomain([0, ...levelDistances], RULER_PADDING_RATIO);
	const place = (distance: number) => placeOnScale(distance, domain);
	const closePosition = place(0);

	const closeMark: RulerMark = {
		position: closePosition,
		emphasis: 'close',
		above: <b>cierre</b>,
	};
	const tippingMarks: readonly RulerMark[] = readableTippingDistances.map((distance) => ({
		position: place(distance),
		emphasis: 'strong',
		above: <b className="ruler-tag-accent">tendencia</b>,
		below: <span className="figure">{formatSignedPercent(distance)}</span>,
	}));
	const patternMarks: readonly RulerMark[] =
		patternDistance === null
			? []
			: [
					{
						position: place(patternDistance),
						emphasis: 'tick',
						above: 'patrón',
						below: (
							<span className="figure">{formatSignedPercent(patternDistance)}</span>
						),
					},
				];
	const [nearestTippingDistance] = readableTippingDistances.toSorted(
		(left, right) => Math.abs(left) - Math.abs(right),
	);
	const band =
		nearestTippingDistance === undefined
			? undefined
			: { from: closePosition, to: place(nearestTippingDistance) };

	return <Ruler marks={[closeMark, ...tippingMarks, ...patternMarks]} {...(band && { band })} />;
}
