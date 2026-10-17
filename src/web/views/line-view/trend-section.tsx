import { CurrencyVariants } from '#web/components/currency-variants.tsx';
import { PhraseText } from '#web/components/phrase-text.tsx';
import { ReturnBars } from '#web/components/return-bars.tsx';
import { Ruler } from '#web/components/ruler.tsx';
import { TrendChip } from '#web/components/trend-chip.tsx';
import { formatSignedPercent } from '#web/lib/utils/es-ar-formatting/index.ts';
import {
	describeLongTermDistance,
	describePeriodReturns,
	describeReturnFigures,
	describeTrend,
	describeTrendName,
	formatCurrencyPrice,
	selectCurrencyLevels,
	selectNamedTippingPoints,
	selectViewClose,
} from '#web/lib/utils/line-wording/index.ts';
import { buildPaddedDomain, placeOnScale } from '#web/lib/utils/visual-scale/index.ts';

import type { RulerMark } from '#web/components/ruler.tsx';
import type { DisplayCurrency } from '#web/lib/utils/line-wording/index.ts';
import type { AvailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

type TrendSectionProps = Readonly<{ line: AvailableLine; currencies: readonly DisplayCurrency[] }>;

// Room at each end for the tags of the outermost marks.
const RULER_PADDING_RATIO = 0.1;

/** "Qué está haciendo": the trend, how far the close moved, and where it sits against its average. */
export function TrendSection({ line, currencies }: TrendSectionProps) {
	const { latestState: state } = line;
	const trendName = describeTrendName(state.regime);
	const longTermDistance = describeLongTermDistance(state.priceRelativeToLongTermEmaInPercent);

	return (
		<section className="line-section" aria-labelledby="trend-heading">
			<h2 id="trend-heading">Qué está haciendo</h2>
			{trendName !== null && <TrendChip label={trendName} />}
			<p className="lead">
				<PhraseText phrase={describeTrend(state.regime)} />
			</p>
			<div className="measure">
				<h3>Cuánto se movió</h3>
				<CurrencyVariants
					currencies={currencies}
					as="div"
					render={(currency) => (
						<>
							<ReturnBars figures={describeReturnFigures(line, currency)} />
							<p>
								<PhraseText phrase={describePeriodReturns(line, currency)} />
							</p>
						</>
					)}
				/>
			</div>
			{longTermDistance !== null && (
				<div className="measure">
					<h3>Media móvil de 200 ruedas</h3>
					<p>
						<PhraseText phrase={longTermDistance} />
					</p>
					<LongTermAverageRuler line={line} currencies={currencies} />
				</div>
			)}
		</section>
	);
}

/**
 * The close against its 200-session average and Regime's noise band, the tipping closes half an ATR
 * on either side of it. The tipping point the trend sentence names is drawn in accent.
 */
function LongTermAverageRuler({ line, currencies }: TrendSectionProps) {
	const { latestState: state } = line;
	const { longTermEma, regimeTippingCloses, priceRelativeToLongTermEmaInPercent } = state;

	if (
		longTermEma === null ||
		regimeTippingCloses === null ||
		priceRelativeToLongTermEmaInPercent === null
	) {
		return null;
	}

	// Every currency converts these values at one session's rate, so the MEP-dollar positions hold
	// in every view; only the printed prices change.
	const close = line.latestClose.mep.close;
	const edges = {
		bullish: regimeTippingCloses.bullish.closeAbove,
		bearish: regimeTippingCloses.bearish.closeBelow,
	};
	const domain = buildPaddedDomain(
		[close, longTermEma, edges.bullish, edges.bearish],
		RULER_PADDING_RATIO,
	);
	const place = (value: number) => placeOnScale(value, domain);
	const namedTippingPoints = selectNamedTippingPoints(line);
	const closePosition = place(close);

	const closeMark: RulerMark = {
		position: closePosition,
		emphasis: 'close',
		above: (
			<>
				<b className="figure">{formatSignedPercent(priceRelativeToLongTermEmaInPercent)}</b>{' '}
				cierre
			</>
		),
		below: (
			<CurrencyVariants
				currencies={currencies}
				render={(currency) =>
					formatCurrencyPrice(selectViewClose(line, currency), currency)
				}
			/>
		),
	};
	const tippingMarks: readonly RulerMark[] = namedTippingPoints.map(({ side, tag }) => ({
		position: place(edges[side]),
		emphasis: 'strong',
		below: (
			<span className="ruler-tag-accent">
				<b>{tag}</b>{' '}
				<CurrencyVariants
					currencies={currencies}
					render={(currency) =>
						formatCurrencyPrice(selectTippingClose(line, currency, side), currency)
					}
				/>
			</span>
		),
	}));
	const averageMark: RulerMark = {
		position: place(longTermEma),
		emphasis: 'tick',
		above: 'media 200',
		below: (
			<CurrencyVariants
				currencies={currencies}
				render={(currency) =>
					formatCurrencyPrice(selectLongTermEma(line, currency), currency)
				}
			/>
		),
	};
	const [onlyTippingPoint] = namedTippingPoints;
	const gap =
		namedTippingPoints.length === 1 && onlyTippingPoint !== undefined
			? { from: closePosition, to: place(edges[onlyTippingPoint.side]) }
			: undefined;

	return (
		<>
			<Ruler
				marks={[...tippingMarks, closeMark, averageMark]}
				band={{ from: place(edges.bearish), to: place(edges.bullish) }}
				{...(gap && { gap })}
			/>
			<p className="measure-note">
				La franja sombreada es medio movimiento diario típico (0,5 ATR) a cada lado de la
				media. Mientras el cierre quede adentro la tendencia no cambia por ruido.
			</p>
		</>
	);
}

function selectLongTermEma(line: AvailableLine, currency: DisplayCurrency): number {
	const { longTermEma } = selectCurrencyLevels(line, currency);

	if (longTermEma === null) {
		throw new Error('The snapshot has no equivalent for the long-term average the State has.');
	}

	return longTermEma;
}

function selectTippingClose(
	line: AvailableLine,
	currency: DisplayCurrency,
	side: 'bullish' | 'bearish',
): number {
	const tippingCloses = selectCurrencyLevels(line, currency).regimeTippingCloses;

	if (tippingCloses === null) {
		throw new Error('The snapshot has no equivalent for a tipping close the State has.');
	}

	return side === 'bullish' ? tippingCloses.bullishCloseAbove : tippingCloses.bearishCloseBelow;
}
