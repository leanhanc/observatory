import type { LineChartData } from '#web/lib/utils/line-chart-data/index.ts';

// The library loads when the chart is about one screen away, so a reader who stops at the header
// never downloads it; the data loads at once, so it is ready when the library is.
const APPROACH_MARGIN = '100% 0px';

/**
 * `<line-chart data-src="/lines/<id>/chart.json">`: fetches the line's candles on page load and
 * draws them once the chart nears the viewport. On any failure it keeps the box's note visible.
 */
class LineChartElement extends HTMLElement {
	// The chart starts once per element, so moving it in the page does not draw a second chart.
	private hasStarted = false;

	connectedCallback(): void {
		if (this.hasStarted) {
			return;
		}

		this.hasStarted = true;

		try {
			this.start();
		} catch {
			this.markFailed();
		}
	}

	private start(): void {
		const source = this.dataset.src;

		if (source === undefined) {
			this.markFailed();
			return;
		}

		const chartData = fetchChartData(source);
		// The draw awaits it later; until then a failed fetch must not surface as an unhandled rejection.
		chartData.catch(() => this.markFailed());
		const observer = new IntersectionObserver(
			(entries) => {
				const isApproaching = entries.some((entry) => entry.isIntersecting);

				if (!isApproaching) {
					return;
				}

				observer.disconnect();
				// A chart whose data already failed has nothing to draw, so the library is not fetched.
				if (this.hasFailed()) {
					return;
				}

				void this.draw(chartData);
			},
			{ rootMargin: APPROACH_MARGIN },
		);
		observer.observe(this);
	}

	private async draw(chartData: Promise<LineChartData>): Promise<void> {
		try {
			const [{ drawLineChart }, data] = await Promise.all([
				import('./line-chart-drawing.ts'),
				chartData,
			]);
			drawLineChart(this, data);
			this.dataset.state = 'ready';
		} catch {
			this.markFailed();
		}
	}

	private markFailed(): void {
		this.dataset.state = 'failed';
	}

	private hasFailed(): boolean {
		return this.dataset.state === 'failed';
	}
}

async function fetchChartData(source: string): Promise<LineChartData> {
	const response = await fetch(source);

	if (!response.ok) {
		throw new Error(`${source} answered ${response.status}.`);
	}

	return (await response.json()) as LineChartData;
}

customElements.define('line-chart', LineChartElement);
