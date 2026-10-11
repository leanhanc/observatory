import type { SnapshotEvent, SnapshotPriceUnit } from '#web/lib/utils/snapshot-pages/index.ts';

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const PRICE_UNIT_LABELS: Record<SnapshotPriceUnit, string> = {
	'mep-dollar': 'MEP dollars',
};

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

/** Shows a percentage State part, or "not evaluated" for `null`. */
export function formatEvaluatedPercent(value: number | null): string {
	if (value === null) {
		return 'not evaluated';
	}

	return `${formatNumber(value)}%`;
}

/** Labels a price or an ATR with the unit the snapshot declares for every price in it. */
export function formatPrice(value: number, priceUnit: SnapshotPriceUnit): string {
	return `${formatNumber(value)} ${PRICE_UNIT_LABELS[priceUnit]}`;
}

/** The snapshot has no median for a line that did not trade in the liquidity window. */
export function formatMedianTradedValue(valueUsd: number | null): string {
	if (valueUsd === null) {
		return 'no trades in the window';
	}

	return `${formatNumber(valueUsd)} USD`;
}

/** Describes an Event from its snapshot fields, without deriving any value from them. */
export function describeEvent(event: SnapshotEvent['event'], priceUnit: SnapshotPriceUnit): string {
	if (event.type === 'regime-transition') {
		const confirmingSessions = event.confirmingSessionDates.join(', ');
		return `${event.from} to ${event.to}, confirmed by ${confirmingSessions}.`;
	}

	if (event.type === 'structure-break') {
		const { kind, price, occurredAtSession, confirmedAtSession } = event.definingSwing;
		const closePrice = formatPrice(event.closePrice, priceUnit);
		const swingPrice = formatPrice(price, priceUnit);
		return `${event.direction} break, prior structure ${event.priorStructure}: close ${closePrice} against the swing ${kind} at ${swingPrice} (occurred ${occurredAtSession}, confirmed ${confirmedAtSession}).`;
	}

	const trueRange = formatPrice(event.trueRange, priceUnit);
	const baselineAtr = formatPrice(event.baselineAtr, priceUnit);
	const atrMultiple = formatNumber(event.atrMultiple);
	return `True Range ${trueRange} is ${atrMultiple} times the ATR ${baselineAtr} through ${event.baselineThroughSessionDate}.`;
}
