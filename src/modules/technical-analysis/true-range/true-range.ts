import type { DailyBar } from '#modules/bar-history/index.ts';

/**
 * Calculates each bar's range including movement from the previous close.
 *
 * The first bar has no previous close, so its value is `high - low`.
 */
export function calculateTrueRange(bars: readonly DailyBar[]): readonly number[] {
	return bars.map((bar, index) => {
		if (index === 0) {
			return bar.high - bar.low;
		}

		const previousBar = bars[index - 1]!;
		const range = bar.high - bar.low;
		const highGap = Math.abs(bar.high - previousBar.close);
		const lowGap = Math.abs(bar.low - previousBar.close);

		return Math.max(range, highGap, lowGap);
	});
}
