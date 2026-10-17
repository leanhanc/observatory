/**
 * Where published values sit on a drawn scale, in percent of its width. These functions place
 * values and never produce a figure the page prints: every printed number is a snapshot field.
 */

/** The values a scale spans, from its left end to its right end. */
export type ScaleDomain = Readonly<{ min: number; max: number }>;

/** One period return's bar: where zero sits and how far the bar reaches from it, in percent. */
export type ReturnBar = Readonly<{ zeroPosition: number; width: number }>;

/**
 * The span of `values`, widened on each side by `paddingRatio` of it so marks at the ends keep room
 * for their tags. A single value gets a span of its own size around it, so it lands in the middle.
 */
export function buildPaddedDomain(values: readonly number[], paddingRatio: number): ScaleDomain {
	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = max - min;
	const padding = span === 0 ? Math.abs(min) * paddingRatio || 1 : span * paddingRatio;

	return { min: min - padding, max: max + padding };
}

/** The value's position on the domain, in percent, clamped to the scale's ends. */
export function placeOnScale(value: number, domain: ScaleDomain): number {
	const span = domain.max - domain.min;

	if (span === 0) {
		return 50;
	}

	const position = ((value - domain.min) / span) * 100;
	return clampPercent(position);
}

/**
 * Bars for a set of percent changes on one shared scale, so the longest bar fills the track and
 * zero sits where the falls and rises meet. A `null` change has no bar. `null` for every bar when
 * no change is readable or all are zero, since there is nothing to scale.
 */
export function placeReturnBars(
	percentChanges: readonly (number | null)[],
): readonly (ReturnBar | null)[] {
	const readableChanges = percentChanges.filter((change) => change !== null);
	const lowest = Math.min(0, ...readableChanges);
	const highest = Math.max(0, ...readableChanges);
	const span = highest - lowest;

	if (span === 0) {
		return percentChanges.map(() => null);
	}

	const zeroPosition = ((0 - lowest) / span) * 100;
	return percentChanges.map((change) => {
		if (change === null) {
			return null;
		}

		return { zeroPosition, width: (Math.abs(change) / span) * 100 };
	});
}

function clampPercent(position: number): number {
	return Math.min(100, Math.max(0, position));
}
