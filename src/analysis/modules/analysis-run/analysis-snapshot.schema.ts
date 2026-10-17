import * as v from 'valibot';

import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';
import { checkIfIsoDateIsValid } from '#lib/utils/validation/index.ts';

const messages = {
	invalidSchemaVersion: 'Schema version must be 12.',
	invalidSessionDate: 'Value must be a real YYYY-MM-DD date.',
	invalidTimestamp: 'Value must be an ISO timestamp.',
	invalidType: 'Value has an invalid type or shape.',
	inconsistentPesoEquivalents:
		'Peso equivalents must describe the latest State: its session, its confirmed swings and its Regime tipping closes.',
	inconsistentCclEquivalents:
		'CCL equivalents must describe the latest State: its session, its confirmed swings and its Regime tipping closes.',
	inconsistentSituations:
		'Each Situation must agree with the latest State: its Regime and the swing the close is beyond.',
	inconsistentCloseChange:
		'A close change must have its previous close, change and percent change, or none of them.',
	inconsistentLatestClose:
		'The latest close must describe the latest State: its session, an earlier previous session, and a CCL part exactly when the line has CCL equivalents.',
	inconsistentPeriodReturn:
		'A period return must have both its start session and change, or neither.',
	inconsistentLatestCloseEquivalents:
		'The latest close in pesos and in CCL dollars must equal the peso and CCL equivalents’ close.',
	inconsistentPeriodReturnSessions:
		'Peso and CCL period returns must cover the windows of the MEP period returns, from the same start sessions; a CCL return may lack its start.',
	cclFiguresWithoutCclRate:
		'A snapshot without a CCL Rate source must have no CCL figure: every line’s CCL equivalents, CCL close and CCL period return, and every Structure Break’s CCL equivalents, must be null.',
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

const confirmedLowSchema = v.object(
	{
		kind: v.literal('low', messages.invalidType),
		price: numberSchema,
		occurredAtSession: sessionDateSchema,
		confirmedAtSession: sessionDateSchema,
	},
	messages.invalidType,
);

const confirmedHighSchema = v.object(
	{
		kind: v.literal('high', messages.invalidType),
		price: numberSchema,
		occurredAtSession: sessionDateSchema,
		confirmedAtSession: sessionDateSchema,
	},
	messages.invalidType,
);

const regimeTippingClosesSchema = v.object(
	{
		bullish: v.object(
			{ closeAbove: numberSchema, isFastEmaAligned: v.boolean(messages.invalidType) },
			messages.invalidType,
		),
		bearish: v.object(
			{ closeBelow: numberSchema, isFastEmaAligned: v.boolean(messages.invalidType) },
			messages.invalidType,
		),
	},
	messages.invalidType,
);

const situationSchema = v.variant(
	'type',
	[
		v.object(
			{
				type: v.literal('below-last-confirmed-low-in-bearish-regime'),
				activeSinceSession: sessionDateSchema,
				level: confirmedLowSchema,
				isBeyondNoiseBand: v.nullable(v.boolean(messages.invalidType)),
			},
			messages.invalidType,
		),
		v.object(
			{
				type: v.literal('above-last-confirmed-high-in-bullish-regime'),
				activeSinceSession: sessionDateSchema,
				level: confirmedHighSchema,
				isBeyondNoiseBand: v.nullable(v.boolean(messages.invalidType)),
			},
			messages.invalidType,
		),
	],
	messages.invalidType,
);

const periodReturnSchema = v.pipe(
	v.object(
		{
			windowMonths: v.pipe(
				numberSchema,
				v.integer(messages.invalidType),
				v.gtValue(0, messages.invalidType),
			),
			fromSessionDate: v.nullable(sessionDateSchema),
			percentChange: v.nullable(numberSchema),
		},
		messages.invalidType,
	),
	v.check(
		(periodReturn) =>
			(periodReturn.fromSessionDate === null) === (periodReturn.percentChange === null),
		messages.inconsistentPeriodReturn,
	),
);

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
		regimeTippingCloses: v.nullable(regimeTippingClosesSchema),
		structure: v.nullable(
			v.picklist(['uptrend', 'downtrend', 'range', 'undefined'], messages.invalidType),
		),
		lastConfirmedSwingHigh: v.nullable(
			v.object(
				{
					kind: v.literal('high', messages.invalidType),
					...confirmedSwingFieldEntries,
					closePosition: v.picklist(['at-or-below', 'above'], messages.invalidType),
				},
				messages.invalidType,
			),
		),
		lastConfirmedSwingLow: v.nullable(
			v.object(
				{
					kind: v.literal('low', messages.invalidType),
					...confirmedSwingFieldEntries,
					closePosition: v.picklist(['at-or-above', 'below'], messages.invalidType),
				},
				messages.invalidType,
			),
		),
		rsi: v.nullable(numberSchema),
		priceRelativeToEmaInAtr: v.nullable(numberSchema),
		priceRelativeToLongTermEmaInPercent: v.nullable(numberSchema),
		situations: v.pipe(v.array(situationSchema, messages.invalidType), v.readonly()),
	},
	messages.invalidType,
);

