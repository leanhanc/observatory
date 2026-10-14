import { describe, expect, test } from 'bun:test';

import {
	describeEvent,
	describeLevels,
	describeLongTermDistance,
	describeMomentum,
	describePattern,
	describePendingTransition,
	describePeriodReturns,
	describeRawEvidence,
	describeShortTermStretch,
	describeSwingDates,
	describeTippingPoints,
	describeTrend,
	describeUnavailableLine,
	formatLevelPrice,
} from './line-wording.ts';

import type { AvailableLine, SnapshotEvent } from '#web/lib/utils/snapshot-pages/index.ts';
import type { Phrase, PriceContext } from './line-wording.types.ts';

type SnapshotState = AvailableLine['latestState'];
type SnapshotSituation = SnapshotState['situations'][number];

const NBSP = ' ';
const PESO_LINE: PriceContext = { priceUnit: 'mep-dollar', isPesoLine: true };
const DOLLAR_LINE: PriceContext = { priceUnit: 'mep-dollar', isPesoLine: false };

const swingLow = {
	kind: 'low',
	price: 3.68,
	occurredAtSession: '2026-10-01',
	confirmedAtSession: '2026-10-06',
} as const;
const swingHigh = {
	kind: 'high',
	price: 4.04,
	occurredAtSession: '2026-10-06',
	confirmedAtSession: '2026-10-09',
} as const;

// GGAL on 9 Oct 2026: bearish, in a downtrend, between its last confirmed low and high.
const ggalState: SnapshotState = {
	sessionDate: '2026-10-09',
	regime: 'bearish',
	pendingRegimeTransition: null,
	regimeTippingCloses: {
		bullish: { closeAbove: 4.77, isFastEmaAligned: false },
		bearish: { closeBelow: 4.21, isFastEmaAligned: true },
	},
	structure: 'downtrend',
	lastConfirmedSwingHigh: {
		...swingHigh,
		priceRelativeToSwingInPercent: -4.5,
		closePosition: 'at-or-below',
	},
	lastConfirmedSwingLow: {
		...swingLow,
		priceRelativeToSwingInPercent: 4.9,
		closePosition: 'at-or-above',
	},
	rsi: 34.2,
	priceRelativeToEmaInAtr: -1.43,
	priceRelativeToLongTermEmaInPercent: -17.8,
	situations: [],
};
const ggalPesoEquivalents: AvailableLine['pesoEquivalents'] = {
	sessionDate: '2026-10-09',
	mepRate: 1540,
	close: 5940,
	lastConfirmedSwingHigh: 6223,
	lastConfirmedSwingLow: 5662,
	regimeTippingCloses: { bullishCloseAbove: 7344, bearishCloseBelow: 6480 },
};

describe('describeTrend', () => {
	test('reads each Regime as a trend, and a missing Regime as too little history', () => {
		expect(describeTrend('bearish')).toEqual([
			{ strong: 'Tendencia bajista.' },
			' Se confirmó con el precio y la media de 50 ruedas por debajo de la de 200.',
		]);
		expect(describeTrend('mixed')[0]).toEqual({ strong: 'Tendencia indefinida.' });
		expect(describeTrend('bullish')[0]).toEqual({ strong: 'Tendencia alcista.' });
		expect(describeTrend(null)).toEqual([
			{ strong: 'Sin historia suficiente' },
			' para leer la tendencia (hacen falta unas 200 ruedas).',
		]);
	});
});

describe('describePeriodReturns', () => {
	test('names each window and shows an unavailable one as a dash, never as zero', () => {
		const periodReturns = [
			{ windowMonths: 1, fromSessionDate: '2026-09-10', percentChange: -17.04 },
			{ windowMonths: 3, fromSessionDate: '2026-07-09', percentChange: -27.3 },
			{ windowMonths: 12, fromSessionDate: null, percentChange: null },
		];

		expect(toText(describePeriodReturns(periodReturns, 'mep-dollar'))).toBe(
			`−17,0${NBSP}% en un mes · −27,3${NBSP}% en tres meses · — en un año (sin historia suficiente) (en dólares MEP)`,
		);
	});

	test('shows a rise with a plus sign', () => {
		const periodReturns = [
			{ windowMonths: 12, fromSessionDate: '2025-10-01', percentChange: 41.6 },
		];

		expect(describePeriodReturns(periodReturns, 'mep-dollar')[0]).toEqual({
			strong: `+41,6${NBSP}%`,
		});
	});
});

