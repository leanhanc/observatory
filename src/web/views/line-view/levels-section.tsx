import { CurrencyVariants } from '#web/components/currency-variants.tsx';
import { PhraseText } from '#web/components/phrase-text.tsx';
import { Ruler } from '#web/components/ruler.tsx';
import {
	describeLevels,
	formatCurrencyPrice,
	selectNamedLevels,
	selectViewClose,
} from '#web/lib/utils/line-wording/index.ts';
import { buildPaddedDomain, placeOnScale } from '#web/lib/utils/visual-scale/index.ts';

import type { RulerMark } from '#web/components/ruler.tsx';
import type { DisplayCurrency, NamedLevels } from '#web/lib/utils/line-wording/index.ts';
import type { AvailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

type LevelsSectionProps = Readonly<{ line: AvailableLine; currencies: readonly DisplayCurrency[] }>;

const RULER_PADDING_RATIO = 0.12;

/** "Soporte y resistencia": where the close sits between the levels the section names. */
export function LevelsSection({ line, currencies }: LevelsSectionProps) {
	return (
		<section className="line-section" aria-labelledby="levels-heading">
			<h2 id="levels-heading">Soporte y resistencia</h2>
			<LevelsRuler line={line} currencies={currencies} />
			<CurrencyVariants
				currencies={currencies}
				as="div"
				render={(currency) => (
					<ul className="prose-list">
						{describeLevels(line, currency).map((phrase, index) => (
							<li key={index}>
								<PhraseText phrase={phrase} />
							</li>
						))}
					</ul>
				)}
			/>
		</section>
	);
}

/**
 * The close between Support and Resistance. A level the close is beyond is no longer named, so the
 * ruler shows the levels that remain, and none when neither does.
 */
function LevelsRuler({ line, currencies }: LevelsSectionProps) {
	// One session's rate converts the close and both levels, so MEP-dollar positions hold in every view.
	const mepLevels = selectNamedLevels(line, 'usd');
	const close = line.latestClose.mep.close;
	const levelValues = [mepLevels.support, mepLevels.resistance].filter((value) => value !== null);

	if (levelValues.length === 0) {
		return null;
	}

	const domain = buildPaddedDomain([close, ...levelValues], RULER_PADDING_RATIO);
	const place = (value: number) => placeOnScale(value, domain);
	const formatViewPrice = (pick: (levels: NamedLevels) => number | null) => (
		<CurrencyVariants
			currencies={currencies}
			render={(currency) =>
				formatCurrencyPrice(pick(selectNamedLevels(line, currency))!, currency)
			}
		/>
	);

	const closeMark: RulerMark = {
		position: place(close),
		emphasis: 'close',
		above: <b>cierre</b>,
		below: (
			<CurrencyVariants
				currencies={currencies}
				render={(currency) =>
					formatCurrencyPrice(selectViewClose(line, currency), currency)
				}
			/>
		),
	};
	const levelMarks: readonly RulerMark[] = [
		...(mepLevels.support === null
			? []
			: [
					{
						position: place(mepLevels.support),
						emphasis: 'tick' as const,
						above: 'soporte',
						below: formatViewPrice((levels) => levels.support),
					},
				]),
		...(mepLevels.resistance === null
			? []
			: [
					{
						position: place(mepLevels.resistance),
						emphasis: 'tick' as const,
						above: 'resistencia',
						below: formatViewPrice((levels) => levels.resistance),
					},
				]),
	];
	const band =
		mepLevels.support !== null && mepLevels.resistance !== null
			? { from: place(mepLevels.support), to: place(mepLevels.resistance) }
			: undefined;

	return <Ruler marks={[...levelMarks, closeMark]} {...(band && { band })} />;
}
