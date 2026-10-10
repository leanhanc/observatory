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
	VolumeCorporateAction,
	VolumeCorrectionStatus,
} from './corporate-actions.types.ts';

const { maximumStepDeviation, volumeRescaleCheckBars } = ANALYSIS_CONFIGURATION.corporateActions;

/** What a bar's prices and volume are multiplied by to put it on the post-ex-date scale. */
type BarRescaling = Readonly<{ priceFactor: number; volumeFactor: number }>;

const NO_RESCALING: BarRescaling = { priceFactor: 1, volumeFactor: 1 };

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
 * Puts one line's bars before each ex-date on the post-ex-date scale. A `prices-and-volume` action
 * multiplies prices by the price factor and divides volume, a share count, by it, so traded value
 * is unchanged. A `volume` action, for a provider that adjusted the price but not the count,
 * multiplies volume by the share factor and leaves prices as served, so traded value grows by it.
 *
 * Each action is applied only when the uncorrected bars pass its guard, and the outcome says why
 * when they do not. A `prices-and-volume` action needs the step still visible across the ex-date: a
 * provider that has since adjusted the history would otherwise get it adjusted twice. A `volume`
 * action needs the opposite, no price step, and is also skipped when every recent volume before the
 * ex-date is a multiple of its integer share factor, because a volume rescaled twice overstates
 * traded value and could admit a thin line to analysis. Expects validated, chronological bars of a
 * single Trading Line and that line's actions only.
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
		const rescaling = laterActions.reduce(composeRescaling, NO_RESCALING);
		return rescaleBar(bar, rescaling);
	});

	return { bars: correctedBars, outcomes };
}

function evaluateCorporateAction(
	bars: readonly DailyBar[],
	action: CorporateAction,
): CorporateActionOutcome {
	const observedCloseRatio = observeCloseRatio(bars, action.exDate);

	if (observedCloseRatio === null) {
		return { ...action, status: 'outside-window', observedCloseRatio };
	}

	if (action.correction === 'volume') {
		const status = evaluateVolumeCorrection(bars, action, observedCloseRatio);
		return { ...action, status, observedCloseRatio };
	}

	// The list's factors are far enough from 1 that this band never reaches an unstepped ratio.
	const hasStep =
		measureDeviation(observedCloseRatio, action.priceFactor) <= maximumStepDeviation;

	return {
		...action,
		status: hasStep ? 'applied' : 'step-not-observed',
		observedCloseRatio,
	};
}

/** The uncorrected close ratio across the ex-date, or `null` when the bars do not straddle it. */
function observeCloseRatio(bars: readonly DailyBar[], exDate: string): number | null {
	const exDateIndex = bars.findIndex((bar) => bar.sessionDate >= exDate);
	const lastBarBeforeExDate = bars[exDateIndex - 1];
	const firstBarFromExDate = bars[exDateIndex];

	if (!lastBarBeforeExDate || !firstBarFromExDate) {
		return null;
	}

	return firstBarFromExDate.close / lastBarBeforeExDate.close;
}

function evaluateVolumeCorrection(
	bars: readonly DailyBar[],
	action: VolumeCorporateAction,
	observedCloseRatio: number,
): VolumeCorrectionStatus {
	// The list's factors are far enough from 1 that this band never reaches the unadjusted step.
	const hasNoPriceStep = measureDeviation(observedCloseRatio, 1) <= maximumStepDeviation;

	if (!hasNoPriceStep) {
		return 'price-step-observed';
	}

	if (checkIfVolumeLooksRescaled(bars, action)) {
		return 'volume-rescale-suspected';
	}

	return 'applied';
}

/**
 * A count the provider rescaled by an integer factor is a multiple of it on every earlier bar,
 * while an unrescaled count is a multiple about once in `shareFactor` bars. Zero volumes are a
 * multiple of anything, so only traded bars are read. With fewer bars, chance alone would flag too
 * often, and a non-integer factor leaves no divisibility signature, so neither is checked.
 */
function checkIfVolumeLooksRescaled(
	bars: readonly DailyBar[],
	action: VolumeCorporateAction,
): boolean {
	const { exDate, shareFactor } = action;
	const hasDivisibilitySignature = Number.isInteger(shareFactor) && shareFactor >= 2;

	if (!hasDivisibilitySignature) {
		return false;
	}

	const tradedBarsBeforeExDate = bars.filter((bar) => bar.sessionDate < exDate && bar.volume > 0);
	const checkedBars = tradedBarsBeforeExDate.slice(-volumeRescaleCheckBars);
	const hasEnoughBars = checkedBars.length === volumeRescaleCheckBars;

	if (!hasEnoughBars) {
		return false;
	}

	return checkedBars.every((bar) => bar.volume % shareFactor === 0);
}

/**
 * The larger-over-smaller ratio of two positive values: `exp(|ln a − ln b|)`, computed without
 * logarithms so that exact boundary ratios compare exactly.
 */
function measureDeviation(left: number, right: number): number {
	return Math.max(left / right, right / left);
}

function composeRescaling(rescaling: BarRescaling, action: CorporateAction): BarRescaling {
	if (action.correction === 'volume') {
		return { ...rescaling, volumeFactor: rescaling.volumeFactor * action.shareFactor };
	}

	return {
		priceFactor: rescaling.priceFactor * action.priceFactor,
		volumeFactor: rescaling.volumeFactor / action.priceFactor,
	};
}

function rescaleBar(bar: DailyBar, rescaling: BarRescaling): DailyBar {
	const { priceFactor, volumeFactor } = rescaling;

	if (priceFactor === 1 && volumeFactor === 1) {
		return bar;
	}

	return {
		sessionDate: bar.sessionDate,
		open: bar.open * priceFactor,
		high: bar.high * priceFactor,
		low: bar.low * priceFactor,
		close: bar.close * priceFactor,
		volume: bar.volume * volumeFactor,
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