describe('describeLongTermDistance', () => {
	test('says how far and on which side of the 200-session average the close is', () => {
		expect(toText(describeLongTermDistance(-17.8)!)).toBe(
			`El cierre está 17,8${NBSP}% por debajo de su media móvil de 200 ruedas.`,
		);
		expect(toText(describeLongTermDistance(3.2)!)).toContain('3,2 % por encima');
	});

	test('shows nothing while the average is not readable', () => {
		expect(describeLongTermDistance(null)).toBeNull();
	});
});

describe('describeLevels', () => {
	test('between both levels: support below and resistance above, peso equivalents first', () => {
		expect(describeLevels(ggalState, ggalPesoEquivalents, PESO_LINE).map(toText)).toEqual([
			`Soporte en 5.662${NBSP}pesos (US$${NBSP}3,68): el cierre está 4,9${NBSP}% por encima.`,
			`Resistencia en 6.223${NBSP}pesos (US$${NBSP}4,04): el cierre está 4,5${NBSP}% por debajo.`,
		]);
	});

	test('a line not traded in pesos shows the analyzed price only', () => {
		expect(toText(describeLevels(ggalState, ggalPesoEquivalents, DOLLAR_LINE)[0]!)).toBe(
			`Soporte en US$${NBSP}3,68: el cierre está 4,9${NBSP}% por encima.`,
		);
	});

	test('below the low within the noise band (PEP) gets the calm label with its distance', () => {
		const pepState = buildBelowLowState(-0.8, false);

		expect(describeLevels(pepState, ggalPesoEquivalents, PESO_LINE)[0]).toEqual([
			{ strong: 'Debajo de su último mínimo confirmado' },
			` (−0,8${NBSP}%): ya no hay un soporte confirmado.`,
		]);
	});

	test('below the low beyond the noise band in a bearish Regime (LAC) reads as falling with no floor', () => {
		const lacState = buildBelowLowState(-12.8, true);

		expect(describeLevels(lacState, ggalPesoEquivalents, PESO_LINE)[0]).toEqual([
			{ strong: 'Caída sin piso confirmado.' },
			` El cierre está 12,8${NBSP}% por debajo de su último mínimo confirmado y todavía no se confirmó un mínimo nuevo.`,
		]);
	});

	test('the label follows the flag, not the size of the distance', () => {
		// A large distance with the flag off, as for an unreadable ATR, still reads calm.
		const unflaggedState = buildBelowLowState(-12.8, null);

		expect(describeLevels(unflaggedState, ggalPesoEquivalents, PESO_LINE)[0]![0]).toEqual({
			strong: 'Debajo de su último mínimo confirmado',
		});
	});

	test('an unmeasured flag above the high reads calm too', () => {
		const unflaggedState = buildAboveHighState(52.1, null);

		expect(describeLevels(unflaggedState, ggalPesoEquivalents, PESO_LINE)[1]![0]).toEqual({
			strong: 'Por encima de su último máximo confirmado',
		});
	});

	test('below the low without an active Situation, as in a mixed Regime, reads calm', () => {
		const mixedBelowLowState: SnapshotState = {
			...buildBelowLowState(-12.8, true),
			regime: 'mixed',
			situations: [],
		};

		expect(describeLevels(mixedBelowLowState, ggalPesoEquivalents, PESO_LINE)[0]![0]).toEqual({
			strong: 'Debajo de su último mínimo confirmado',
		});
	});

	test('above the high within the noise band (XLV) gets the calm mirror label', () => {
		const xlvState = buildAboveHighState(0.1, false);

		expect(describeLevels(xlvState, ggalPesoEquivalents, PESO_LINE)[1]).toEqual([
			{ strong: 'Por encima de su último máximo confirmado' },
			` (+0,1${NBSP}%): no hay una resistencia confirmada arriba.`,
		]);
	});

	test('a distance that rounds to zero keeps the side the label names (GLD)', () => {
		const gldState = buildAboveHighState(0.04, false);

		expect(describeLevels(gldState, ggalPesoEquivalents, PESO_LINE)[1]![1]).toBe(
			` (+0,0${NBSP}%): no hay una resistencia confirmada arriba.`,
		);
	});

	test('above the high beyond the noise band in a bullish Regime (XP) reads as rising with no ceiling', () => {
		const xpState = buildAboveHighState(52.1, true);

		expect(describeLevels(xpState, ggalPesoEquivalents, PESO_LINE)[1]).toEqual([
			{ strong: 'Subida sin techo confirmado.' },
			` El cierre está 52,1${NBSP}% por encima de su último máximo confirmado y todavía no se confirmó un máximo nuevo.`,
		]);
	});

	test('no confirmed level at all, or only one', () => {
		const noLevels = {
			...ggalState,
			lastConfirmedSwingLow: null,
			lastConfirmedSwingHigh: null,
		};
		const onlyHigh = { ...ggalState, lastConfirmedSwingLow: null };

		expect(describeLevels(noLevels, ggalPesoEquivalents, PESO_LINE)).toEqual([
			['Todavía no hay máximos ni mínimos confirmados.'],
		]);
		expect(describeLevels(onlyHigh, ggalPesoEquivalents, PESO_LINE)[0]).toEqual([
			'Todavía no hay un mínimo confirmado.',
		]);
	});
});

