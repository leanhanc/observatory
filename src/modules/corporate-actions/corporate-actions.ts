import * as v from 'valibot';

import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';
import { mapValibotIssues } from '#lib/utils/validation.ts';

import { corporateActionListSchema } from './corporate-actions.schema.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type {
	CorporateAction,
	CorporateActionCorrection,
	CorporateActionListValidation,
	CorporateActionOutcome,
	CorporateActionValidationIssue,
} from './corporate-actions.types.ts';

const { maximumStepDeviation } = ANALYSIS_CONFIGURATION.corporateActions;

/** Validates a Corporate Action list value, such as the parsed committed data file. */
export function validateCorporateActionList(value: unknown): CorporateActionListValidation {
	const schemaValidation = v.safeParse(corporateActionListSchema, value);

	if (!schemaValidation.success) {
		return {
			isValid: false,
			issues: mapValibotIssues(schemaValidation.issues, () => 'invalid-entry'),
		};
	}

	const { corporateActions } = schemaValidation.output;
	const duplicateIssues = findDuplicateCorporateActions(corporateActions);

	if (duplicateIssues.length > 0) {
		return { isValid: false, issues: duplicateIssues };
	}

	return { isValid: true, corporateActions };
}

/**
 * Puts one line's bars before each ex-date on the post-ex-date scale: prices are multiplied by the
 * price factor and volume, a share count, is divided by it, so traded value is unchanged.
 *
 * An action is applied only when the uncorrected bars still show its step across the ex-date;
 * otherwise the provider has adjusted the history already, and applying it again would create the
 * step it is meant to remove. Expects validated, chronological bars of a single Trading Line and
 * that line's actions only.
 */
export function applyCorporateActions(
	bars: readonly DailyBar[],
	corporateActions: readonly CorporateAction[],
): CorporateActionCorrection {
	const outcomes = corporateActions.map((action) => evaluateCorporateAction(bars, action));
	const appliedActions = outcomes.filter((outcome) => outcome.status === 'applied');

	if (appliedActions.length === 0) {
		return { bars, outcomes };
	}

	const correctedBars = bars.map((bar) => {
		const laterActions = appliedActions.filter((action) => bar.sessionDate < action.exDate);
		const cumulativeFactor = laterActions.reduce(
			(factor, action) => factor * action.priceFactor,
			1,
		);
		return rescaleBar(bar, cumulativeFactor);
	});

	return { bars: correctedBars, outcomes };
}

function evaluateCorporateAction(
	bars: readonly DailyBar[],
	action: CorporateAction,
): CorporateActionOutcome {
	const exDateIndex = bars.findIndex((bar) => bar.sessionDate >= action.exDate);
	const lastBarBeforeExDate = bars[exDateIndex - 1];
	const firstBarFromExDate = bars[exDateIndex];

	if (!lastBarBeforeExDate || !firstBarFromExDate) {
		return { ...action, status: 'outside-window', observedCloseRatio: null };
	}

	const observedCloseRatio = firstBarFromExDate.close / lastBarBeforeExDate.close;
	const hasStep = checkIfStepIsPresent(observedCloseRatio, action.priceFactor);

	return {
		...action,
		status: hasStep ? 'applied' : 'already-adjusted',
		observedCloseRatio,
	};
}

/**
 * The step is present when the observed ratio is within the configured deviation of the factor and
 * closer to it than to no step at all. The second condition matters for factors near 1, where the
 * deviation band would otherwise include an already-adjusted ratio of about 1.
 */
function checkIfStepIsPresent(observedCloseRatio: number, priceFactor: number): boolean {
	const deviationFromFactor = measureDeviation(observedCloseRatio, priceFactor);
	const deviationFromNoStep = measureDeviation(observedCloseRatio, 1);
	const isNearFactor = deviationFromFactor <= maximumStepDeviation;
	const isCloserToFactorThanToNoStep = deviationFromFactor < deviationFromNoStep;

	return isNearFactor && isCloserToFactorThanToNoStep;
}

/**
 * The larger-over-smaller ratio of two positive values: `exp(|ln a − ln b|)`, computed without
 * logarithms so that exact boundary ratios compare exactly.
 */
function measureDeviation(left: number, right: number): number {
	return Math.max(left / right, right / left);
}

function rescaleBar(bar: DailyBar, priceFactor: number): DailyBar {
	if (priceFactor === 1) {
		return bar;
	}

	return {
		sessionDate: bar.sessionDate,
		open: bar.open * priceFactor,
		high: bar.high * priceFactor,
		low: bar.low * priceFactor,
		close: bar.close * priceFactor,
		volume: bar.volume / priceFactor,
	};
}

function findDuplicateCorporateActions(
	corporateActions: readonly CorporateAction[],
): CorporateActionValidationIssue[] {
	const pathsByIdentity = Map.groupBy(
		corporateActions.entries(),
		([, action]) => `${action.tradingLineId}@${action.exDate}`,
	);

	return [...pathsByIdentity].flatMap(([identity, entries]) => {
		if (entries.length < 2) {
			return [];
		}

		return entries.map(([index]) => ({
			code: 'duplicate-corporate-action' as const,
			path: `corporateActions[${index}]`,
			message: `Corporate Action ${identity} occurs more than once.`,
		}));
	});
}
