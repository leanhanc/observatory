import { CurrencyControl } from '#web/components/currency-control.tsx';
import { CurrencyVariants } from '#web/components/currency-variants.tsx';
import { LineChart } from '#web/components/line-chart.tsx';
import { CURRENCY_NOTES } from '#web/lib/utils/line-wording/index.ts';
import { buildLineChartPath } from '#web/lib/utils/snapshot-pages/index.ts';

import type { DisplayCurrency } from '#web/lib/utils/line-wording/index.ts';
import type { AvailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

type PriceSectionProps = Readonly<{
	ticker: string;
	line: AvailableLine;
	currencies: readonly DisplayCurrency[];
}>;

/** The currency control and its note, then the chart, which follows the same control. */
export function PriceSection({ ticker, line, currencies }: PriceSectionProps) {
	const hasCurrencyNote = currencies.length > 1;

	return (
		<section className="price-section">
			<LineChart
				ticker={ticker}
				chartDataPath={buildLineChartPath(line.tradingLineId)}
				currencyControl={<CurrencyControl currencies={currencies} />}
				currencyNote={
					hasCurrencyNote ? (
						<p className="currency-note">
							<CurrencyVariants
								currencies={currencies}
								render={(currency) => CURRENCY_NOTES[currency]}
							/>
						</p>
					) : null
				}
			/>
		</section>
	);
}
