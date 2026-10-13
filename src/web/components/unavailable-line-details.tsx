import { formatPercent, formatWholeNumber } from '#web/lib/utils/es-ar-formatting/index.ts';
import { describeUnavailableLine } from '#web/lib/utils/line-wording/index.ts';

import { PhraseText } from './phrase-text.tsx';

import type { UnavailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

export function UnavailableLineDetails({ line }: { line: UnavailableLine }) {
	return (
		<section>
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
