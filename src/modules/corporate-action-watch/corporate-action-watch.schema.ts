import * as v from 'valibot';

const BYMA_SYMBOL_PATTERN = /^[A-Z0-9]+$/;

const messages = {
	additionalField: 'Value contains a field not supported by the watch rules schema v1.',
	duplicateValue: 'List values must be distinct.',
	emptyList: 'List must not be empty.',
	invalidPhrase: 'Event phrase must be lowercase.',
	invalidSchemaVersion: 'Schema version must be 1.',
	invalidSymbol: 'Value must be an uppercase BYMA symbol.',
	invalidText: 'Text must be non-empty and have no leading or trailing spaces.',
	invalidType: 'Value has an invalid type or shape.',
} as const;

const textSchema = v.pipe(
	v.string(messages.invalidType),
	v.check((value) => value.length > 0 && value === value.trim(), messages.invalidText),
);
const symbolSchema = v.pipe(
	v.string(messages.invalidType),
	v.regex(BYMA_SYMBOL_PATTERN, messages.invalidSymbol),
);
const phraseSchema = v.pipe(
	textSchema,
	v.check((value) => value === value.toLowerCase(), messages.invalidPhrase),
);

export const watchRulesSchema = v.pipe(
	v.strictObject(
		{
			schemaVersion: v.literal(1, messages.invalidSchemaVersion),
			cedearProgramIssuers: v.pipe(
				v.array(textSchema, messages.invalidType),
				v.minLength(1, messages.emptyList),
				v.check(checkIfValuesAreDistinct, messages.duplicateValue),
				v.readonly(),
			),
			stockIssuerCodes: v.pipe(
				v.record(symbolSchema, symbolSchema, messages.invalidType),
				v.readonly(),
			),
			cedearNameAliases: v.pipe(
				v.record(textSchema, symbolSchema, messages.invalidType),
				v.readonly(),
			),
			eventPhrases: v.pipe(
				v.array(phraseSchema, messages.invalidType),
				v.minLength(1, messages.emptyList),
				v.check(checkIfValuesAreDistinct, messages.duplicateValue),
				v.readonly(),
			),
			excludedTitlePrefixes: v.pipe(v.array(textSchema, messages.invalidType), v.readonly()),
		},
		messages.additionalField,
	),
	v.readonly(),
);

// Fractional seconds are optional: the feed serves `2026-10-06 15:28:24.0`.
const PUBLICATION_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

export const relevantFactsResponseSchema = v.object({
	content: v.object({ total_elements_count: v.number() }),
	data: v.array(
		v.object({
			especie: v.string(),
			fecha: v.pipe(v.string(), v.check(checkIfPublicationTimestampIsValid)),
			descarga: v.pipe(v.number(), v.integer()),
			referencia: v.string(),
			emisor: v.string(),
		}),
	),
});

/** Converts the feed's `fecha`, a Buenos Aires wall-clock time, to `YYYY-MM-DDTHH:MM:SS`. */
export function convertPublicationTimestamp(fecha: string): string {
	const [date, time] = fecha.split(' ');
	return Temporal.PlainDateTime.from(`${date}T${time}`)
		.round({ smallestUnit: 'second', roundingMode: 'trunc' })
		.toString();
}

function checkIfPublicationTimestampIsValid(value: string): boolean {
	if (!PUBLICATION_TIMESTAMP_PATTERN.test(value)) {
		return false;
	}

	try {
		convertPublicationTimestamp(value);
		return true;
	} catch {
		return false;
	}
}

function checkIfValuesAreDistinct(values: string[]): boolean {
	return new Set(values).size === values.length;
}