const exchangeRateSchema = v.pipe(numberSchema, v.gtValue(0, messages.invalidType));

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
				pesoEquivalents: v.object(
					{
						mepRate: exchangeRateSchema,
						closePrice: numberSchema,
						definingSwingPrice: numberSchema,
					},
					messages.invalidType,
				),
				cclEquivalents: v.nullable(
					v.object(
						{
							cclRate: exchangeRateSchema,
							closePrice: numberSchema,
							definingSwingPrice: numberSchema,
						},
						messages.invalidType,
					),
				),
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

const latestStateEquivalentEntries = {
	sessionDate: sessionDateSchema,
	close: numberSchema,
	lastConfirmedSwingHigh: v.nullable(numberSchema),
	lastConfirmedSwingLow: v.nullable(numberSchema),
	regimeTippingCloses: v.nullable(
		v.object(
			{ bullishCloseAbove: numberSchema, bearishCloseBelow: numberSchema },
			messages.invalidType,
		),
	),
};

const pesoEquivalentsSchema = v.object(
	{ mepRate: exchangeRateSchema, ...latestStateEquivalentEntries },
	messages.invalidType,
);

const cclEquivalentsSchema = v.object(
	{ cclRate: exchangeRateSchema, ...latestStateEquivalentEntries },
	messages.invalidType,
);

const closeChangeSchema = v.pipe(
	v.object(
		{
			close: numberSchema,
			previousClose: v.nullable(numberSchema),
			change: v.nullable(numberSchema),
			percentChange: v.nullable(numberSchema),
		},
		messages.invalidType,
	),
	v.check(
		({ previousClose, change, percentChange }) =>
			(previousClose === null) === (change === null) &&
			(change === null) === (percentChange === null),
		messages.inconsistentCloseChange,
	),
);

const latestCloseSchema = v.object(
	{
		sessionDate: sessionDateSchema,
		previousSessionDate: v.nullable(sessionDateSchema),
		peso: closeChangeSchema,
		mep: closeChangeSchema,
		ccl: v.nullable(closeChangeSchema),
	},
	messages.invalidType,
);

const cclRateSourceSchema = v.object(
	{
		pesoBondTradingLineId: stringSchema,
		cableBondTradingLineId: stringSchema,
		latestRateSessionDate: sessionDateSchema,
	},
	messages.invalidType,
);

const periodReturnsSchema = v.pipe(v.array(periodReturnSchema, messages.invalidType), v.readonly());

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
				latestClose: latestCloseSchema,
				periodReturns: periodReturnsSchema,
				pesoPeriodReturns: periodReturnsSchema,
				cclPeriodReturns: periodReturnsSchema,
				pesoEquivalents: pesoEquivalentsSchema,
				cclEquivalents: v.nullable(cclEquivalentsSchema),
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
	v.check(checkIfCclEquivalentsMatchState, messages.inconsistentCclEquivalents),
	v.check(checkIfLatestCloseMatchesLine, messages.inconsistentLatestClose),
	v.check(checkIfLatestCloseMatchesEquivalents, messages.inconsistentLatestCloseEquivalents),
	v.check(checkIfPeriodReturnsShareSessions, messages.inconsistentPeriodReturnSessions),
	v.check(checkIfSituationsMatchState, messages.inconsistentSituations),
);

