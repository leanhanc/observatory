import type {
	AvailableLine,
	SnapshotEvent,
	SnapshotPriceUnit,
} from '#web/lib/utils/snapshot-pages/index.ts';

type SnapshotState = AvailableLine['latestState'];
type PesoEquivalents = AvailableLine['pesoEquivalents'];
type SnapshotSwingHigh = NonNullable<SnapshotState['lastConfirmedSwingHigh']>;
type SnapshotSwingLow = NonNullable<SnapshotState['lastConfirmedSwingLow']>;
type SnapshotTippingCloses = NonNullable<SnapshotState['regimeTippingCloses']>;
type SnapshotPesoTippingCloses = NonNullable<PesoEquivalents['regimeTippingCloses']>;
type SnapshotPeriodReturn = AvailableLine['periodReturns'][number];
type SnapshotSituation = SnapshotState['situations'][number];

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const PRICE_UNIT_LABELS: Record<SnapshotPriceUnit, string> = {
	'mep-dollar': 'MEP dollars',
};

const LOW_ROLE_LABELS: Record<SnapshotSwingLow['closePosition'], string> = {
	'at-or-above': 'Support',
	below: 'not Support: the close is below it',
};

const HIGH_ROLE_LABELS: Record<SnapshotSwingHigh['closePosition'], string> = {
	'at-or-below': 'Resistance',
	above: 'not Resistance: the close is above it',
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

/** Shows whether the last confirmed swing low is Support, as the analysis classified it. */
export function formatSupport(swing: SnapshotState['lastConfirmedSwingLow']): string {
	if (swing === null) {
		return 'none confirmed yet';
	}

	return LOW_ROLE_LABELS[swing.closePosition];
}

/** Shows whether the last confirmed swing high is Resistance, as the analysis classified it. */
export function formatResistance(swing: SnapshotState['lastConfirmedSwingHigh']): string {
	if (swing === null) {
		return 'none confirmed yet';
	}

	return HIGH_ROLE_LABELS[swing.closePosition];
}

/**
 * Shows the close Regime's price condition needs on one side, with its peso equivalent right after
 * it, and whether EMA50 already meets the other condition. The close is a condition of
 * Observatory's rule as of the State's session.
 */
export function formatTippingClose(
	side: 'bullish' | 'bearish',
	tippingCloses: SnapshotTippingCloses,
	pesoEquivalents: PesoEquivalents & { regimeTippingCloses: SnapshotPesoTippingCloses },
	priceUnit: SnapshotPriceUnit,
): string {
	const pesoTippingCloses = pesoEquivalents.regimeTippingCloses;

	if (side === 'bullish') {
		const { closeAbove, isFastEmaAligned } = tippingCloses.bullish;
		const pesoClose = formatPesoEquivalent(
			pesoTippingCloses.bullishCloseAbove,
			pesoEquivalents,
		);
		const averageCondition = isFastEmaAligned ? 'already above' : 'not above';
		return `a close above ${formatPrice(closeAbove, priceUnit)} (${pesoClose}); EMA50 is ${averageCondition} EMA200`;
	}

	const { closeBelow, isFastEmaAligned } = tippingCloses.bearish;
	const pesoClose = formatPesoEquivalent(pesoTippingCloses.bearishCloseBelow, pesoEquivalents);
	const averageCondition = isFastEmaAligned ? 'already below' : 'not below';
	return `a close below ${formatPrice(closeBelow, priceUnit)} (${pesoClose}); EMA50 is ${averageCondition} EMA200`;
}

/** Shows a period return with its window and start session, or "not evaluated" for `null`. */
export function formatPeriodReturn(periodReturn: SnapshotPeriodReturn): string {
	const window = `${periodReturn.windowMarketSessions} Market Sessions`;

	if (periodReturn.fromSessionDate === null || periodReturn.percentChange === null) {
		return `${window}: not evaluated`;
	}

	const change = formatEvaluatedPercent(periodReturn.percentChange);
	return `${window}: ${change} since the close of ${periodReturn.fromSessionDate}`;
}

/**
 * Shows an active Situation by its type, its start session, the level the close is beyond and the
 * close's distance from it, which the State already carries for that level.
 */
export function formatSituation(
	situation: SnapshotSituation,
	latestState: SnapshotState,
	priceUnit: SnapshotPriceUnit,
): string {
	const { type, activeSinceSession, level } = situation;
	const stateLevel =
		level.kind === 'low'
			? latestState.lastConfirmedSwingLow
			: latestState.lastConfirmedSwingHigh;
	const price = formatPrice(level.price, priceUnit);
	const distance = formatEvaluatedPercent(stateLevel?.priceRelativeToSwingInPercent ?? null);
	return `${type}, since ${activeSinceSession}: close ${distance} from the swing ${level.kind} at ${price} (occurred ${level.occurredAtSession}, confirmed ${level.confirmedAtSession})`;
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

	return formatPesoEquivalent(value, pesoEquivalents);
}

/**
 * Shows a MEP-dollar value's peso equivalent with the session and MEP Rate it was converted at,
 * since it has another peso equivalent at every other rate.
 */
export function formatPesoEquivalent(
	value: number,
	pesoEquivalents: Pick<PesoEquivalents, 'sessionDate' | 'mepRate'>,
): string {
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
