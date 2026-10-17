import latestSnapshot from 'virtual:observatory/latest-snapshot';

import { buildLineChartData } from '#web/lib/utils/line-chart-data/index.ts';
import { describeLineIdentity } from '#web/lib/utils/line-identity/index.ts';
import { selectDisplayCurrencies } from '#web/lib/utils/line-wording/index.ts';
import { buildLineChartPages } from '#web/lib/utils/snapshot-pages/index.ts';

import type { LineChartPage } from '#web/lib/utils/snapshot-pages/index.ts';
import type { APIRoute } from 'astro';

export function getStaticPaths() {
	return buildLineChartPages(latestSnapshot);
}

/** The line's candles and levels in each currency view its page offers, for the chart island. */
export const GET: APIRoute = ({ props }) => {
	const { line } = props as LineChartPage['props'];
	const { isPesoLine } = describeLineIdentity(line);
	const currencies = selectDisplayCurrencies(line, isPesoLine);
	const chartData = buildLineChartData(line, currencies);

	return new Response(JSON.stringify(chartData), {
		headers: { 'Content-Type': 'application/json' },
	});
};