const snapshotOverviewEntriesSchema = v.object(
	{
		schemaVersion: v.literal(12, messages.invalidSchemaVersion),
		priceUnit: v.picklist(['mep-dollar'], messages.invalidType),
		ranAt: v.pipe(stringSchema, v.isoTimestamp(messages.invalidTimestamp)),
		requestedThroughSession: sessionDateSchema,
		cclRateSource: v.nullable(cclRateSourceSchema),
		analyzedLines: v.pipe(v.array(analyzedLineSchema, messages.invalidType), v.readonly()),
	},
	messages.invalidType,
);

/**
 * The part of an Analysis Snapshot the web reads. `v.object` drops every other field, so a reader
 * cannot use a field that was never validated; fields are added here as pages start reading them.
 */
export const analysisSnapshotOverviewSchema = v.pipe(
	snapshotOverviewEntriesSchema,
	v.check(checkIfCclFiguresHaveCclRate, messages.cclFiguresWithoutCclRate),
);

type AnalyzedLineOverview = v.InferOutput<typeof analyzedLineVariantSchema>;
type PeriodReturnOverview = v.InferOutput<typeof periodReturnSchema>;

type AvailableLineOverview = Extract<AnalyzedLineOverview, { status: 'available' }>;
type LatestStateEquivalents = AvailableLineOverview['pesoEquivalents'];

// Peso equivalents convert the latest State's own swings at its own session's rate, so a reader
// that finds them on another session or for a missing swing has a snapshot it cannot trust.
function checkIfPesoEquivalentsMatchState(line: AnalyzedLineOverview): boolean {
	if (line.status !== 'available') {
		return true;
	}

	return checkIfEquivalentsMatchState(line.pesoEquivalents, line.latestState);
}

// CCL equivalents are `null` when the State's session has no CCL Rate; otherwise they follow the
// peso rule.
function checkIfCclEquivalentsMatchState(line: AnalyzedLineOverview): boolean {
	if (line.status !== 'available' || line.cclEquivalents === null) {
		return true;
	}

	return checkIfEquivalentsMatchState(line.cclEquivalents, line.latestState);
}

// The latest close describes the State's session, and its CCL part exists exactly when the CCL
// equivalents do, since both need that session's CCL Rate.
function checkIfLatestCloseMatchesLine(line: AnalyzedLineOverview): boolean {
	if (line.status !== 'available') {
		return true;
	}

	const { latestClose, latestState, cclEquivalents } = line;
	const { sessionDate, previousSessionDate } = latestClose;
	const isSameSession = sessionDate === latestState.sessionDate;
	const isPreviousEarlier = previousSessionDate === null || previousSessionDate < sessionDate;
	const hasMatchingCcl = (latestClose.ccl === null) === (cclEquivalents === null);

	return isSameSession && isPreviousEarlier && hasMatchingCcl;
}

// The latest close's peso and CCL closes are the equivalents' closes, written from the same session's
// close and rate, so they are equal to the last bit.
function checkIfLatestCloseMatchesEquivalents(line: AnalyzedLineOverview): boolean {
	if (line.status !== 'available') {
		return true;
	}

	const { latestClose, pesoEquivalents, cclEquivalents } = line;
	const hasMatchingPesoClose = latestClose.peso.close === pesoEquivalents.close;
	const hasMatchingCclClose =
		latestClose.ccl === null ||
		cclEquivalents === null ||
		latestClose.ccl.close === cclEquivalents.close;

	return hasMatchingPesoClose && hasMatchingCclClose;
}

