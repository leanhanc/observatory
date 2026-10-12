import type {
	AvailableLine,
	SnapshotEvent,
	SnapshotPriceUnit,
} from '#web/lib/utils/snapshot-pages/index.ts';

type SnapshotState = AvailableLine['latestState'];
type PesoEquivalents = AvailableLine['pesoEquivalents'];

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

/**
 * Shows a Regime candidate still gathering confirmations. `null` means there is no candidate, which
 * is a reading, not a gap.
 */
export function formatPendingRegimeTransition(
	pending: SnapshotState['pendingRegimeTransition'],
): string {
	if (pending === null) {
		return 'none';
	}

	const { candidate, confirmations, requiredConfirmations } = pending;
	return `${candidate}, ${confirmations} of ${requiredConfirmations} confirmations`;
}

/** Shows a last confirmed swing level and the close's distance from it. */
export function formatSwingLevel(
	swing: SnapshotState['lastConfirmedSwingHigh'] | SnapshotState['lastConfirmedSwingLow'],
	priceUnit: SnapshotPriceUnit,
): string {
	if (swing === null) {
		return 'none confirmed yet';
	}

	const price = formatPrice(swing.price, priceUnit);
	const level = `${price} (occurred ${swing.occurredAtSession}, confirmed ${swing.confirmedAtSession})`;

	if (swing.priceRelativeToSwingInPercent === null) {
		return `${level}, distance from the close not evaluated`;
	}

	const distance = formatEvaluatedPercent(swing.priceRelativeToSwingInPercent);
	return `${level}, close ${distance} from it`;
}

/** Labels a peso amount from the snapshot's peso equivalents, which name their own unit. */
export function formatPesos(value: number): string {
	return `${formatNumber(value)} pesos`;
}

/**
 * Shows a swing level's peso equivalent with the session and MEP Rate it was converted at, since
 * the same level has another peso equivalent at every other rate.
 */
export function formatPesoSwingLevel(
	value: number | null,
	pesoEquivalents: Pick<PesoEquivalents, 'sessionDate' | 'mepRate'>,
): string {
	if (value === null) {
		return 'none confirmed yet';
	}

	const { sessionDate, mepRate } = pesoEquivalents;
	return `≈ ${formatPesos(value)}, its equivalent at the ${sessionDate} MEP rate of ${formatNumber(mepRate)} pesos per MEP dollar`;
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
