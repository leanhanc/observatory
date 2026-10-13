import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';
import { compareBeyondRoundingNoise } from '#modules/technical-analysis/index.ts';

import type { InstrumentState, Situation } from './instrument-state.types.ts';

type StateParts = Omit<InstrumentState, 'situations'>;

// Omits fields from each Situation type separately, so each type keeps its own level.
type SituationWithout<Keys extends keyof Situation> = Situation extends infer Each
	? Each extends Situation
		? Omit<Each, Keys>
		: never
	: never;

/** A Situation whose run is known, before its session's noise band is measured. */
export type TrackedSituation = SituationWithout<'isBeyondNoiseBand'>;

type RecognizedSituation = SituationWithout<'activeSinceSession' | 'isBeyondNoiseBand'>;

const { noiseBandAtrMultiplier } = ANALYSIS_CONFIGURATION.situations;

/**
 * Lists the Situations active at each session, in input order. Each Situation is a conjunction of
 * the session's own State parts; only `activeSinceSession` reads earlier sessions, by continuing
 * the run of the previous session when it held the same Situation on the same swing.
 *
 * Each Situation reads the latest confirmed swing of its kind, never an older one. A newer swing
 * cannot confirm while the close is beyond it, because the confirming bar's own low (or high) is
 * on the far side of the new swing, so a newer confirmed swing always ends the Situation. A run
 * still restarts if its swing changes, so its start never belongs to another level.
 */
export function trackSituations(
	states: readonly StateParts[],
): readonly (readonly TrackedSituation[])[] {
	let previousSituations: readonly TrackedSituation[] = [];

	return states.map((state) => {
		const situations = recognizeSituations(state).map((situation): TrackedSituation => ({
			...situation,
			activeSinceSession:
				findContinuedRunStart(previousSituations, situation) ?? state.sessionDate,
		}));
		previousSituations = situations;

		return situations;
	});
}

function recognizeSituations(state: StateParts): readonly RecognizedSituation[] {
	const { regime, lastConfirmedSwingLow, lastConfirmedSwingHigh } = state;
	const situations: RecognizedSituation[] = [];
	const isBelowLowInBearishRegime =
		regime === 'bearish' && lastConfirmedSwingLow?.closePosition === 'below';
	const isAboveHighInBullishRegime =
		regime === 'bullish' && lastConfirmedSwingHigh?.closePosition === 'above';

	if (isBelowLowInBearishRegime) {
		const { kind, price, occurredAtSession, confirmedAtSession } = lastConfirmedSwingLow;
		situations.push({
			type: 'below-last-confirmed-low-in-bearish-regime',
			level: { kind, price, occurredAtSession, confirmedAtSession },
		});
	}

	if (isAboveHighInBullishRegime) {
		const { kind, price, occurredAtSession, confirmedAtSession } = lastConfirmedSwingHigh;
		situations.push({
			type: 'above-last-confirmed-high-in-bullish-regime',
			level: { kind, price, occurredAtSession, confirmedAtSession },
		});
	}

	return situations;
}

function findContinuedRunStart(
	previousSituations: readonly TrackedSituation[],
	situation: RecognizedSituation,
): string | null {
	const previous = previousSituations.find(({ type }) => type === situation.type);
	const isSameSwing = previous?.level.confirmedAtSession === situation.level.confirmedAtSession;

	if (previous === undefined || !isSameSwing) {
		return null;
	}

	return previous.activeSinceSession;
}

/**
 * Whether the session's close is past the Situation's level by more than the noise band: half its
 * ATR(14), the margin Regime treats as noise around EMA200. A close exactly at the band's edge is
 * not beyond it. Returns `null` while ATR(14) is unavailable, rather than guessing a band.
 *
 * The result selects wording only. ADR 0011 keeps Situations threshold-free, so it never decides
 * whether a Situation is active.
 */
export function checkIfBeyondNoiseBand(
	situation: TrackedSituation,
	close: number,
	atr: number | null,
): boolean | null {
	if (atr === null) {
		return null;
	}

	const { kind, price } = situation.level;
	const noiseBand = noiseBandAtrMultiplier * atr;

	// Compared with the band's edge, beyond Regime's rounding tolerance, so a close on the edge is
	// not beyond it whichever side the level is on.
	if (kind === 'low') {
		return compareBeyondRoundingNoise(close, price - noiseBand) === -1;
	}

	return compareBeyondRoundingNoise(close, price + noiseBand) === 1;
}
