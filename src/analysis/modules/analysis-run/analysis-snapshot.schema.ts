import * as v from 'valibot';

import { checkIfIsoDateIsValid } from '#lib/utils/validation.ts';

const messages = {
	invalidSchemaVersion: 'Schema version must be 5.',
	invalidSessionDate: 'Value must be a real YYYY-MM-DD date.',
	invalidTimestamp: 'Value must be an ISO timestamp.',
	invalidType: 'Value has an invalid type or shape.',
} as const;

const analyzedLineOverviewSchema = v.object(
	{
		status: v.picklist(['available', 'unavailable'], messages.invalidType),
		instrumentId: v.string(messages.invalidType),
		tradingLineId: v.string(messages.invalidType),
	},
	messages.invalidType,
);

/**
 * The part of an Analysis Snapshot the web reads. `v.object` drops every other field, so a reader
 * cannot use a field that was never validated; fields are added here as pages start reading them.
 */
export const analysisSnapshotOverviewSchema = v.object(
	{
		schemaVersion: v.literal(5, messages.invalidSchemaVersion),
		ranAt: v.pipe(v.string(messages.invalidType), v.isoTimestamp(messages.invalidTimestamp)),
		requestedThroughSession: v.pipe(
			v.string(messages.invalidType),
			v.check(checkIfIsoDateIsValid, messages.invalidSessionDate),
		),
		analyzedLines: v.pipe(
			v.array(analyzedLineOverviewSchema, messages.invalidType),
			v.readonly(),
		),
	},
	messages.invalidType,
);