describe('describePattern', () => {
	test('a downtrend breaks with a close above the last confirmed high, which alone does not change the trend', () => {
		const phrase = describePattern(ggalState, ggalPesoEquivalents, PESO_LINE);

		expect(toText(phrase)).toBe(
			`Un cierre por encima de 6.223${NBSP}pesos (US$${NBSP}4,04) rompería el patrón descendente: los máximos dejarían de ser cada vez más bajos. Por sí solo, no cambia la tendencia.`,
		);
		expect(phrase).toContainEqual({ strong: `6.223${NBSP}pesos` });
		expect(phrase).toContainEqual({ strong: 'patrón descendente' });
	});

	test('an uptrend breaks with a close below the last confirmed low', () => {
		const uptrendState: SnapshotState = { ...ggalState, structure: 'uptrend', regime: 'mixed' };

		expect(toText(describePattern(uptrendState, ggalPesoEquivalents, PESO_LINE))).toBe(
			`Un cierre por debajo de 5.662${NBSP}pesos (US$${NBSP}3,68) rompería el patrón ascendente: los mínimos dejarían de ser cada vez más altos. Por sí solo, no cambia la tendencia.`,
		);
	});

	test('a break says nothing about the trend while the trend is not readable', () => {
		const warmUpTrend: SnapshotState = { ...ggalState, regime: null };

		expect(toText(describePattern(warmUpTrend, ggalPesoEquivalents, PESO_LINE))).toBe(
			`Un cierre por encima de 6.223${NBSP}pesos (US$${NBSP}4,04) rompería el patrón descendente: los máximos dejarían de ser cada vez más bajos.`,
		);
	});

	test('a line not traded in pesos names the analyzed price alone', () => {
		expect(toText(describePattern(ggalState, ggalPesoEquivalents, DOLLAR_LINE))).toBe(
			`Un cierre por encima de US$${NBSP}4,04 rompería el patrón descendente: los máximos dejarían de ser cada vez más bajos. Por sí solo, no cambia la tendencia.`,
		);
	});

	test('a break level beyond a tipping point does not claim the trend stays as it is (PAMP)', () => {
		// PAMP on 13 Oct 2026: a mixed trend in a downtrend whose break level, 5.336 pesos, lies above
		// the bullish tipping point, 5.288 pesos. Closes there would also be closes that turn the
		// trend, so the pattern line must not say the trend stays mixed.
		const pampState: SnapshotState = {
			...ggalState,
			regime: 'mixed',
			lastConfirmedSwingHigh: { ...ggalState.lastConfirmedSwingHigh!, price: 3.465 },
			regimeTippingCloses: {
				bullish: { closeAbove: 3.4337, isFastEmaAligned: true },
				bearish: { closeBelow: 3.3308, isFastEmaAligned: false },
			},
		};
		const pampPesoEquivalents: AvailableLine['pesoEquivalents'] = {
			...ggalPesoEquivalents,
			lastConfirmedSwingHigh: 5336,
			regimeTippingCloses: { bullishCloseAbove: 5288, bearishCloseBelow: 5129 },
		};
		const patternText = toText(describePattern(pampState, pampPesoEquivalents, PESO_LINE));

		expect(patternText).toBe(
			`Un cierre por encima de 5.336${NBSP}pesos (US$${NBSP}3,47) rompería el patrón descendente: los máximos dejarían de ser cada vez más bajos. Por sí solo, no cambia la tendencia.`,
		);
		expect(patternText).not.toContain('seguiría siendo');
	});

	test('a trending pattern without its break level reads without a break sentence', () => {
		const noHigh: SnapshotState = { ...ggalState, lastConfirmedSwingHigh: null };

		expect(toText(describePattern(noHigh, ggalPesoEquivalents, PESO_LINE))).toBe(
			'Patrón descendente: máximos y mínimos cada vez más bajos.',
		);
	});

	test('a range, an expired pattern and a warm-up read differently', () => {
		const range: SnapshotState = { ...ggalState, structure: 'range' };
		const expired: SnapshotState = { ...ggalState, structure: 'undefined' };
		const warmUp: SnapshotState = { ...ggalState, structure: null };

		expect(toText(describePattern(range, ggalPesoEquivalents, PESO_LINE))).toBe(
			'Patrón lateral: máximos y mínimos no coinciden en una dirección, y el precio sigue entre ellos.',
		);
		expect(toText(describePattern(expired, ggalPesoEquivalents, PESO_LINE))).toBe(
			'Sin patrón claro: el precio salió de su último patrón y todavía no se confirmó un nuevo máximo o mínimo.',
		);
		expect(describePattern(warmUp, ggalPesoEquivalents, PESO_LINE)[0]).toEqual({
			strong: 'Sin patrón todavía:',
		});
	});
});

