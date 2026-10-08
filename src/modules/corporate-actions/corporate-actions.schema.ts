import * as v from 'valibot';

import { checkIfIsoDateIsValid } from '#lib/utils/validation.ts';

const messages = {
	additionalField: 'Value contains a field not supported by Corporate Action list schema v1.',
	invalidDate: 'Date must be a real YYYY-MM-DD date.',
	invalidIdentifier: 'Identifier must use lowercase kebab-case.',
	invalidPriceFactor: 'Price factor must be a positive finite number other than 1.',
	mismatchedPriceFactor:
		'A reverse split needs a price factor above 1; a split or share distribution, below 1.',
	invalidSchemaVersion: 'Schema version must be 1.',
	invalidSourceUrl: 'Source must be an https URL.',
	invalidType: 'Value has an invalid type or shape.',
	invalidValue: 'Value is not supported by Corporate Action list schema v1.',
} as const;

// A split or a share distribution multiplies the share count, so earlier prices come down: the
// factor is below 1. A reverse split combines shares, so earlier prices go up: the factor is above 1.
const PRICE_RAISING_KINDS = new Set(['reverse-split']);

const corporateActionSchema = v.pipe(
	v.strictObject(
		{
			tradingLineId: v.pipe(
				v.string(messages.invalidType),
				v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, messages.invalidIdentifier),
			),
			exDate: v.pipe(
				v.string(messages.invalidType),
				v.check(checkIfIsoDateIsValid, messages.invalidDate),
			),
			priceFactor: v.pipe(
				v.number(messages.invalidType),
				v.check(checkIfPriceFactorIsUsable, messages.invalidPriceFactor),
			),
			kind: v.picklist(
				['share-distribution', 'split', 'reverse-split'],
				messages.invalidValue,
			),
			sourceUrl: v.pipe(
				v.string(messages.invalidType),
				v.check(checkIfUrlIsHttps, messages.invalidSourceUrl),
			),
		},
		messages.additionalField,
	),
	v.forward(
		v.partialCheck(
			[['kind'], ['priceFactor']],
			checkIfPriceFactorMatchesKind,
			messages.mismatchedPriceFactor,
		),
		['priceFactor'],
	),
	v.readonly(),
);

export const corporateActionListSchema = v.pipe(
	v.strictObject(
		{
			schemaVersion: v.literal(1, messages.invalidSchemaVersion),
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

function checkIfPriceFactorIsUsable(value: number): boolean {
	return Number.isFinite(value) && value > 0 && value !== 1;
}

function checkIfPriceFactorMatchesKind(action: { kind: string; priceFactor: number }): boolean {
	// An unusable factor already has its own issue.
	if (!checkIfPriceFactorIsUsable(action.priceFactor)) {
		return true;
	}

	const isPriceRaisingKind = PRICE_RAISING_KINDS.has(action.kind);
	return isPriceRaisingKind ? action.priceFactor > 1 : action.priceFactor < 1;
}
