import { CandlestickSeries, CrosshairMode, LineStyle, createChart } from 'lightweight-charts';

import type { LineChartData, LineChartView } from '#web/lib/utils/line-chart-data/index.ts';
import type { DisplayCurrency } from '#web/lib/utils/line-wording/index.ts';
import type { CandlestickData, IChartApi, IPriceLine, ISeriesApi } from 'lightweight-charts';

type CandleSeries = ISeriesApi<'Candlestick'>;

/** The theme colors the chart draws with, resolved from the page's CSS tokens. */
export type ChartColors = Readonly<{
	background: string;
	foreground: string;
	muted: string;
	line: string;
	accent: string;
	up: string;
	down: string;
}>;

const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)';
const CURRENCY_INPUT_SELECTOR = 'input[name="currency"]';
const RANGE_INPUT_SELECTOR = 'input[name="chart-range"]';

/**
 * Draws the line's candles and its support and resistance in the checked currency view, and keeps
 * them in step with the page: the currency radios, the range radios and the color scheme.
 */
export function drawLineChart(element: HTMLElement, data: LineChartData): void {
	const box = element.querySelector<HTMLElement>('.chart-box');

	if (box === null) {
		throw new Error('The chart has no box to draw in.');
	}

	const chart = createChart(box, buildChartOptions(readDataFontFamily()));
	const series = chart.addSeries(CandlestickSeries, {
		priceLineVisible: false,
		lastValueVisible: true,
	});
	let levelLines: readonly IPriceLine[] = [];
	let lastSessionDate: string | undefined;

	const showCheckedView = () => {
		const view = selectView(data, readCheckedCurrency(data));
		levelLines = showView(series, levelLines, view);
		lastSessionDate = view.candles.at(-1)?.sessionDate;
		applyColors(chart, series, levelLines, readChartColors());
		applyRange(chart, lastSessionDate, readCheckedRange(element));
	};

	showCheckedView();
	listenForChanges(document, CURRENCY_INPUT_SELECTOR, showCheckedView);
	listenForChanges(element, RANGE_INPUT_SELECTOR, () =>
		applyRange(chart, lastSessionDate, readCheckedRange(element)),
	);
	matchMedia(LIGHT_SCHEME_QUERY).addEventListener('change', () =>
		applyColors(chart, series, levelLines, readChartColors()),
	);
}

/**
 * The chart's fixed options. It shows no crosshair or tooltip, the mouse wheel neither zooms nor
 * scrolls it so the page scrolls past it, and a vertical swipe on a phone scrolls the page too.
 * Pinch and axis drag still change the range. The attribution logo is off because the page shows
 * the attribution line the license asks for under the chart.
 */
export function buildChartOptions(fontFamily: string) {
	return {
		autoSize: true,
		layout: {
			background: { color: 'transparent' },
			fontFamily,
			fontSize: 11,
			attributionLogo: false,
		},
		grid: { vertLines: { visible: false }, horzLines: { visible: true } },
		crosshair: {
			mode: CrosshairMode.Hidden,
			vertLine: { visible: false, labelVisible: false },
			horzLine: { visible: false, labelVisible: false },
		},
		rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
		timeScale: { borderVisible: false, rightOffset: 4, fixLeftEdge: true },
		handleScroll: { mouseWheel: false, vertTouchDrag: false },
		handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
		localization: { locale: 'es-AR' },
	} as const;
}

/**
 * The series colors: up candles hollow, with only their border and wick in the gain color, and
 * down candles filled in the loss color. Green and red mark only candles; the levels use accent.
 */
export function buildSeriesColors(colors: ChartColors) {
	return {
		upColor: colors.background,
		borderUpColor: colors.up,
		wickUpColor: colors.up,
		downColor: colors.down,
		borderDownColor: colors.down,
		wickDownColor: colors.down,
	};
}

export function buildLevelLineColors(colors: ChartColors) {
	return {
		color: colors.accent,
		axisLabelColor: colors.accent,
		axisLabelTextColor: colors.background,
	};
}

function showView(
	series: CandleSeries,
	previousLines: readonly IPriceLine[],
	view: SelectedView,
): readonly IPriceLine[] {
	series.applyOptions({ priceFormat: buildPriceFormat(view.currency, view) });
	series.setData(view.candles.map(toCandlestickData));
	previousLines.forEach((line) => series.removePriceLine(line));

	const levels = [
		{ price: view.support, title: 'Soporte' },
		{ price: view.resistance, title: 'Resistencia' },
	];
	return levels.flatMap(({ price, title }) => {
		if (price === null) {
			return [];
		}

		return [
			series.createPriceLine({
				price,
				title,
				lineWidth: 1,
				lineStyle: LineStyle.Dashed,
				axisLabelVisible: true,
			}),
		];
	});
}

type SelectedView = LineChartView & Readonly<{ currency: DisplayCurrency }>;

function selectView(data: LineChartData, currency: DisplayCurrency): SelectedView {
	const view = data.currencyViews[currency];

	if (view === undefined) {
		throw new Error(`The chart has no ${currency} view.`);
	}

	return { ...view, currency };
}

