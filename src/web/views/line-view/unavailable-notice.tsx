import { PhraseText } from '#web/components/phrase-text.tsx';
import { formatPercent, formatWholeNumber } from '#web/lib/utils/es-ar-formatting/index.ts';
import { describeUnavailableLine } from '#web/lib/utils/line-wording/index.ts';

import type { UnavailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

/** Why the line was not analyzed, with its liquidity measures when that was the reason. */
export function UnavailableNotice({ line }: { line: UnavailableLine }) {
	return (
		<section className="line-section">
			<p>
				<PhraseText phrase={describeUnavailableLine(line)} />
			</p>
			{line.reason === 'insufficient-liquidity' && (
				<details>
					<summary>Más detalle</summary>
					<LiquidityDetail liquidity={line.liquidity} />
				</details>
			)}
		</section>
	);
}

type Liquidity = Extract<UnavailableLine, { reason: 'insufficient-liquidity' }>['liquidity'];

function LiquidityDetail({ liquidity }: { liquidity: Liquidity }) {
	const { participation, medianDailyTradedValueUsd } = liquidity;
	const medianText =
		medianDailyTradedValueUsd === null
			? 'sin operaciones en el período'
			: `${formatWholeNumber(medianDailyTradedValueUsd)} USD`;

	return (
		<ul>
			<li>Ruedas con operaciones: {formatPercent(participation * 100)}</li>
			<li>Monto operado diario (mediana): {medianText}</li>
		</ul>
	);
}
