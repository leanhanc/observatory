import * as v from 'valibot';

const messages = {
	additionalField: 'Value contains a field not supported by Instrument Catalog schema v1.',
	emptyCatalog: 'Instrument Catalog must contain at least one Instrument.',
	emptyTradingLines: 'Every Instrument must contain at least one Trading Line.',
	invalidIdentifier: 'Identifier must use lowercase kebab-case.',
	invalidSchemaVersion: 'Schema version must be 1.',
	invalidType: 'Value has an invalid type or shape.',
	invalidValue: 'Value is not supported by Instrument Catalog schema v1.',
	nonBlankString: 'Value must not be blank.',
} as const;

const lowercaseKebabCaseSchema = v.pipe(
	v.string(messages.invalidType),
	v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, messages.invalidIdentifier),
);

const nonBlankStringSchema = v.pipe(
	v.string(messages.invalidType),
	v.check(checkIfStringIsNotBlank, messages.nonBlankString),
);

export const tradingLineSchema = v.pipe(
	v.strictObject(
		{
			id: lowercaseKebabCaseSchema,
			symbol: nonBlankStringSchema,
			exchange: v.picklist(['BYMA', 'NASDAQ'], messages.invalidValue),
			currency: v.picklist(['ARS', 'USD'], messages.invalidValue),
		},
		messages.additionalField,
	),
	v.readonly(),
);

const tradingLinesSchema = v.pipe(
	v.array(tradingLineSchema, messages.invalidType),
	v.minLength(1, messages.emptyTradingLines),
	v.readonly(),
);

export const stockInstrumentSchema = v.pipe(
	v.strictObject(
		{
			id: lowercaseKebabCaseSchema,
			type: v.literal('stock', messages.invalidValue),
			tradingLines: tradingLinesSchema,
		},
		messages.additionalField,
	),
	v.readonly(),
);

export const cedearInstrumentSchema = v.pipe(
	v.strictObject(
		{
			id: lowercaseKebabCaseSchema,
			type: v.literal('cedear', messages.invalidValue),
			underlyingInstrumentId: lowercaseKebabCaseSchema,
			tradingLines: tradingLinesSchema,
		},
		messages.additionalField,
	),
	v.readonly(),
);

export const instrumentSchema = v.variant(
	'type',
	[stockInstrumentSchema, cedearInstrumentSchema],
	messages.invalidType,
);

const instrumentsSchema = v.pipe(
	v.array(instrumentSchema, messages.invalidType),
	v.minLength(1, messages.emptyCatalog),
	v.readonly(),
);

export const instrumentCatalogSchema = v.pipe(
	v.strictObject(
		{
			schemaVersion: v.literal(1, messages.invalidSchemaVersion),
			instruments: instrumentsSchema,
		},
		messages.additionalField,
	),
	v.readonly(),
);

export function resolveSchemaIssueCode(
	issue: v.BaseIssue<unknown>,
): 'invalid-schema-version' | 'invalid-type' | 'invalid-value' {
	if (issue.message === messages.invalidSchemaVersion) {
		return 'invalid-schema-version';
	}

	if (issue.message === messages.invalidType) {
		return 'invalid-type';
	}

	return 'invalid-value';
}

function checkIfStringIsNotBlank(value: string): boolean {
	return value.trim().length > 0;
}
