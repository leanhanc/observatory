import * as v from 'valibot';

import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';
import { checkIfIsoDateIsValid } from '#lib/utils/validation/index.ts';

const messages = {
	invalidSchemaVersion: 'Schema version must be 7.',
	invalidSessionDate: 'Value must be a real YYYY-MM-DD date.',
	invalidTimestamp: 'Value must be an ISO timestamp.',
	invalidType: 'Value has an invalid type or shape.',
	inconsistentPesoEquivalents:
		'Peso equivalents must describe the latest State: its session and its confirmed swings.',
} as const;

const stringSchema = v.string(messages.invalidType);
const numberSchema = v.number(messages.invalidType);
const sessionDateSchema = v.pipe(
	stringSchema,
	v.check(checkIfIsoDateIsValid, messages.invalidSessionDate),
);
const regimeSchema = v.picklist(['bullish', 'bearish', 'mixed'], messages.invalidType);

const confirmedSwingSchema = v.object(
	{
		kind: v.picklist(['high', 'low'], messages.invalidType),
		price: numberSchema,
		occurredAtSession: sessionDateSchema,
		confirmedAtSession: sessionDateSchema,
	},
	messages.invalidType,
);

const confirmedSwingFieldEntries = {
	price: numberSchema,
	occurredAtSession: sessionDateSchema,
	confirmedAtSession: sessionDateSchema,
	priceRelativeToSwingInPercent: v.nullable(numberSchema),
};

const pendingRegimeTransitionSchema = v.object(
	{
		candidate: regimeSchema,
		confirmations: v.picklist([1, 2], messages.invalidType),
		requiredConfirmations: v.literal(
			ANALYSIS_CONFIGURATION.regime.transitionConfirmations,
			messages.invalidType,
		),
	},
	messages.invalidType,
);

const latestStateSchema = v.object(
	{
		sessionDate: sessionDateSchema,
		regime: v.nullable(regimeSchema),
		pendingRegimeTransition: v.nullable(pendingRegimeTransitionSchema),
		structure: v.nullable(
			v.picklist(['uptrend', 'downtrend', 'range', 'undefined'], messages.invalidType),
		),
		lastConfirmedSwingHigh: v.nullable(
			v.object(
				{ kind: v.literal('high', messages.invalidType), ...confirmedSwingFieldEntries },
				messages.invalidType,
			),
		),
		lastConfirmedSwingLow: v.nullable(
			v.object(
				{ kind: v.literal('low', messages.invalidType), ...confirmedSwingFieldEntries },
				messages.invalidType,
			),
		),
		rsi: v.nullable(numberSchema),
		priceRelativeToEmaInAtr: v.nullable(numberSchema),
		priceRelativeToLongTermEmaInPercent: v.nullable(numberSchema),
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

const pesoEquivalentsSchema = v.object(
	{
		sessionDate: sessionDateSchema,
		mepRate: v.pipe(numberSchema, v.gtValue(0, messages.invalidType)),
		close: numberSchema,
		lastConfirmedSwingHigh: v.nullable(numberSchema),
		lastConfirmedSwingLow: v.nullable(numberSchema),
	},
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

const analyzedLineVariantSchema = v.variant(
	'status',
	[
		v.object(
			{
				status: v.literal('available'),
				...lineIdentityEntries,
				latestState: latestStateSchema,
				pesoEquivalents: pesoEquivalentsSchema,
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

const analyzedLineSchema = v.pipe(
	analyzedLineVariantSchema,
	v.check(checkIfPesoEquivalentsMatchState, messages.inconsistentPesoEquivalents),
);

/**
 * The part of an Analysis Snapshot the web reads. `v.object` drops every other field, so a reader
 * cannot use a field that was never validated; fields are added here as pages start reading them.
 */
export const analysisSnapshotOverviewSchema = v.object(
	{
		schemaVersion: v.literal(7, messages.invalidSchemaVersion),
		priceUnit: v.picklist(['mep-dollar'], messages.invalidType),
		ranAt: v.pipe(stringSchema, v.isoTimestamp(messages.invalidTimestamp)),
		requestedThroughSession: sessionDateSchema,
		analyzedLines: v.pipe(v.array(analyzedLineSchema, messages.invalidType), v.readonly()),
	},
	messages.invalidType,
);

type AnalyzedLineOverview = v.InferOutput<typeof analyzedLineVariantSchema>;

// Peso equivalents convert the latest State's own swings at its own session's rate, so a reader
// that finds them on another session or for a missing swing has a snapshot it cannot trust.
function checkIfPesoEquivalentsMatchState(line: AnalyzedLineOverview): boolean {
	if (line.status !== 'available') {
		return true;
	}

	const { latestState, pesoEquivalents } = line;
	const isSameSession = pesoEquivalents.sessionDate === latestState.sessionDate;
	const hasMatchingHigh =
		(pesoEquivalents.lastConfirmedSwingHigh === null) ===
		(latestState.lastConfirmedSwingHigh === null);
	const hasMatchingLow =
		(pesoEquivalents.lastConfirmedSwingLow === null) ===
		(latestState.lastConfirmedSwingLow === null);

	return isSameSession && hasMatchingHigh && hasMatchingLow;
}
