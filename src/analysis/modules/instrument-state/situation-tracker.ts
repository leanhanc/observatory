import type { InstrumentState, Situation } from './instrument-state.types.ts';

type StateParts = Omit<InstrumentState, 'situations'>;

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
export function trackSituations(states: readonly StateParts[]): readonly (readonly Situation[])[] {
	let previousSituations: readonly Situation[] = [];

	return states.map((state) => {
		const situations = recognizeSituations(state).map((situation): Situation => ({
			...situation,
			activeSinceSession:
				findContinuedRunStart(previousSituations, situation) ?? state.sessionDate,
		}));
		previousSituations = situations;

		return situations;
	});
}

// A Situation before its run start is known; distributed over the union so each type keeps its level.
type RecognizedSituation = Situation extends infer Each
	? Each extends Situation
		? Omit<Each, 'activeSinceSession'>
		: never
	: never;

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
	previousSituations: readonly Situation[],
	situation: RecognizedSituation,
): string | null {
	const previous = previousSituations.find(({ type }) => type === situation.type);
	const isSameSwing = previous?.level.confirmedAtSession === situation.level.confirmedAtSession;

	if (previous === undefined || !isSameSwing) {
		return null;
	}

	return previous.activeSinceSession;
}
