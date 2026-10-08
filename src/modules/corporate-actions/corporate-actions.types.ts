import type { DailyBar } from '#modules/bar-history/index.ts';
import type { corporateActionListSchema } from './corporate-actions.schema.ts';
import type * as v from 'valibot';

export type CorporateActionList = v.InferOutput<typeof corporateActionListSchema>;

/**
 * A confirmed Corporate Action the provider was observed not to adjust. A price before `exDate`
 * times `priceFactor` is on the post-ex-date scale.
 */
export type CorporateAction = CorporateActionList['corporateActions'][number];

export type CorporateActionValidationIssue = Readonly<{
	code: 'invalid-entry' | 'duplicate-corporate-action';
	path: string;
	message: string;
}>;

export type CorporateActionListValidation =
	| Readonly<{ isValid: true; corporateActions: readonly CorporateAction[] }>
	| Readonly<{ isValid: false; issues: readonly CorporateActionValidationIssue[] }>;

/**
 * - `applied`: the fetched data still showed the step, and the bars before the ex-date were
 *   rescaled.
 * - `step-not-observed`: the close ratio across the ex-date is not within the tolerance of the
 *   factor, so nothing was rescaled. The provider may have adjusted the history, or a real move may
 *   hide the step; `observedCloseRatio` lets a reader tell which.
 * - `outside-window`: the bars do not straddle the ex-date, so there was nothing to correct.
 */
export type CorporateActionStatus = 'applied' | 'step-not-observed' | 'outside-window';

export type CorporateActionOutcome = CorporateAction &
	Readonly<{
		status: CorporateActionStatus;
		/** The uncorrected close ratio across the ex-date; `null` when it could not be observed. */
		observedCloseRatio: number | null;
	}>;

export type CorporateActionCorrection = Readonly<{
	bars: readonly DailyBar[];
	outcomes: readonly CorporateActionOutcome[];
}>;