describe('describeTippingPoints', () => {
	test('a bearish trend shows where it would stop being bearish: the near, bearish edge', () => {
		expect(
			describeTippingPoints(ggalState, ggalPesoEquivalents, PESO_LINE).map(toText),
		).toEqual([
			`Con cierres por encima de 6.480${NBSP}pesos (US$${NBSP}4,21), la tendencia dejaría de ser bajista.`,
		]);
	});

	test('a bullish trend shows where it would stop being bullish: the near, bullish edge', () => {
		// The 50-session condition is not needed to leave a trend, so it is never added here.
		const bullishState: SnapshotState = { ...ggalState, regime: 'bullish' };

		expect(
			describeTippingPoints(bullishState, ggalPesoEquivalents, PESO_LINE).map(toText),
		).toEqual([
			`Con cierres por debajo de 7.344${NBSP}pesos (US$${NBSP}4,77), la tendencia dejaría de ser alcista.`,
		]);
	});

	test('a mixed trend shows both points, each named by the trend it leads to', () => {
		const mixedState: SnapshotState = { ...ggalState, regime: 'mixed' };
		const points = describeTippingPoints(mixedState, ggalPesoEquivalents, PESO_LINE);

		expect(points.map(toText)).toEqual([
			`Con cierres por encima de 7.344${NBSP}pesos (US$${NBSP}4,77), la tendencia pasaría a ser alcista. Además, la media de 50 ruedas tendría que pasar por encima de la de 200.`,
			`Con cierres por debajo de 6.480${NBSP}pesos (US$${NBSP}4,21), la tendencia pasaría a ser bajista.`,
		]);
	});

	test('no point while Regime is not readable', () => {
		const warmUpState: SnapshotState = {
			...ggalState,
			regime: null,
			regimeTippingCloses: null,
		};

		expect(describeTippingPoints(warmUpState, ggalPesoEquivalents, PESO_LINE)).toEqual([]);
	});
});

