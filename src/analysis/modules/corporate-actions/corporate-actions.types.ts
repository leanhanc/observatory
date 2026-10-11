import type { DailyBar } from '#modules/bar-history/index.ts';
import type { corporateActionListSchema } from './corporate-actions.schema.ts';
import type * as v from 'valibot';

export type CorporateActionList = v.InferOutput<typeof corporateActionListSchema>;

/**
 * A confirmed Corporate Action the provider was observed not to adjust in what `correction` names.
 *
 * - `prices-and-volume`: a price before `exDate` times `priceFactor` is on the post-ex-date scale.
 * - `volume`: the provider adjusted the price but not the volume; a volume before `exDate` times
 *   `shareFactor`, held after per held before, is on the post-ex-date unit.
 */
export type CorporateAction = CorporateActionList['corporateActions'][number];

export type PricesAndVolumeCorporateAction = Extract<
	CorporateAction,
	{ correction: 'prices-and-volume' }
>;

export type VolumeCorporateAction = Extract<CorporateAction, { correction: 'volume' }>;

export type CorporateActionValidationIssue = Readonly<{
	code: 'invalid-entry' | 'duplicate-corporate-action';
	path: string;
	message: string;
}>;

export type CorporateActionListValidation =
	| Readonly<{ isValid: true; corporateActions: readonly CorporateAction[] }>
	| Readonly<{ isValid: false; issues: readonly CorporateActionValidationIssue[] }>;

/**
 * - `applied`: the fetched data passed the action's guard, and the bars before the ex-date were
 *   rescaled.
 * - `step-not-observed` (`prices-and-volume`): the close ratio across the ex-date is not within the
 *   tolerance of the price factor. The provider may have adjusted the history, or a real move may
 *   hide the step; `observedCloseRatio` lets a reader tell which.
 * - `price-step-observed` (`volume`): the close ratio across the ex-date is not within the tolerance
 *   of 1. The provider may not have adjusted the price, so the entry may need `prices-and-volume`,
 *   or a real move may have moved the close.
 * - `volume-rescale-suspected` (`volume`): every volume read before the ex-date is a multiple of the
 *   share factor, so the provider may already have rescaled the volume.
 * - `outside-window`: the bars do not straddle the ex-date, so there was nothing to correct.
 */
export type PricesAndVolumeCorrectionStatus = 'applied' | 'step-not-observed' | 'outside-window';

export type VolumeCorrectionStatus =
	| 'applied'
	| 'price-step-observed'
	| 'volume-rescale-suspected'
	| 'outside-window';

export type CorporateActionStatus = PricesAndVolumeCorrectionStatus | VolumeCorrectionStatus;

type CloseRatioObservation = Readonly<{
	/** The uncorrected close ratio across the ex-date; `null` when it could not be observed. */
	observedCloseRatio: number | null;
}>;

export type CorporateActionOutcome =
	| (PricesAndVolumeCorporateAction &
			CloseRatioObservation &
			Readonly<{ status: PricesAndVolumeCorrectionStatus }>)
	| (VolumeCorporateAction &
			CloseRatioObservation &
			Readonly<{ status: VolumeCorrectionStatus }>);

export type CorporateActionCorrection = Readonly<{
	bars: readonly DailyBar[];
	outcomes: readonly CorporateActionOutcome[];
}>;
