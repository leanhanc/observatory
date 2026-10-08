import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { LargeOneSessionMove } from './large-move.types.ts';

const { minimumCloseRatio } = ANALYSIS_CONFIGURATION.largeMove;

/**
 * Flags each session whose close moved, up or down, by at least the configured factor from the
 * previous input bar's close: a move large enough to be a split or a CEDEAR ratio change. The flag
 * describes the move's size, not its cause. Each flag reads only that session and the previous bar,
 * whatever the calendar gap between them. Expects validated completed Daily Bars ordered oldest to
 * newest.
 */
export function detectLargeOneSessionMoves(
	bars: readonly DailyBar[],
): readonly LargeOneSessionMove[] {
	return bars.flatMap((bar, index) => {
		const previousBar = bars[index - 1];

		if (!previousBar) {
			return [];
		}

		// The larger close over the smaller is exp(|ln(close_i / close_{i−1})|), compared without
		// logarithms so that an exact threshold ratio is flagged in both directions.
		const largerOverSmallerClose =
			Math.max(bar.close, previousBar.close) / Math.min(bar.close, previousBar.close);
		const isLargeMove = largerOverSmallerClose >= minimumCloseRatio;

		if (!isLargeMove) {
			return [];
		}

		return [{ sessionDate: bar.sessionDate, closeRatio: bar.close / previousBar.close }];
	});
}
