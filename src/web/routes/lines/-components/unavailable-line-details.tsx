import { formatMedianTradedValue, formatNumber } from '../-utils/line-formatting.ts';

import type { UnavailableLine } from '#web/lib/utils/snapshot-pages.types.ts';

export function UnavailableLineDetails({ line }: { line: UnavailableLine }) {
	return (
		<>
			<p>Reason: {line.reason}</p>
			<p>{line.message}</p>
			{line.reason === 'insufficient-liquidity' && (
				<ul>
					<li>Participation: {formatNumber(line.liquidity.participation)}</li>
					<li>
						Median daily traded value:{' '}
						{formatMedianTradedValue(line.liquidity.medianDailyTradedValueUsd)}
					</li>
				</ul>
			)}
		</>
	);
}
