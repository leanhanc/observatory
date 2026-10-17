import { describe, expect, test } from 'bun:test';

import {
	createAnalysisSnapshotStorageFromS3Client,
	parseAnalysisSnapshotOverview,
} from './analysis-snapshot-storage.ts';

import type { AnalysisSnapshot } from './analysis-run.types.ts';

const snapshot: AnalysisSnapshot = {
	schemaVersion: 12,
	priceUnit: 'mep-dollar',
	ranAt: '2026-10-04T15:00:00.000Z',
	requestedThroughSession: '2026-10-02',
	analysisConfigurationVersion: 1,
	mepRateSource: {
		pesoBondTradingLineId: 'al30-bond-byma-ars',
		dollarBondTradingLineId: 'al30-bond-byma-usd-mep',
		latestRateSessionDate: '2026-10-02',
		acceptedZeroOpens: [],
		rangeRepairs: [],
	},
	cclRateSource: {
		pesoBondTradingLineId: 'al30-bond-byma-ars',
		cableBondTradingLineId: 'al30-bond-byma-usd-ccl',
		latestRateSessionDate: '2026-10-02',
	},
	analyzedLines: [],
	corporateActionWatch: {
		status: 'available',
		publishedFrom: '2026-09-26',
		publishedThrough: '2026-10-02',
		candidates: [],
	},
};
const DATED_KEY = 'analysis-snapshots/v12/2026-10-02/2026-10-04T15:00:00.000Z.json';
const LATEST_KEY = 'analysis-snapshots/v12/latest.json';

describe('createAnalysisSnapshotStorageFromS3Client', () => {
	test('writes the dated snapshot before latest', async () => {
		const client = createFakeS3Client();
		const storage = createAnalysisSnapshotStorageFromS3Client(client);

		const result = await storage.write(snapshot);

		expect(result).toEqual({ ok: true, locations: [DATED_KEY, LATEST_KEY] });
		expect(client.writtenKeys).toEqual([DATED_KEY, LATEST_KEY]);
		expect(JSON.parse(client.writtenData[0]!)).toEqual(snapshot);
		expect(client.writtenData[1]).toBe(client.writtenData[0]);
	});

	test('does not replace latest when the dated write fails', async () => {
		const client = createFakeS3Client(DATED_KEY);
		const storage = createAnalysisSnapshotStorageFromS3Client(client);

		const result = await storage.write(snapshot);

		expect(result).toEqual({
			ok: false,
			message: `The snapshot could not be written to ${DATED_KEY}.`,
		});
		expect(client.writtenKeys).toEqual([]);
	});

	test('reports a dated snapshot whose latest replacement failed', async () => {
		const client = createFakeS3Client(LATEST_KEY);
		const storage = createAnalysisSnapshotStorageFromS3Client(client);

		const result = await storage.write(snapshot);

		expect(result).toEqual({
			ok: false,
			message: `The snapshot was written to ${DATED_KEY}, but ${LATEST_KEY} could not be replaced.`,
		});
		expect(client.writtenKeys).toEqual([DATED_KEY]);
	});
});