/** The checked currency radio's view, or the only view on a page without a currency control. */
function readCheckedCurrency(data: LineChartData): DisplayCurrency {
	const checkedInput = document.querySelector<HTMLInputElement>(
		`${CURRENCY_INPUT_SELECTOR}:checked`,
	);
	const [onlyCurrency] = Object.keys(data.currencyViews) as DisplayCurrency[];
	const currency = (checkedInput?.value as DisplayCurrency | undefined) ?? onlyCurrency;

	if (currency === undefined) {
		throw new Error('The chart has no currency view.');
	}

	return currency;
}

/**
 * The page's figure face as the stylesheet resolves it. The Fonts API registers Geist Mono under a
 * generated family name, so the chart reads the token instead of naming the font itself.
 */
function readDataFontFamily(): string {
	const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--font-data');
	return fontFamily.trim() || 'monospace';
}

function readCheckedRange(element: HTMLElement): string {
	return (
		element.querySelector<HTMLInputElement>(`${RANGE_INPUT_SELECTOR}:checked`)?.value ?? 'all'
	);
}

/**
 * Shows the last `range` calendar months up to the last candle, or every candle for `all`. A start
 * day the target month lacks becomes that month's last day, as the analysis counts months.
 */
function applyRange(chart: IChartApi, lastSessionDate: string | undefined, range: string): void {
	if (range === 'all' || lastSessionDate === undefined) {
		chart.timeScale().fitContent();
		return;
	}

	const from = subtractCalendarMonths(lastSessionDate, Number(range));
	chart.timeScale().setVisibleRange({ from, to: lastSessionDate });
}

export function subtractCalendarMonths(sessionDate: string, months: number): string {
	const [year, month, day] = sessionDate.split('-').map(Number) as [number, number, number];
	const targetMonthIndex = month - 1 - months;
	const lastDayOfTarget = new Date(Date.UTC(year, targetMonthIndex + 1, 0)).getUTCDate();
	const target = new Date(Date.UTC(year, targetMonthIndex, Math.min(day, lastDayOfTarget)));
	return target.toISOString().slice(0, 10);
}

function applyColors(
	chart: IChartApi,
	series: CandleSeries,
	levelLines: readonly IPriceLine[],
	colors: ChartColors,
): void {
	chart.applyOptions({
		layout: { textColor: colors.muted },
		grid: { horzLines: { color: colors.line } },
	});
	series.applyOptions(buildSeriesColors(colors));
	levelLines.forEach((line) => line.applyOptions(buildLevelLineColors(colors)));
}

/**
 * Resolves each token to `rgb()` through a 1×1 canvas: the chart takes colors, not CSS variables,
 * and does not parse every syntax the tokens use, such as `oklch()`.
 */
function readChartColors(): ChartColors {
	const style = getComputedStyle(document.documentElement);
	const canvasContext = document.createElement('canvas').getContext('2d', {
		willReadFrequently: true,
	});
	const resolve = (token: string) =>
		resolveColor(canvasContext, style.getPropertyValue(token).trim());

	return {
		background: resolve('--bg'),
		foreground: resolve('--fg'),
		muted: resolve('--muted'),
		line: resolve('--line'),
		accent: resolve('--accent'),
		up: resolve('--up'),
		down: resolve('--down'),
	};
}

function resolveColor(canvasContext: CanvasRenderingContext2D | null, color: string): string {
	if (canvasContext === null) {
		return color;
	}

	canvasContext.clearRect(0, 0, 1, 1);
	canvasContext.fillStyle = color;
	canvasContext.fillRect(0, 0, 1, 1);
	const [red, green, blue] = canvasContext.getImageData(0, 0, 1, 1).data;
	return `rgb(${red}, ${green}, ${blue})`;
}

// Axis labels print like the page's figures: whole pesos from a thousand up, and dollars with two
// decimals from one dollar up and three significant digits below.
function buildPriceFormat(currency: DisplayCurrency, view: LineChartView) {
	const lastClose = view.candles.at(-1)?.close ?? 0;
	const isWholePesos = currency === 'ars' && lastClose >= 1000;
	const isCheapDollar = currency !== 'ars' && lastClose < 1;
	const format = new Intl.NumberFormat(
		'es-AR',
		buildNumberFormatOptions(isWholePesos, isCheapDollar),
	);

	return {
		type: 'custom' as const,
		formatter: (price: number) => format.format(price).replace('-', '−'),
		minMove: isWholePesos ? 1 : 0.0001,
	};
}

function buildNumberFormatOptions(
	isWholePesos: boolean,
	isCheapDollar: boolean,
): Intl.NumberFormatOptions {
	if (isWholePesos) {
		return { maximumFractionDigits: 0 };
	}

	if (isCheapDollar) {
		return { maximumSignificantDigits: 3 };
	}

	return { minimumFractionDigits: 2, maximumFractionDigits: 2 };
}

function toCandlestickData(candle: LineChartView['candles'][number]): CandlestickData<string> {
	return {
		time: candle.sessionDate,
		open: candle.open,
		high: candle.high,
		low: candle.low,
		close: candle.close,
	};
}

function listenForChanges(root: ParentNode, selector: string, onChange: () => void): void {
	root.querySelectorAll<HTMLInputElement>(selector).forEach((input) =>
		input.addEventListener('change', onChange),
	);
}
