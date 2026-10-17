import { selectNamedLevels } from '#web/lib/utils/line-wording/index.ts';

import type { DisplayCurrency } from '#web/lib/utils/line-wording/index.ts';
import type { AvailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

type ChartLine = Pick<
	AvailableLine,
	'latestState' | 'pesoEquivalents' | 'cclEquivalents' | 'chartSeries'
>;
type ChartCandles = AvailableLine['chartSeries']['peso'];

/** One currency view of the chart: its candles and the levels the page's text names. */
export type LineChartView = Readonly<{
	candles: ChartCandles;
	support: number | null;
	resistance: number | null;
}>;

/** The content of a line's `chart.json`, keyed by the currency views its page offers. */
export type LineChartData = Readonly<{
	currencyViews: Partial<Record<DisplayCurrency, LineChartView>>;
}>;

const CHART_SERIES_BY_CURRENCY: Record<DisplayCurrency, keyof AvailableLine['chartSeries']> = {
	ars: 'peso',
	usd: 'mep',
	ccl: 'ccl',
};

/**
 * Picks, for each currency view the page offers, the analysis's candles in that currency and the
 * support and resistance its "Soporte y resistencia" text names. It converts nothing, so the chart
 * and the text draw on the same published prices.
 */
export function buildLineChartData(
	line: ChartLine,
	currencies: readonly DisplayCurrency[],
): LineChartData {
	const currencyViews = Object.fromEntries(
		currencies.map((currency) => [currency, buildChartView(line, currency)]),
	);

	return { currencyViews };
}

function buildChartView(line: ChartLine, currency: DisplayCurrency): LineChartView {
	const candles = line.chartSeries[CHART_SERIES_BY_CURRENCY[currency]];
	const { support, resistance } = selectNamedLevels(line, currency);
	return { candles, support, resistance };
}