describe('parseAnalysisSnapshotOverview', () => {
	const latestState = {
		sessionDate: '2026-10-02',
		regime: 'mixed',
		pendingRegimeTransition: {
			candidate: 'bearish',
			confirmations: 2,
			requiredConfirmations: 3,
		},
		regimeTippingCloses: {
			bullish: { closeAbove: 7.4, isFastEmaAligned: false },
			bearish: { closeBelow: 7.0, isFastEmaAligned: true },
		},
		structure: 'downtrend',
		lastConfirmedSwingHigh: {
			kind: 'high',
			price: 7.5,
			occurredAtSession: '2026-09-01',
			confirmedAtSession: '2026-09-04',
			priceRelativeToSwingInPercent: -5,
			closePosition: 'at-or-below',
		},
		lastConfirmedSwingLow: null,
		rsi: null,
		priceRelativeToEmaInAtr: -1.39,
		priceRelativeToLongTermEmaInPercent: -4.2,
		situations: [],
	} as const;
	const swingLow = {
		kind: 'low',
		price: 7.2,
		occurredAtSession: '2026-09-20',
		confirmedAtSession: '2026-09-23',
	} as const;
	const bearishBelowLowState = {
		...latestState,
		regime: 'bearish',
		lastConfirmedSwingLow: {
			...swingLow,
			priceRelativeToSwingInPercent: -1,
			closePosition: 'below',
		},
		situations: [
			{
				type: 'below-last-confirmed-low-in-bearish-regime',
				activeSinceSession: '2026-09-29',
				level: swingLow,
				isBeyondNoiseBand: false,
			},
		],
	} as const;
	const {
		priceRelativeToSwingInPercent: _swingDistance,
		closePosition: _position,
		...swingHigh
	} = latestState.lastConfirmedSwingHigh;
	const bullishAboveHighState = {
		...latestState,
		regime: 'bullish',
		lastConfirmedSwingHigh: {
			...latestState.lastConfirmedSwingHigh,
			priceRelativeToSwingInPercent: 2,
			closePosition: 'above',
		},
		situations: [
			{
				type: 'above-last-confirmed-high-in-bullish-regime',
				activeSinceSession: '2026-09-29',
				level: swingHigh,
				isBeyondNoiseBand: null,
			},
		],
	} as const;
	const periodReturns = [
		{ windowMonths: 1, fromSessionDate: '2026-09-02', percentChange: -6.5 },
		{ windowMonths: 3, fromSessionDate: '2026-07-01', percentChange: 0 },
		{ windowMonths: 12, fromSessionDate: null, percentChange: null },
	] as const;
	const volatileSession = {
		sessionDate: '2026-09-30',
		event: {
			type: 'volatile-session',
			trueRange: 0.52,
			baselineAtr: 0.18,
			baselineThroughSessionDate: '2026-09-29',
			atrMultiple: 2.85,
		},
		coincidesWithLargeMove: false,
	} as const;
	const structureBreak = {
		sessionDate: '2026-10-01',
		event: {
			type: 'structure-break',
			direction: 'downward',
			priorStructure: 'uptrend',
			definingSwing: {
				kind: 'low',
				price: 3.5,
				occurredAtSession: '2026-09-22',
				confirmedAtSession: '2026-09-25',
			},
			closePrice: 3.476,
			pesoEquivalents: { mepRate: 1500, closePrice: 5215, definingSwingPrice: 5250 },
			cclEquivalents: { cclRate: 1600, closePrice: 3.259_375, definingSwingPrice: 3.281_25 },
		},
		coincidesWithLargeMove: false,
	} as const;
	const pesoEquivalents = {
		sessionDate: '2026-10-02',
		mepRate: 1500,
		close: 10_687.5,
		lastConfirmedSwingHigh: 11_250,
		lastConfirmedSwingLow: null,
		regimeTippingCloses: { bullishCloseAbove: 11_100, bearishCloseBelow: 10_500 },
	} as const;
	const pesoPeriodReturns = [
		{ windowMonths: 1, fromSessionDate: '2026-09-02', percentChange: -4.1 },
		{ windowMonths: 3, fromSessionDate: '2026-07-01', percentChange: 6.2 },
		{ windowMonths: 12, fromSessionDate: null, percentChange: null },
	] as const;
	const cclPeriodReturns = [
		{ windowMonths: 1, fromSessionDate: null, percentChange: null },
		{ windowMonths: 3, fromSessionDate: '2026-07-01', percentChange: -1.3 },
		{ windowMonths: 12, fromSessionDate: null, percentChange: null },
	] as const;
	const cclEquivalents = {
		sessionDate: '2026-10-02',
		cclRate: 1600,
		close: 6.679_687_5,
		lastConfirmedSwingHigh: 7.031_25,
		lastConfirmedSwingLow: null,
		regimeTippingCloses: { bullishCloseAbove: 6.937_5, bearishCloseBelow: 6.5625 },
	} as const;
	const latestClose = {
		sessionDate: '2026-10-02',
		previousSessionDate: '2026-10-01',
		peso: { close: 10_687.5, previousClose: 10_500, change: 187.5, percentChange: 1.7857 },
		mep: { close: 7.125, previousClose: 7.1, change: 0.025, percentChange: 0.3521 },
		ccl: { close: 6.679_687_5, previousClose: null, change: null, percentChange: null },
	} as const;
	const availableLine = {
		status: 'available',
		instrumentId: 'ggal',
		tradingLineId: 'ggal-stock-byma-ars',
		latestState,
		latestClose,
		periodReturns,
		pesoPeriodReturns,
		cclPeriodReturns,
		pesoEquivalents,
		cclEquivalents,
		events: [volatileSession, structureBreak],
		largeMoves: [],
	};
	const liquidity = { participation: 1, medianDailyTradedValueUsd: 43_290 };
	const unavailableLine = {
		status: 'unavailable',
		instrumentId: 'meli',
		tradingLineId: 'meli-cedear-byma-ars',
		reason: 'insufficient-liquidity',
		message: 'The line did not trade often enough.',
		liquidity,
		corporateActions: [],
	};
	const v12Snapshot = { ...snapshot, analyzedLines: [availableLine, unavailableLine] };

	test('returns the run metadata and the fields the line pages read', () => {
		const result = parseAnalysisSnapshotOverview(JSON.stringify(v12Snapshot));

		expect(result).toEqual({
			ok: true,
			snapshot: {
				schemaVersion: 12,
				priceUnit: 'mep-dollar',
				ranAt: '2026-10-04T15:00:00.000Z',
				requestedThroughSession: '2026-10-02',
				cclRateSource: snapshot.cclRateSource,
				analyzedLines: [
					{
						status: 'available',
						instrumentId: 'ggal',
						tradingLineId: 'ggal-stock-byma-ars',
						latestState,
						latestClose,
						periodReturns,
						pesoPeriodReturns,
						cclPeriodReturns,
						pesoEquivalents,
						cclEquivalents,
						events: [volatileSession, structureBreak],
					},
					{
						status: 'unavailable',
						instrumentId: 'meli',
						tradingLineId: 'meli-cedear-byma-ars',
						reason: 'insufficient-liquidity',
						message: 'The line did not trade often enough.',
						liquidity,
					},
				],
			},
		});
	});

	test('accepts a ranAt with nanoseconds, as the run writes it', () => {
		const nanosecondSnapshot = { ...v12Snapshot, ranAt: '2026-10-10T09:02:43.04013226Z' };

		const result = parseAnalysisSnapshotOverview(JSON.stringify(nanosecondSnapshot));

		expect(result).toMatchObject({
			ok: true,
			snapshot: { ranAt: '2026-10-10T09:02:43.04013226Z' },
		});
	});

	test.each([5, 6, 7, 8, 9, 10, 11, 13])('rejects schema version %d', (schemaVersion) => {
		const otherSnapshot = { ...v12Snapshot, schemaVersion };

		const result = parseAnalysisSnapshotOverview(JSON.stringify(otherSnapshot));

		expect(result).toEqual({
			ok: false,
			reason: 'invalid-snapshot',
			message: 'The snapshot is invalid. schemaVersion: Schema version must be 12.',
		});
	});

	test('rejects a snapshot without a known price unit', () => {
		const { priceUnit: _priceUnit, ...snapshotWithoutUnit } = v12Snapshot;
		const pesoSnapshot = { ...v12Snapshot, priceUnit: 'ars' };

		const resultWithoutUnit = parseAnalysisSnapshotOverview(
			JSON.stringify(snapshotWithoutUnit),
		);
		const pesoResult = parseAnalysisSnapshotOverview(JSON.stringify(pesoSnapshot));

		expect(resultWithoutUnit).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
		expect(pesoResult).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
	});

	test('rejects a v6 line and malformed watch levels', () => {
		const {
			pendingRegimeTransition: _pending,
			lastConfirmedSwingHigh: _high,
			lastConfirmedSwingLow: _low,
			...v6State
		} = latestState;
		const malformedStates = [
			v6State,
			{
				...latestState,
				pendingRegimeTransition: {
					candidate: 'bearish',
					confirmations: 3,
					requiredConfirmations: 3,
				},
			},
			{
				...latestState,
				lastConfirmedSwingHigh: { ...latestState.lastConfirmedSwingHigh, kind: 'low' },
			},
			{
				...latestState,
				lastConfirmedSwingHigh: {
					...latestState.lastConfirmedSwingHigh,
					confirmedAtSession: '2026-02-30',
				},
			},
		];

		const { pesoEquivalents: _pesoEquivalents, ...lineWithoutPesoEquivalents } = availableLine;
		const pesoResult = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, analyzedLines: [lineWithoutPesoEquivalents] }),
		);
		expect(pesoResult).toMatchObject({ ok: false, reason: 'invalid-snapshot' });

		for (const malformedState of malformedStates) {
			const line = { ...availableLine, latestState: malformedState };
			const result = parseAnalysisSnapshotOverview(
				JSON.stringify({ ...v12Snapshot, analyzedLines: [line] }),
			);

			expect(result).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
		}
	});

	test('returns an active Situation that agrees with its State', () => {
		const line = {
			...availableLine,
			latestState: bearishBelowLowState,
			pesoEquivalents: { ...pesoEquivalents, lastConfirmedSwingLow: 10_800 },
			cclEquivalents: { ...cclEquivalents, lastConfirmedSwingLow: 6.75 },
		};

		const result = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, analyzedLines: [line] }),
		);

		expect(result).toMatchObject({
			ok: true,
			snapshot: { analyzedLines: [{ latestState: bearishBelowLowState }] },
		});
	});

	function parseStateSnapshot(state: object) {
		const line = { ...availableLine, latestState: state };
		return parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, analyzedLines: [line] }),
		);
	}

	test('returns an active mirror Situation, and rejects one the State contradicts', () => {
		const contradictedStates = [
			{ ...bullishAboveHighState, regime: 'mixed' },
			{
				...bullishAboveHighState,
				lastConfirmedSwingHigh: {
					...bullishAboveHighState.lastConfirmedSwingHigh,
					closePosition: 'at-or-below',
				},
			},
			{
				...bullishAboveHighState,
				situations: [
					{ ...bullishAboveHighState.situations[0], level: { ...swingHigh, price: 7.6 } },
				],
			},
		];
		expect(parseStateSnapshot(bullishAboveHighState)).toMatchObject({ ok: true });
		for (const contradictedState of contradictedStates) {
			expect(parseStateSnapshot(contradictedState)).toEqual({
				ok: false,
				reason: 'invalid-snapshot',
				message: expect.stringContaining('Each Situation must agree with the latest State'),
			});
		}
	});

	test('rejects a v8 Situation of either type without the noise band flag, or with a flag that is not a boolean', () => {
		const lowSituation = bearishBelowLowState.situations[0];
		const highSituation = bullishAboveHighState.situations[0];
		const { isBeyondNoiseBand: _lowFlag, ...v8LowSituation } = lowSituation;
		const { isBeyondNoiseBand: _highFlag, ...v8HighSituation } = highSituation;
		const lowLine = (situation: object) => ({
			...availableLine,
			latestState: { ...bearishBelowLowState, situations: [situation] },
			pesoEquivalents: { ...pesoEquivalents, lastConfirmedSwingLow: 10_800 },
			cclEquivalents: { ...cclEquivalents, lastConfirmedSwingLow: 6.75 },
		});
		const highLine = (situation: object) => ({
			...availableLine,
			latestState: { ...bullishAboveHighState, situations: [situation] },
		});
		const malformedLines = [
			lowLine(v8LowSituation),
			lowLine({ ...lowSituation, isBeyondNoiseBand: 'yes' }),
			highLine(v8HighSituation),
			highLine({ ...highSituation, isBeyondNoiseBand: 'yes' }),
		];

		expect(parseStateSnapshot(bullishAboveHighState)).toMatchObject({ ok: true });
		for (const line of malformedLines) {
			const result = parseAnalysisSnapshotOverview(
				JSON.stringify({ ...v12Snapshot, analyzedLines: [line] }),
			);

			expect(result).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
		}
	});

	test('rejects a v7 line, Situations the State contradicts and malformed scenario facts', () => {
		const {
			regimeTippingCloses: _tippingCloses,
			situations: _situations,
			...v7State
		} = latestState;
		const { closePosition: _closePosition, ...v7High } = latestState.lastConfirmedSwingHigh;
		const malformedStates = [
			v7State,
			{ ...latestState, lastConfirmedSwingHigh: v7High },
			{
				...latestState,
				lastConfirmedSwingHigh: {
					...latestState.lastConfirmedSwingHigh,
					closePosition: 'below',
				},
			},
			{ ...bearishBelowLowState, regime: 'mixed' },
			{
				...bearishBelowLowState,
				lastConfirmedSwingLow: {
					...bearishBelowLowState.lastConfirmedSwingLow,
					closePosition: 'at-or-above',
				},
			},
			{
				...bearishBelowLowState,
				situations: [
					{ ...bearishBelowLowState.situations[0], level: { ...swingLow, price: 7.3 } },
				],
			},
			{
				...latestState,
				situations: [
					{
						type: 'falling-knife',
						activeSinceSession: '2026-09-29',
						level: swingLow,
						isBeyondNoiseBand: true,
					},
				],
			},
		];

		for (const malformedState of malformedStates) {
			const hasLow = malformedState.lastConfirmedSwingLow !== null;
			const line = {
				...availableLine,
				latestState: malformedState,
				pesoEquivalents: {
					...pesoEquivalents,
					lastConfirmedSwingLow: hasLow ? 10_800 : null,
				},
			};
			const result = parseAnalysisSnapshotOverview(
				JSON.stringify({ ...v12Snapshot, analyzedLines: [line] }),
			);

			expect(result).toMatchObject({
				ok: false,
				reason: 'invalid-snapshot',
				message: expect.not.stringContaining('Peso equivalents'),
			});
		}
	});

	test('rejects missing or half-measured period returns', () => {
		const { periodReturns: _periodReturns, ...lineWithoutReturns } = availableLine;
		const halfMeasured = [
			{ windowMonths: 1, fromSessionDate: '2026-09-02', percentChange: null },
		];
		const zeroWindow = [{ windowMonths: 0, fromSessionDate: null, percentChange: null }];
		const malformedLines = [
			lineWithoutReturns,
			{ ...availableLine, periodReturns: halfMeasured },
			{ ...availableLine, periodReturns: zeroWindow },
		];

		for (const line of malformedLines) {
			const result = parseAnalysisSnapshotOverview(
				JSON.stringify({ ...v12Snapshot, analyzedLines: [line] }),
			);

			expect(result).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
		}
	});

	test('rejects peso equivalents that do not describe the latest State', () => {
		const inconsistentPesoEquivalents = [
			{ ...pesoEquivalents, sessionDate: '2026-10-01' },
			{ ...pesoEquivalents, lastConfirmedSwingHigh: null },
			{ ...pesoEquivalents, lastConfirmedSwingLow: 9_000 },
			{ ...pesoEquivalents, mepRate: 0 },
			{ ...pesoEquivalents, regimeTippingCloses: null },
		];

		for (const inconsistent of inconsistentPesoEquivalents) {
			const line = { ...availableLine, pesoEquivalents: inconsistent };
			const result = parseAnalysisSnapshotOverview(
				JSON.stringify({ ...v12Snapshot, analyzedLines: [line] }),
			);

			expect(result).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
		}
	});

	test('rejects a v5 Event type and a State without the long-term distance', () => {
		const v5Event = {
			...volatileSession,
			event: { ...volatileSession.event, type: 'volatility-expansion' },
		};
		const { priceRelativeToLongTermEmaInPercent: _distance, ...v5State } = latestState;
		const lineWithV5Event = { ...availableLine, events: [v5Event] };
		const lineWithV5State = { ...availableLine, latestState: v5State };

		const eventResult = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, analyzedLines: [lineWithV5Event] }),
		);
		const stateResult = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, analyzedLines: [lineWithV5State] }),
		);

		expect(eventResult).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
		expect(stateResult).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
	});

	test('rejects a v9 Structure Break, which has no peso equivalents', () => {
		const { pesoEquivalents: _pesoEquivalents, ...v9Event } = structureBreak.event;
		const lineWithV9Event = {
			...availableLine,
			events: [{ ...structureBreak, event: v9Event }],
		};

		const result = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, analyzedLines: [lineWithV9Event] }),
		);

		expect(result).toMatchObject({
			ok: false,
			reason: 'invalid-snapshot',
			message: expect.stringContaining('analyzedLines.0.events.0.event'),
		});
	});

	test.each([
		['a missing MEP Rate', { mepRate: null }],
		['a zero MEP Rate', { mepRate: 0 }],
		['a missing peso close', { closePrice: null }],
		['a missing peso swing', { definingSwingPrice: null }],
	])('rejects a Structure Break with %s', (_case, override) => {
		const event = {
			...structureBreak.event,
			pesoEquivalents: { ...structureBreak.event.pesoEquivalents, ...override },
		};
		const line = { ...availableLine, events: [{ ...structureBreak, event }] };

		const result = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, analyzedLines: [line] }),
		);

		expect(result).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
	});

	test('accepts null CCL figures, as a run without CCL Rates writes them', () => {
		const event = { ...structureBreak.event, cclEquivalents: null };
		const line = {
			...availableLine,
			cclEquivalents: null,
			latestClose: { ...latestClose, ccl: null },
			cclPeriodReturns: cclPeriodReturns.map((entry) => ({
				...entry,
				fromSessionDate: null,
				percentChange: null,
			})),
			events: [{ ...structureBreak, event }],
		};

		const result = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, cclRateSource: null, analyzedLines: [line] }),
		);

		expect(result).toMatchObject({
			ok: true,
			snapshot: {
				analyzedLines: [
					{ cclEquivalents: null, events: [{ event: { cclEquivalents: null } }] },
				],
			},
		});
	});

	test.each([
		// A later session keeps the previous session earlier, so only the same-session check rejects it.
		['another session', { sessionDate: '2026-10-05' }],
		['a previous session that is not earlier', { previousSessionDate: '2026-10-02' }],
		['no CCL part while the line has CCL equivalents', { ccl: null }],
		[
			'a previous close without its change',
			{ peso: { ...latestClose.peso, change: null, percentChange: null } },
		],
	])('rejects a latest close with %s', (_case, override) => {
		const line = { ...availableLine, latestClose: { ...latestClose, ...override } };

		const result = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, analyzedLines: [line] }),
		);

		expect(result).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
	});

	test.each([
		['a peso close other than the peso equivalents’ close', 'peso', 10_687],
		['a CCL close other than the CCL equivalents’ close', 'ccl', 6.6797],
	] as const)('rejects a latest close with %s', (_case, part, close) => {
		const line = {
			...availableLine,
			latestClose: { ...latestClose, [part]: { ...latestClose[part], close } },
		};

		const result = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, analyzedLines: [line] }),
		);

		expect(result).toMatchObject({
			ok: false,
			message: expect.stringContaining('must equal the peso and CCL equivalents’ close'),
		});
	});

	test.each([
		[
			'a peso return from another session',
			'pesoPeriodReturns',
			[
				{ ...pesoPeriodReturns[0], fromSessionDate: '2026-09-01' },
				...pesoPeriodReturns.slice(1),
			],
		],
		[
			'a CCL return from another session',
			'cclPeriodReturns',
			[
				{ ...cclPeriodReturns[1], windowMonths: 1, fromSessionDate: '2026-09-01' },
				...cclPeriodReturns.slice(1),
			],
		],
		['a peso return list missing a window', 'pesoPeriodReturns', pesoPeriodReturns.slice(0, 2)],
		['a CCL return list missing a window', 'cclPeriodReturns', cclPeriodReturns.slice(0, 2)],
		[
			'a peso return over another window',
			'pesoPeriodReturns',
			[{ ...pesoPeriodReturns[0], windowMonths: 2 }, ...pesoPeriodReturns.slice(1)],
		],
		[
			'a CCL return over another window',
			'cclPeriodReturns',
			[...cclPeriodReturns.slice(0, 2), { ...cclPeriodReturns[2], windowMonths: 6 }],
		],
	] as const)('rejects %s than the MEP returns', (_case, field, returns) => {
		const line = { ...availableLine, [field]: returns };

		const result = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, analyzedLines: [line] }),
		);

		expect(result).toMatchObject({
			ok: false,
			message: expect.stringContaining('from the same start sessions'),
		});
	});

	// The line's CCL equivalents and CCL close come together, or the line's own check rejects them
	// first.
	test.each([
		['line CCL equivalents and a CCL close', { cclEquivalents, latestClose }],
		['a CCL return with a start session', { cclPeriodReturns }],
		['a Structure Break with CCL equivalents', { events: [structureBreak] }],
	])('rejects %s in a snapshot without a CCL Rate source', (_case, cclFigure) => {
		const lineWithoutCcl = {
			...availableLine,
			cclEquivalents: null,
			latestClose: { ...latestClose, ccl: null },
			cclPeriodReturns: cclPeriodReturns.map((entry) => ({
				...entry,
				fromSessionDate: null,
				percentChange: null,
			})),
			events: [
				{ ...structureBreak, event: { ...structureBreak.event, cclEquivalents: null } },
			],
		};
		const line = { ...lineWithoutCcl, ...cclFigure };

		const result = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, cclRateSource: null, analyzedLines: [line] }),
		);

		expect(result).toMatchObject({
			ok: false,
			message: expect.stringContaining('A snapshot without a CCL Rate source'),
		});
	});

	test.each([
		['a missing CCL Rate source', undefined],
		[
			'a source without its latest session',
			{ ...snapshot.cclRateSource, latestRateSessionDate: null },
		],
		[
			'a source without its cable line',
			{ ...snapshot.cclRateSource, cableBondTradingLineId: 7 },
		],
		['a source without its peso line', { ...snapshot.cclRateSource, pesoBondTradingLineId: 7 }],
	])('rejects %s', (_case, cclRateSource) => {
		const result = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, cclRateSource }),
		);

		expect(result).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
	});

	test('rejects a CCL part of the latest close on a line without CCL equivalents', () => {
		const line = { ...availableLine, cclEquivalents: null };

		const result = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, analyzedLines: [line] }),
		);

		expect(result).toMatchObject({
			ok: false,
			message: expect.stringContaining('The latest close must describe the latest State'),
		});
	});

	test.each([
		['without the latest close', 'latestClose'],
		['without CCL equivalents', 'cclEquivalents'],
		['without peso period returns', 'pesoPeriodReturns'],
		['without CCL period returns', 'cclPeriodReturns'],
	] as const)('rejects a line %s', (_case, field) => {
		const { [field]: _removed, ...lineWithoutField } = availableLine;

		const result = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, analyzedLines: [lineWithoutField] }),
		);

		expect(result).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
	});

	test.each([
		['another session', { sessionDate: '2026-10-01' }],
		['a swing the State does not have', { lastConfirmedSwingLow: 6.5 }],
		['a missing swing the State has', { lastConfirmedSwingHigh: null }],
		['no tipping closes while the State has them', { regimeTippingCloses: null }],
		['a zero CCL Rate', { cclRate: 0 }],
	])('rejects CCL equivalents that describe %s', (_case, override) => {
		const line = { ...availableLine, cclEquivalents: { ...cclEquivalents, ...override } };

		const result = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, analyzedLines: [line] }),
		);

		expect(result).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
	});

	test.each([
		['no CCL equivalents field', undefined],
		['a zero CCL Rate', { cclRate: 0, closePrice: 3.2, definingSwingPrice: 3.3 }],
		['a missing CCL close', { cclRate: 1600, closePrice: null, definingSwingPrice: 3.3 }],
	])('rejects a Structure Break with %s', (_case, cclEventEquivalents) => {
		const { cclEquivalents: _cclEquivalents, ...eventWithoutCcl } = structureBreak.event;
		const event =
			cclEventEquivalents === undefined
				? eventWithoutCcl
				: { ...eventWithoutCcl, cclEquivalents: cclEventEquivalents };
		const line = { ...availableLine, events: [{ ...structureBreak, event }] };

		const result = parseAnalysisSnapshotOverview(
			JSON.stringify({ ...v12Snapshot, analyzedLines: [line] }),
		);

		expect(result).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
	});

	test('rejects data that is not JSON', () => {
		const result = parseAnalysisSnapshotOverview('{"schemaVersion": 6,');

		expect(result).toEqual({
			ok: false,
			reason: 'invalid-snapshot',
			message: 'The snapshot is not valid JSON.',
		});
	});

	test('rejects a line with an unknown status', () => {
		const pendingLine = { ...availableLine, status: 'pending' };
		const malformedSnapshot = { ...v12Snapshot, analyzedLines: [pendingLine] };

		const result = parseAnalysisSnapshotOverview(JSON.stringify(malformedSnapshot));

		expect(result).toMatchObject({
			ok: false,
			reason: 'invalid-snapshot',
			message: expect.stringContaining('analyzedLines.0.status'),
		});
	});

	test('rejects an available line without a latest State', () => {
		const { latestState: _latestState, ...lineWithoutState } = availableLine;
		const malformedSnapshot = { ...v12Snapshot, analyzedLines: [lineWithoutState] };

		const result = parseAnalysisSnapshotOverview(JSON.stringify(malformedSnapshot));

		expect(result).toMatchObject({
			ok: false,
			reason: 'invalid-snapshot',
			message: expect.stringContaining('analyzedLines.0.latestState'),
		});
	});

	test('rejects an Event of an unknown type', () => {
		const unknownEvent = { ...volatileSession, event: { type: 'gap-up' } };
		const lineWithUnknownEvent = { ...availableLine, events: [unknownEvent] };
		const malformedSnapshot = { ...v12Snapshot, analyzedLines: [lineWithUnknownEvent] };

		const result = parseAnalysisSnapshotOverview(JSON.stringify(malformedSnapshot));

		expect(result).toMatchObject({
			ok: false,
			reason: 'invalid-snapshot',
			message: expect.stringContaining('analyzedLines.0.events.0.event.type'),
		});
	});

	test('rejects an insufficiently liquid line without its liquidity measures', () => {
		const { liquidity: _liquidity, ...lineWithoutLiquidity } = unavailableLine;
		const malformedSnapshot = { ...v12Snapshot, analyzedLines: [lineWithoutLiquidity] };

		const result = parseAnalysisSnapshotOverview(JSON.stringify(malformedSnapshot));

		expect(result).toMatchObject({
			ok: false,
			reason: 'invalid-snapshot',
			message: expect.stringContaining('analyzedLines.0.liquidity'),
		});
	});

	test('rejects a requested-through session that is not a real date', () => {
		const malformedSnapshot = { ...v12Snapshot, requestedThroughSession: '2026-02-30' };

		const result = parseAnalysisSnapshotOverview(JSON.stringify(malformedSnapshot));

		expect(result).toEqual({
			ok: false,
			reason: 'invalid-snapshot',
			message:
				'The snapshot is invalid. requestedThroughSession: Value must be a real YYYY-MM-DD date.',
		});
	});

	test('rejects a snapshot without analyzed lines', () => {
		const { analyzedLines: _analyzedLines, ...snapshotWithoutLines } = v12Snapshot;

		const result = parseAnalysisSnapshotOverview(JSON.stringify(snapshotWithoutLines));

		expect(result).toMatchObject({ ok: false, reason: 'invalid-snapshot' });
	});
});

