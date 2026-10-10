import * as v from 'valibot';

import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';
import { checkIfIsoDateIsValid } from '#lib/utils/validation.ts';

const { maximumStepDeviation } = ANALYSIS_CONFIGURATION.corporateActions;

// Each guard compares the observed close ratio across the ex-date with a reference within
// `maximumStepDeviation`: the price step for a prices-and-volume entry, 1 for a volume entry. A
// factor at least that deviation squared away from 1 keeps the step band and the no-step band apart,
// so an already-adjusted history is adjusted again only when a real move of that size lands on the
// ex-date, and one entry cannot pass as both corrections. Nearer factors, such as a 5-for-4 split's,
// cannot be listed.
const MINIMUM_FACTOR_DEVIATION = maximumStepDeviation ** 2;

const messages = {
	additionalField: 'Value contains a field not supported by Corporate Action list schema v2.',
	invalidCorrection: 'Correction must be prices-and-volume or volume.',
	invalidDate: 'Date must be a real YYYY-MM-DD date.',
	invalidIdentifier: 'Identifier must use lowercase kebab-case.',
	invalidFactor: `Factor must be a positive finite number at most 1/${MINIMUM_FACTOR_DEVIATION} or at least ${MINIMUM_FACTOR_DEVIATION}.`,
	mismatchedPriceFactor:
		'A reverse split needs a price factor above 1; a split or share distribution, below 1.',
	mismatchedShareFactor:
		'A reverse split needs a share factor below 1; a split or share distribution, above 1.',
	invalidSchemaVersion: 'Schema version must be 2.',
	invalidSourceUrl: 'Source must be an https URL.',
	invalidType: 'Value has an invalid type or shape.',
	invalidValue: 'Value is not supported by Corporate Action list schema v2.',
} as const;

// A split or a share distribution multiplies the share count, so earlier prices come down and each
// holding grows. A reverse split combines shares, so the opposite holds. A CEDEAR ratio change can go
// either way, so it constrains neither factor.
const SHARE_MULTIPLYING_KINDS = new Set(['share-distribution', 'split']);
const SHARE_COMBINING_KINDS = new Set(['reverse-split']);

const commonEntries = {
	tradingLineId: v.pipe(
		v.string(messages.invalidType),
		v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, messages.invalidIdentifier),
	),
	exDate: v.pipe(
		v.string(messages.invalidType),
		v.check(checkIfIsoDateIsValid, messages.invalidDate),
	),
	kind: v.picklist(
		['share-distribution', 'split', 'reverse-split', 'ratio-change'],
		messages.invalidValue,
	),
	sourceUrl: v.pipe(
		v.string(messages.invalidType),
		v.check(checkIfUrlIsHttps, messages.invalidSourceUrl),
	),
};

const factorSchema = v.pipe(
	v.number(messages.invalidType),
	v.check(checkIfFactorIsUsable, messages.invalidFactor),
);

const pricesAndVolumeCorrectionSchema = v.pipe(
	v.strictObject(
		{
			...commonEntries,
			correction: v.literal('prices-and-volume'),
			priceFactor: factorSchema,
		},
		messages.additionalField,
	),
	v.forward(
		v.partialCheck(
			[['kind'], ['priceFactor']],
			(action) => checkIfFactorMatchesKind(action.kind, 1 / action.priceFactor),
			messages.mismatchedPriceFactor,
		),
		['priceFactor'],
	),
);

const volumeCorrectionSchema = v.pipe(
	v.strictObject(
		{
			...commonEntries,
			correction: v.literal('volume'),
			shareFactor: factorSchema,
		},
		messages.additionalField,
	),
	v.forward(
		v.partialCheck(
			[['kind'], ['shareFactor']],
			(action) => checkIfFactorMatchesKind(action.kind, action.shareFactor),
			messages.mismatchedShareFactor,
		),
		['shareFactor'],
	),
);

const corporateActionSchema = v.pipe(
	v.variant(
		'correction',
		[pricesAndVolumeCorrectionSchema, volumeCorrectionSchema],
		messages.invalidCorrection,
	),
	v.readonly(),
);

export const corporateActionListSchema = v.pipe(
	v.strictObject(
		{
			schemaVersion: v.literal(2, messages.invalidSchemaVersion),
			corporateActions: v.pipe(
				v.array(corporateActionSchema, messages.invalidType),
				v.readonly(),
			),
		},
		messages.additionalField,
	),
	v.readonly(),
);

function checkIfUrlIsHttps(value: string): boolean {
	return URL.parse(value)?.protocol === 'https:';
}

function checkIfFactorIsUsable(value: number): boolean {
	if (!Number.isFinite(value) || value <= 0) {
		return false;
	}

	const deviationFromNoStep = Math.max(value, 1 / value);
	return deviationFromNoStep >= MINIMUM_FACTOR_DEVIATION;
}

/** `shareFactor` is held after per held before: above 1 when the kind multiplies shares. */
function checkIfFactorMatchesKind(kind: string, shareFactor: number): boolean {
	// An unusable factor already has its own issue.
	if (!checkIfFactorIsUsable(shareFactor)) {
		return true;
	}

	if (SHARE_MULTIPLYING_KINDS.has(kind)) {
		return shareFactor > 1;
	}

	if (SHARE_COMBINING_KINDS.has(kind)) {
		return shareFactor < 1;
	}

	return true;
}