// Every currency's returns count windows over the Dollarized Series' sessions. A peso close exists
// on each of them, so a peso return starts where the MEP one does; a CCL return starts there too,
// unless that session or the anchor has no CCL Rate.
function checkIfPeriodReturnsShareSessions(line: AnalyzedLineOverview): boolean {
	if (line.status !== 'available') {
		return true;
	}

	const { periodReturns, pesoPeriodReturns, cclPeriodReturns } = line;
	const isSameLength =
		pesoPeriodReturns.length === periodReturns.length &&
		cclPeriodReturns.length === periodReturns.length;

	if (!isSameLength) {
		return false;
	}

	return periodReturns.every((mepReturn, index) => {
		const pesoReturn = pesoPeriodReturns[index]!;
		const cclReturn = cclPeriodReturns[index]!;
		const isSameWindow = checkIfSameWindow(mepReturn, pesoReturn, cclReturn);
		const isPesoStartShared = pesoReturn.fromSessionDate === mepReturn.fromSessionDate;
		const isCclStartShared =
			cclReturn.fromSessionDate === null ||
			cclReturn.fromSessionDate === mepReturn.fromSessionDate;

		return isSameWindow && isPesoStartShared && isCclStartShared;
	});
}

function checkIfSameWindow(
	mepReturn: PeriodReturnOverview,
	pesoReturn: PeriodReturnOverview,
	cclReturn: PeriodReturnOverview,
): boolean {
	return (
		pesoReturn.windowMonths === mepReturn.windowMonths &&
		cclReturn.windowMonths === mepReturn.windowMonths
	);
}

// Every CCL figure divides by a CCL Rate, so a run without one has none to write.
function checkIfCclFiguresHaveCclRate(
	snapshot: v.InferOutput<typeof snapshotOverviewEntriesSchema>,
): boolean {
	if (snapshot.cclRateSource !== null) {
		return true;
	}

	return snapshot.analyzedLines.every((line) => !checkIfLineHasCclFigure(line));
}

function checkIfLineHasCclFigure(line: AnalyzedLineOverview): boolean {
	if (line.status !== 'available') {
		return false;
	}

	// The line's own check ties its CCL equivalents to its CCL close, so the close stands for both.
	const hasCclClose = line.latestClose.ccl !== null;
	const hasCclReturn = line.cclPeriodReturns.some((entry) => entry.fromSessionDate !== null);
	const hasCclEvent = line.events.some(
		({ event }) => event.type === 'structure-break' && event.cclEquivalents !== null,
	);

	return hasCclClose || hasCclReturn || hasCclEvent;
}

function checkIfEquivalentsMatchState(
	equivalents: Omit<LatestStateEquivalents, 'mepRate'>,
	latestState: AvailableLineOverview['latestState'],
): boolean {
	const isSameSession = equivalents.sessionDate === latestState.sessionDate;
	const hasMatchingHigh =
		(equivalents.lastConfirmedSwingHigh === null) ===
		(latestState.lastConfirmedSwingHigh === null);
	const hasMatchingLow =
		(equivalents.lastConfirmedSwingLow === null) ===
		(latestState.lastConfirmedSwingLow === null);
	const hasMatchingTippingCloses =
		(equivalents.regimeTippingCloses === null) === (latestState.regimeTippingCloses === null);

	return isSameSession && hasMatchingHigh && hasMatchingLow && hasMatchingTippingCloses;
}

type SwingOverview = Readonly<{
	price: number;
	occurredAtSession: string;
	confirmedAtSession: string;
}>;

// A Situation is a conjunction of State parts, so one the State's own parts contradict means the
// snapshot cannot be trusted.
function checkIfSituationsMatchState(line: AnalyzedLineOverview): boolean {
	if (line.status !== 'available') {
		return true;
	}

	const { latestState } = line;
	return latestState.situations.every((situation) => {
		if (situation.type === 'below-last-confirmed-low-in-bearish-regime') {
			const low = latestState.lastConfirmedSwingLow;
			const isBelowLow =
				low?.closePosition === 'below' && checkIfSameSwing(low, situation.level);
			return latestState.regime === 'bearish' && isBelowLow;
		}

		const high = latestState.lastConfirmedSwingHigh;
		const isAboveHigh =
			high?.closePosition === 'above' && checkIfSameSwing(high, situation.level);
		return latestState.regime === 'bullish' && isAboveHigh;
	});
}

function checkIfSameSwing(stateSwing: SwingOverview, level: SwingOverview): boolean {
	return (
		stateSwing.price === level.price &&
		stateSwing.occurredAtSession === level.occurredAtSession &&
		stateSwing.confirmedAtSession === level.confirmedAtSession
	);
}
