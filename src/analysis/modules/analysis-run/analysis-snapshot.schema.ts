import * as v from 'valibot';

import { checkIfIsoDateIsValid } from '#lib/utils/validation/index.ts';

const messages = {
	invalidSchemaVersion: 'Schema version must be 6.',
	invalidSessionDate: 'Value must be a real YYYY-MM-DD date.',
	invalidTimestamp: 'Value must be an ISO timestamp.',
	invalidType: 'Value has an invalid type or shape.',
} as const;

const stringSchema = v.string(messages.invalidType);
const numberSchema = v.number(messages.invalidType);
const sessionDateSchema = v.pipe(
	stringSchema,
	v.check(checkIfIsoDateIsValid, messages.invalidSessionDate),
);
const regimeSchema = v.picklist(['bullish', 'bearish', 'mixed'], messages.invalidType);

const latestStateSchema = v.object(
	{
		sessionDate: sessionDateSchema,
		regime: v.nullable(regimeSchema),
		structure: v.nullable(
			v.picklist(['uptrend', 'downtrend', 'range', 'undefined'], messages.invalidType),
		),
		rsi: v.nullable(numberSchema),
		priceRelativeToEmaInAtr: v.nullable(numberSchema),
		priceRelativeToLongTermEmaInPercent: v.nullable(numberSchema),
	},
	messages.invalidType,
);

const confirmedSwingSchema = v.object(
	{
		kind: v.picklist(['high', 'low'], messages.invalidType),
		price: numberSchema,
		occurredAtSession: sessionDateSchema,
		confirmedAtSession: sessionDateSchema,
	},
	messages.invalidType,
);

const analysisEventSchema = v.variant(
	'type',
	[
		v.object(
			{
				type: v.literal('regime-transition'),
				from: regimeSchema,
				to: regimeSchema,
				confirmingSessionDates: v.pipe(
					v.tuple(
						[sessionDateSchema, sessionDateSchema, sessionDateSchema],
						messages.invalidType,
					),
					v.readonly(),
				),
			},
			messages.invalidType,
		),
		v.object(
			{
				type: v.literal('structure-break'),
				direction: v.picklist(['upward', 'downward'], messages.invalidType),
				priorStructure: v.picklist(['uptrend', 'downtrend'], messages.invalidType),
				definingSwing: confirmedSwingSchema,
				closePrice: numberSchema,
			},
			messages.invalidType,
		),
		v.object(
			{
				type: v.literal('volatile-session'),
				trueRange: numberSchema,
				baselineAtr: numberSchema,
				baselineThroughSessionDate: sessionDateSchema,
				atrMultiple: numberSchema,
			},
			messages.invalidType,
		),
	],
	messages.invalidType,
);

const snapshotEventSchema = v.object(
	{
		sessionDate: sessionDateSchema,
		event: analysisEventSchema,
		coincidesWithLargeMove: v.boolean(messages.invalidType),
	},
	messages.invalidType,
);

const lineIdentityEntries = {
	instrumentId: stringSchema,
	tradingLineId: stringSchema,
};

const analyzedLineSchema = v.variant(
	'status',
	[
		v.object(
			{
				status: v.literal('available'),
				...lineIdentityEntries,
				latestState: latestStateSchema,
				events: v.pipe(v.array(snapshotEventSchema, messages.invalidType), v.readonly()),
			},
			messages.invalidType,
		),
		v.variant(
			'reason',
			[
				v.object(
					{
						status: v.literal('unavailable'),
						...lineIdentityEntries,
						reason: v.literal('insufficient-liquidity'),
						message: stringSchema,
						liquidity: v.object(
							{
								participation: numberSchema,
								medianDailyTradedValueUsd: v.nullable(numberSchema),
							},
							messages.invalidType,
						),
					},
					messages.invalidType,
				),
				v.object(
					{
						status: v.literal('unavailable'),
						...lineIdentityEntries,
						reason: v.picklist(
							[
								'fetch-failed',
								'invalid-bars',
								'no-provider-bars',
								'no-dollarized-bars',
							],
							messages.invalidType,
						),
						message: stringSchema,
					},
					messages.invalidType,
				),
			],
			messages.invalidType,
		),
	],
	messages.invalidType,
);

/**
 * The part of an Analysis Snapshot the web reads. `v.object` drops every other field, so a reader
 * cannot use a field that was never validated; fields are added here as pages start reading them.
 */
export const analysisSnapshotOverviewSchema = v.object(
	{
		schemaVersion: v.literal(6, messages.invalidSchemaVersion),
		priceUnit: v.picklist(['mep-dollar'], messages.invalidType),
		ranAt: v.pipe(stringSchema, v.isoTimestamp(messages.invalidTimestamp)),
		requestedThroughSession: sessionDateSchema,
		analyzedLines: v.pipe(v.array(analyzedLineSchema, messages.invalidType), v.readonly()),
	},
	messages.invalidType,
);