describe('describePendingTransition', () => {
	test('names the candidate trend and its confirmations (PATH, TECO2)', () => {
		const path = { candidate: 'bullish', confirmations: 2, requiredConfirmations: 3 } as const;
		const teco2 = { candidate: 'mixed', confirmations: 1, requiredConfirmations: 3 } as const;

		expect(toText(describePendingTransition(path)!)).toBe(
			'Posible cambio a tendencia alcista en curso (2 de 3 ruedas).',
		);
		expect(toText(describePendingTransition(teco2)!)).toBe(
			'Posible cambio a tendencia indefinida en curso (1 de 3 ruedas).',
		);
	});

	test('shows nothing when no change is in progress', () => {
		expect(describePendingTransition(null)).toBeNull();
	});
});

describe('describeEvent', () => {
	// PAMP's break of 18 Sep 2026, with its own session's MEP Rate of 1.538,32. At the last
	// session's rate, 1.539,94, the close would read 5.220 and the low 5.331.
	const pampBreak: SnapshotEvent = {
		sessionDate: '2026-09-18',
		event: {
			type: 'structure-break',
			direction: 'downward',
			priorStructure: 'uptrend',
			definingSwing: {
				kind: 'low',
				price: 3.4615564384201916,
				occurredAtSession: '2026-09-07',
				confirmedAtSession: '2026-09-10',
			},
			closePrice: 3.3900556858147715,
			pesoEquivalents: {
				mepRate: 1538.322813345356,
				closePrice: 5215,
				definingSwingPrice: 5325.0,
			},
		},
		coincidesWithLargeMove: false,
	};

	test('a downward Structure Break on a peso line names its close and low in pesos first', () => {
		const phrase = describeEvent(pampBreak, PESO_LINE);

		expect(toText(phrase)).toBe(
			`18${NBSP}sep · Se rompió el patrón ascendente. Cerró en 5.215${NBSP}pesos (US$${NBSP}3,39), por debajo del último mínimo confirmado: 5.325${NBSP}pesos (US$${NBSP}3,46), del 7${NBSP}sep, confirmado el 10${NBSP}sep.`,
		);
		expect(phrase).toContainEqual({ strong: `5.215${NBSP}pesos` });
		expect(phrase).toContainEqual({ strong: `5.325${NBSP}pesos` });
	});

	test('a Structure Break on a line not traded in pesos shows the analyzed prices alone', () => {
		expect(toText(describeEvent(pampBreak, DOLLAR_LINE))).toBe(
			`18${NBSP}sep · Se rompió el patrón ascendente. Cerró en US$${NBSP}3,39, por debajo del último mínimo confirmado: US$${NBSP}3,46, del 7${NBSP}sep, confirmado el 10${NBSP}sep.`,
		);
	});

	test('an upward Structure Break names the falling pattern and the high', () => {
		const structureBreak: SnapshotEvent = {
			sessionDate: '2026-10-09',
			event: {
				type: 'structure-break',
				direction: 'upward',
				priorStructure: 'downtrend',
				definingSwing: swingHigh,
				closePrice: 4.1,
				pesoEquivalents: { mepRate: 1540, closePrice: 6314, definingSwingPrice: 6221.6 },
			},
			coincidesWithLargeMove: false,
		};

		expect(toText(describeEvent(structureBreak, PESO_LINE))).toContain(
			`Se rompió el patrón descendente. Cerró en 6.314${NBSP}pesos (US$${NBSP}4,10), por encima del último máximo confirmado: 6.222${NBSP}pesos (US$${NBSP}4,04), del 6${NBSP}oct`,
		);
	});

	test('a close that crossed by less than the rounding reads as "apenas" beyond the level (PAMP)', () => {
		// PAMP's break of 8 May 2026: it closed at 4.702,50 pesos against a low of 4.703,45, and both
		// print as 4.703.
		const pampNarrowBreak: SnapshotEvent = {
			sessionDate: '2026-05-08',
			event: {
				type: 'structure-break',
				direction: 'downward',
				priorStructure: 'uptrend',
				definingSwing: {
					kind: 'low',
					price: 3.2960425316087654,
					occurredAtSession: '2026-04-27',
					confirmedAtSession: '2026-04-30',
				},
				closePrice: 3.295373923338624,
				pesoEquivalents: {
					mepRate: 1427.0004282960952,
					closePrice: 4702.5,
					definingSwingPrice: 4703.454104287854,
				},
			},
			coincidesWithLargeMove: false,
		};

		expect(toText(describeEvent(pampNarrowBreak, PESO_LINE))).toBe(
			`8${NBSP}may · Se rompió el patrón ascendente. Cerró en 4.703${NBSP}pesos (US$${NBSP}3,30), apenas por debajo del último mínimo confirmado: 4.703${NBSP}pesos (US$${NBSP}3,30), del 27${NBSP}abr, confirmado el 30${NBSP}abr.`,
		);
	});

	test('"apenas" follows the leading figures: pesos on a peso line, dollars otherwise', () => {
		// YPF's break of 13 Oct 2026: 8.330 against 8.328 pesos, but US$ 5,41 for both.
		const ypfBreak: SnapshotEvent = {
			sessionDate: '2026-10-13',
			event: {
				type: 'structure-break',
				direction: 'upward',
				priorStructure: 'downtrend',
				definingSwing: { ...swingHigh, price: 5.4085 },
				closePrice: 5.4097,
				pesoEquivalents: { mepRate: 1539.8, closePrice: 8330, definingSwingPrice: 8328.0 },
			},
			coincidesWithLargeMove: false,
		};
		// Equal pesos with different dollars: a close of US$ 3,2949 against a high of US$ 3,2951.
		const pesoOnlyCollision: SnapshotEvent = {
			...ypfBreak,
			event: {
				...ypfBreak.event,
				definingSwing: { ...swingHigh, price: 3.2949 },
				closePrice: 3.2951,
				pesoEquivalents: { mepRate: 1427, closePrice: 4702.9, definingSwingPrice: 4702.6 },
			} as SnapshotEvent['event'],
		};

		expect(toText(describeEvent(ypfBreak, PESO_LINE))).toContain(
			`Cerró en 8.330${NBSP}pesos (US$${NBSP}5,41), por encima del último máximo confirmado`,
		);
		expect(toText(describeEvent(ypfBreak, DOLLAR_LINE))).toContain(
			`Cerró en US$${NBSP}5,41, apenas por encima del último máximo confirmado`,
		);
		expect(toText(describeEvent(pesoOnlyCollision, PESO_LINE))).toContain(
			`Cerró en 4.703${NBSP}pesos (US$${NBSP}3,30), apenas por encima del último máximo confirmado: 4.703${NBSP}pesos (US$${NBSP}3,29)`,
		);
	});

	test('a Regime Transition names both trends and its confirming sessions', () => {
		const transition: SnapshotEvent = {
			sessionDate: '2026-09-29',
			event: {
				type: 'regime-transition',
				from: 'bullish',
				to: 'mixed',
				confirmingSessionDates: ['2026-09-25', '2026-09-26', '2026-09-29'],
			},
			coincidesWithLargeMove: false,
		};

		expect(toText(describeEvent(transition, PESO_LINE))).toBe(
			`29${NBSP}sep · Tendencia: alcista → indefinida. Se confirmó tras 3 ruedas (25, 26 y 29${NBSP}sep).`,
		);
	});

	test('a Volatile Session states its multiple of the typical daily range', () => {
		const volatileSession: SnapshotEvent = {
			sessionDate: '2026-10-08',
			event: {
				type: 'volatile-session',
				trueRange: 0.5,
				baselineAtr: 0.25,
				baselineThroughSessionDate: '2026-10-07',
				atrMultiple: 2.04,
			},
			coincidesWithLargeMove: false,
		};

		expect(toText(describeEvent(volatileSession, PESO_LINE))).toBe(
			`8${NBSP}oct · Rueda volátil: el rango del día fue 2,0 veces su rango diario típico.`,
		);
	});
});

