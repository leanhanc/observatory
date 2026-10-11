import type { SnapshotEvent } from '#web/lib/utils/snapshot-pages/index.ts';

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function formatNumber(value: number): string {
	return numberFormat.format(value);
}

/** Shows a State part, or "not evaluated" for `null`, which is never a value to show as one. */
export function formatEvaluatedValue(value: string | number | null): string {
	if (value === null) {
		return 'not evaluated';
	}

	if (typeof value === 'number') {
		return formatNumber(value);
	}

	return value;
}

/** The snapshot has no median for a line that did not trade in the liquidity window. */
export function formatMedianTradedValue(valueUsd: number | null): string {
	if (valueUsd === null) {
		return 'no trades in the window';
	}

	return `${formatNumber(valueUsd)} USD`;
}

/** Describes an Event from its snapshot fields, without deriving any value from them. */
export function describeEvent(event: SnapshotEvent['event']): string {
	if (event.type === 'regime-transition') {
		const confirmingSessions = event.confirmingSessionDates.join(', ');
		return `${event.from} to ${event.to}, confirmed by ${confirmingSessions}.`;
	}

	if (event.type === 'structure-break') {
		const { kind, price, occurredAtSession, confirmedAtSession } = event.definingSwing;
		const closePrice = formatNumber(event.closePrice);
		const swingPrice = formatNumber(price);
		return `${event.direction} break, prior structure ${event.priorStructure}: close ${closePrice} against the swing ${kind} at ${swingPrice} (occurred ${occurredAtSession}, confirmed ${confirmedAtSession}).`;
	}

	const trueRange = formatNumber(event.trueRange);
	const baselineAtr = formatNumber(event.baselineAtr);
	const expansionMultiple = formatNumber(event.expansionMultiple);
	return `True Range ${trueRange} is ${expansionMultiple} times the ATR ${baselineAtr} through ${event.baselineThroughSessionDate}.`;
}
