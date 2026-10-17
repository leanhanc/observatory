import { describe, expect, test } from 'bun:test';

import {
	buildChartOptions,
	buildLevelLineColors,
	buildSeriesColors,
	subtractCalendarMonths,
} from './line-chart-drawing.ts';

const colors = {
	background: 'rgb(24, 23, 22)',
	foreground: 'rgb(236, 233, 227)',
	muted: 'rgb(155, 150, 142)',
	line: 'rgb(48, 46, 43)',
	accent: 'rgb(217, 183, 102)',
	up: 'rgb(144, 200, 140)',
	down: 'rgb(232, 140, 130)',
};

describe('buildChartOptions', () => {
	// The page scrolls past the chart: a wheel that zoomed it would trap the reader.
	test('the mouse wheel neither zooms nor scrolls, and a vertical swipe scrolls the page', () => {
		const { handleScale, handleScroll } = buildChartOptions('monospace');

		expect(handleScale.mouseWheel).toBe(false);
		expect(handleScroll.mouseWheel).toBe(false);
		expect(handleScroll.vertTouchDrag).toBe(false);
		expect(handleScale.pinch).toBe(true);
		expect(handleScale.axisPressedMouseMove).toBe(true);
	});

	test('draws its labels in the face it is given, the page’s figure font', () => {
		expect(buildChartOptions('"Geist Mono-08c5", monospace').layout.fontFamily).toBe(
			'"Geist Mono-08c5", monospace',
		);
	});

	test('shows no crosshair and no attribution logo, which the credit line replaces', () => {
		const { crosshair, layout } = buildChartOptions('monospace');

		expect(crosshair.vertLine.visible).toBe(false);
		expect(crosshair.horzLine.visible).toBe(false);
		expect(crosshair.vertLine.labelVisible).toBe(false);
		expect(layout.attributionLogo).toBe(false);
	});
});

describe('the chart colors', () => {
	test('up candles are hollow with a gain border, down candles filled in the loss color', () => {
		expect(buildSeriesColors(colors)).toEqual({
			upColor: colors.background,
			borderUpColor: colors.up,
			wickUpColor: colors.up,
			downColor: colors.down,
			borderDownColor: colors.down,
			wickDownColor: colors.down,
		});
	});

	test('support and resistance use the accent, never the gain or loss color', () => {
		const levelColors = Object.values(buildLevelLineColors(colors));

		expect(levelColors).not.toContain(colors.up);
		expect(levelColors).not.toContain(colors.down);
		expect(buildLevelLineColors(colors).color).toBe(colors.accent);
	});
});

describe('subtractCalendarMonths', () => {
	test('counts calendar months back, as the analysis does', () => {
		expect(subtractCalendarMonths('2026-10-13', 12)).toBe('2025-10-13');
		expect(subtractCalendarMonths('2026-10-13', 1)).toBe('2026-09-13');
	});

	test('a day the target month lacks becomes its last day', () => {
		expect(subtractCalendarMonths('2026-03-31', 1)).toBe('2026-02-28');
		expect(subtractCalendarMonths('2024-03-31', 1)).toBe('2024-02-29');
	});
});