describe('detail', () => {
	test('RSI reads as momentum, the share of recent movement that was gains', () => {
		expect(toText(describeMomentum(34.2)!)).toBe(
			`Momentum: 34 sobre 100. En las últimas ruedas, las subas fueron el 34${NBSP}% del movimiento total.`,
		);
		expect(describeMomentum(null)).toBeNull();
	});

	test('the short-term stretch is in typical daily moves from the 20-session average', () => {
		expect(toText(describeShortTermStretch(-1.43)!)).toBe(
			'1,4 movimientos diarios típicos por debajo de su media móvil de 20 ruedas.',
		);
		expect(describeShortTermStretch(null)).toBeNull();
	});

	test('swing dates name the occurrence and confirmation of each level', () => {
		expect(describeSwingDates(ggalState)).toBe(
			`Mínimo del 1${NBSP}oct, confirmado el 6${NBSP}oct · Máximo del 6${NBSP}oct, confirmado el 9${NBSP}oct.`,
		);
	});

	test('raw evidence states the peso close and its MEP Rate as market facts on a peso line', () => {
		const line = {
			latestState: ggalState,
			pesoEquivalents: ggalPesoEquivalents,
		} as AvailableLine;

		expect(describeRawEvidence(line, PESO_LINE)[0]).toBe(
			`Cierre del 9${NBSP}oct: 5.940,00${NBSP}pesos, con el dólar MEP a 1.540,00${NBSP}pesos.`,
		);
		expect(describeRawEvidence(line, DOLLAR_LINE)[0]).toBe(
			`Último mínimo confirmado: US$${NBSP}3,68.`,
		);
	});
});

