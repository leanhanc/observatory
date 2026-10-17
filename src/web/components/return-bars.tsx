import { placeReturnBars } from '#web/lib/utils/visual-scale/index.ts';

import type { ReturnFigure } from '#web/lib/utils/line-wording/index.ts';
import type { CSSProperties } from 'react';

/**
 * The period returns as filled bars around one zero: a rise reaches right and a fall left, so
 * the direction from zero and the printed sign carry the reading without the color.
 */
export function ReturnBars({ figures }: { figures: readonly ReturnFigure[] }) {
	const bars = placeReturnBars(figures.map((figure) => figure.percentChange));

	return (
		<div className="return-bars" aria-hidden="true">
			{figures.map((figure, index) => {
				const bar = bars[index] ?? null;
				const zeroStyle = { '--zero': `${bar?.zeroPosition ?? 50}%` } as CSSProperties;
				const barStyle = { '--width': `${bar?.width ?? 0}%` } as CSSProperties;

				return (
					<div key={figure.windowMonths} className="return-bar-row">
						<span className="return-bar-label">{figure.label}</span>
						<div className="return-bar-track" style={zeroStyle}>
							{bar && figure.direction !== null && (
								<span
									className="return-bar"
									data-direction={figure.direction}
									style={barStyle}
								/>
							)}
						</div>
						<span
							className="return-bar-value figure"
							data-direction={figure.direction ?? undefined}
						>
							{figure.percentText ?? '—'}
						</span>
					</div>
				);
			})}
		</div>
	);
}