describe('readLatest', () => {
	test('reads and validates latest', async () => {
		const client = createFakeS3Client();
		client.storedObjects.set(LATEST_KEY, JSON.stringify(snapshot));
		const storage = createAnalysisSnapshotStorageFromS3Client(client);

		const result = await storage.readLatest();

		expect(client.readKeys).toEqual([LATEST_KEY]);
		expect(result).toMatchObject({ ok: true, snapshot: { ranAt: snapshot.ranAt } });
	});

	test('reports a missing latest as not found', async () => {
		const storage = createAnalysisSnapshotStorageFromS3Client(createFakeS3Client());

		const result = await storage.readLatest();

		expect(result).toEqual({
			ok: false,
			reason: 'not-found',
			message: `${LATEST_KEY} does not exist.`,
		});
	});

	test('reports any other read error as a failed read', async () => {
		const storage = createAnalysisSnapshotStorageFromS3Client(createFakeS3Client(LATEST_KEY));

		const result = await storage.readLatest();

		expect(result).toEqual({
			ok: false,
			reason: 'read-failed',
			message: `${LATEST_KEY} could not be read.`,
		});
	});
});

function createFakeS3Client(failingKey: string | null = null) {
	const writtenKeys: string[] = [];
	const writtenData: string[] = [];
	const readKeys: string[] = [];
	const storedObjects = new Map<string, string>();

	return {
		writtenKeys,
		writtenData,
		readKeys,
		storedObjects,
		file: (path: string) => ({
			text: () => {
				readKeys.push(path);

				if (path === failingKey) {
					return Promise.reject(new Error('bucket unavailable'));
				}

				const storedObject = storedObjects.get(path);

				if (storedObject === undefined) {
					return Promise.reject(
						Object.assign(new Error('The specified key does not exist.'), {
							code: 'NoSuchKey',
						}),
					);
				}

				return Promise.resolve(storedObject);
			},
		}),
		write: (path: string, data: string) => {
			if (path === failingKey) {
				return Promise.reject(new Error('bucket unavailable'));
			}

			writtenKeys.push(path);
			writtenData.push(data);
			return Promise.resolve(data.length);
		},
	};
}