describe('describeUnavailableLine', () => {
	test('explains thin trading and missing provider data', () => {
		const thinLine = {
			status: 'unavailable',
			instrumentId: 'x',
			tradingLineId: 'x-stock-byma-ars',
			reason: 'insufficient-liquidity',
			message: '',
			liquidity: { participation: 0.5, medianDailyTradedValueUsd: null },
		} as const;
		const emptyLine = { ...thinLine, reason: 'no-provider-bars' } as const;

		expect(describeUnavailableLine(thinLine)[0]).toEqual({
			strong: 'Sin analizar: opera muy poco volumen.',
		});
		expect(describeUnavailableLine(emptyLine)[0]).toEqual({ strong: 'Sin datos.' });
	});
});

describe('formatLevelPrice', () => {
	test('a peso line shows the peso equivalent first, without an approximation sign', () => {
		expect(formatLevelPrice(3.68, 5662.4, PESO_LINE)).toBe(
			`5.662${NBSP}pesos (US$${NBSP}3,68)`,
		);
	});

	test('a peso line without a peso equivalent falls back to the analyzed price', () => {
		expect(formatLevelPrice(3.68, null, PESO_LINE)).toBe(`US$${NBSP}3,68`);
	});
});

function buildBelowLowState(
	priceRelativeToSwingInPercent: number,
	isBeyondNoiseBand: boolean | null,
): SnapshotState {
	const situation: SnapshotSituation = {
		type: 'below-last-confirmed-low-in-bearish-regime',
		activeSinceSession: '2026-10-02',
		level: swingLow,
		isBeyondNoiseBand,
	};
	return {
		...ggalState,
		lastConfirmedSwingLow: {
			...swingLow,
			priceRelativeToSwingInPercent,
			closePosition: 'below',
		},
		situations: [situation],
	};
}

function buildAboveHighState(
	priceRelativeToSwingInPercent: number,
	isBeyondNoiseBand: boolean | null,
): SnapshotState {
	const situation: SnapshotSituation = {
		type: 'above-last-confirmed-high-in-bullish-regime',
		activeSinceSession: '2026-10-02',
		level: swingHigh,
		isBeyondNoiseBand,
	};
	return {
		...ggalState,
		regime: 'bullish',
		lastConfirmedSwingHigh: {
			...swingHigh,
			priceRelativeToSwingInPercent,
			closePosition: 'above',
		},
		situations: [situation],
	};
}

function toText(phrase: Phrase): string {
	return phrase
		.map((segment) => (typeof segment === 'string' ? segment : segment.strong))
		.join('');
}
