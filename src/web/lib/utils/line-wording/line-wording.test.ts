import { describe, expect, test } from 'bun:test';

import {
	describeEvent,
	describeLatestClose,
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
	selectDisplayCurrencies,
} from './line-wording.ts';

import type { AvailableLine, SnapshotEvent } from '#web/lib/utils/snapshot-pages/index.ts';
import type { Phrase } from './line-wording.types.ts';

type SnapshotState = AvailableLine['latestState'];
type SnapshotSituation = SnapshotState['situations'][number];

const NBSP = ' ';

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
// The same levels at a CCL Rate of 1.612: about 4,5 % fewer dollars than at the MEP Rate.
const ggalCclEquivalents: NonNullable<AvailableLine['cclEquivalents']> = {
	sessionDate: '2026-10-09',
	cclRate: 1612,
	close: 3.6849,
	lastConfirmedSwingHigh: 3.8604,
	lastConfirmedSwingLow: 3.5124,
	regimeTippingCloses: { bullishCloseAbove: 4.5558, bearishCloseBelow: 4.0199 },
};
const ggalLine = {
	latestState: ggalState,
	pesoEquivalents: ggalPesoEquivalents,
	cclEquivalents: ggalCclEquivalents,
};

function withState(latestState: SnapshotState) {
	return { ...ggalLine, latestState };
}

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
	const returnsLine = {
		periodReturns: [
			{ windowMonths: 1, fromSessionDate: '2026-09-10', percentChange: -15.2 },
			{ windowMonths: 3, fromSessionDate: '2026-07-09', percentChange: -27.3 },
			{ windowMonths: 12, fromSessionDate: '2025-10-09', percentChange: 14.3 },
		],
		pesoPeriodReturns: [
			{ windowMonths: 1, fromSessionDate: '2026-09-10', percentChange: -15.1 },
			{ windowMonths: 3, fromSessionDate: '2026-07-09', percentChange: -26.3 },
			{ windowMonths: 12, fromSessionDate: '2025-10-09', percentChange: 25.1 },
		],
		cclPeriodReturns: [
			{ windowMonths: 1, fromSessionDate: '2026-09-10', percentChange: -15.8 },
			{ windowMonths: 3, fromSessionDate: '2026-07-09', percentChange: -28.3 },
			{ windowMonths: 12, fromSessionDate: '2025-10-09', percentChange: 10.4 },
		],
	};

	test('each view reads its own currency’s returns and names the currency', () => {
		expect(toText(describePeriodReturns(returnsLine, 'ars'))).toBe(
			`−15,1${NBSP}% en un mes · −26,3${NBSP}% en tres meses · +25,1${NBSP}% en un año (en pesos, incluye la suba del dólar)`,
		);
		expect(toText(describePeriodReturns(returnsLine, 'usd'))).toBe(
			`−15,2${NBSP}% en un mes · −27,3${NBSP}% en tres meses · +14,3${NBSP}% en un año (en dólares MEP)`,
		);
		expect(toText(describePeriodReturns(returnsLine, 'ccl'))).toBe(
			`−15,8${NBSP}% en un mes · −28,3${NBSP}% en tres meses · +10,4${NBSP}% en un año (en dólares CCL)`,
		);
	});

	test('shows an unavailable window as a dash, never as zero', () => {
		const shortLine = {
			...returnsLine,
			pesoPeriodReturns: [
				...returnsLine.pesoPeriodReturns.slice(0, 2),
				{ windowMonths: 12, fromSessionDate: null, percentChange: null },
			],
		};

		expect(toText(describePeriodReturns(shortLine, 'ars'))).toContain(
			'— en un año (sin historia suficiente)',
		);
	});

	test('a CCL return missing where the MEP return exists lacked a CCL Rate, not history', () => {
		const unavailable = { fromSessionDate: null, percentChange: null };
		const line = {
			periodReturns: [returnsLine.periodReturns[0]!, { windowMonths: 3, ...unavailable }],
			pesoPeriodReturns: returnsLine.pesoPeriodReturns.slice(0, 2),
			cclPeriodReturns: [
				{ windowMonths: 1, ...unavailable },
				{ windowMonths: 3, ...unavailable },
			],
		};

		expect(toText(describePeriodReturns(line, 'ccl'))).toBe(
			'— en un mes (sin cotización CCL) · — en tres meses (sin historia suficiente) (en dólares CCL)',
		);
	});

	test('shows a rise with a plus sign', () => {
		expect(describePeriodReturns(returnsLine, 'usd')).toContainEqual({
			strong: `+14,3${NBSP}%`,
		});
	});
});

describe('describeLatestClose', () => {
	const latestCloseLine = {
		latestClose: {
			sessionDate: '2026-10-14',
			previousSessionDate: '2026-10-13',
			peso: { close: 5940, previousClose: 5880, change: 60, percentChange: 1.0204 },
			mep: { close: 4, previousClose: 4, change: 0, percentChange: 0 },
			ccl: { close: 3.8077, previousClose: 3.8182, change: -0.0105, percentChange: -0.2747 },
		},
	};

	test('each view shows its own close and signed change, with no label', () => {
		expect(toText(describeLatestClose(latestCloseLine, 'ars'))).toBe(
			`$${NBSP}5.940 (+$${NBSP}60, +1,0${NBSP}%)`,
		);
		expect(toText(describeLatestClose(latestCloseLine, 'ccl'))).toBe(
			`U$S${NBSP}3,81 (−U$S${NBSP}0,01, −0,3${NBSP}%)`,
		);
		expect(describeLatestClose(latestCloseLine, 'ars')[0]).toEqual({
			strong: `$${NBSP}5.940`,
		});
	});

	test('a dollar change takes the decimals of its own view’s close', () => {
		const line = {
			latestClose: {
				...latestCloseLine.latestClose,
				mep: {
					close: 0.3427,
					previousClose: 0.345,
					change: -0.0023,
					percentChange: -0.6733,
				},
			},
		};

		expect(toText(describeLatestClose(line, 'usd'))).toBe(
			`U$S${NBSP}0,343 (−U$S${NBSP}0,002, −0,7${NBSP}%)`,
		);
	});

	test('a change of zero has no sign', () => {
		expect(toText(describeLatestClose(latestCloseLine, 'usd'))).toBe(
			`U$S${NBSP}4,00 (U$S${NBSP}0,00, 0,0${NBSP}%)`,
		);
	});

	test('a change the analysis left null is left out, not shown as zero', () => {
		const line = {
			latestClose: {
				...latestCloseLine.latestClose,
				mep: { close: 4, previousClose: null, change: null, percentChange: null },
			},
		};

		expect(describeLatestClose(line, 'usd')).toEqual([{ strong: `U$S${NBSP}4,00` }]);
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
	test('between both levels: each view names its own currency only, at the same distance', () => {
		expect(describeLevels(ggalLine, 'ars').map(toText)).toEqual([
			`Soporte en $${NBSP}5.662: el cierre está 4,9${NBSP}% por encima.`,
			`Resistencia en $${NBSP}6.223: el cierre está 4,5${NBSP}% por debajo.`,
		]);
		expect(describeLevels(ggalLine, 'usd').map(toText)).toEqual([
			`Soporte en U$S${NBSP}3,68: el cierre está 4,9${NBSP}% por encima.`,
			`Resistencia en U$S${NBSP}4,04: el cierre está 4,5${NBSP}% por debajo.`,
		]);
		expect(describeLevels(ggalLine, 'ccl').map(toText)).toEqual([
			`Soporte en U$S${NBSP}3,51: el cierre está 4,9${NBSP}% por encima.`,
			`Resistencia en U$S${NBSP}3,86: el cierre está 4,5${NBSP}% por debajo.`,
		]);
	});

	test('below the low within the noise band (PEP) gets the calm label with its distance', () => {
		const pepState = buildBelowLowState(-0.8, false);

		expect(describeLevels(withState(pepState), 'ars')[0]).toEqual([
			{ strong: 'Debajo de su último mínimo confirmado' },
			` (−0,8${NBSP}%): ya no hay un soporte confirmado.`,
		]);
	});

	test('below the low beyond the noise band in a bearish Regime (LAC) reads as falling with no floor', () => {
		const lacState = buildBelowLowState(-12.8, true);

		expect(describeLevels(withState(lacState), 'ars')[0]).toEqual([
			{ strong: 'Caída sin piso confirmado.' },
			` El cierre está 12,8${NBSP}% por debajo de su último mínimo confirmado y todavía no se confirmó un mínimo nuevo.`,
		]);
	});

	test('the label follows the flag, not the size of the distance', () => {
		// A large distance with the flag off, as for an unreadable ATR, still reads calm.
		const unflaggedState = buildBelowLowState(-12.8, null);

		expect(describeLevels(withState(unflaggedState), 'ars')[0]![0]).toEqual({
			strong: 'Debajo de su último mínimo confirmado',
		});
	});

	test('an unmeasured flag above the high reads calm too', () => {
		const unflaggedState = buildAboveHighState(52.1, null);

		expect(describeLevels(withState(unflaggedState), 'ars')[1]![0]).toEqual({
			strong: 'Por encima de su último máximo confirmado',
		});
	});

	test('below the low without an active Situation, as in a mixed Regime, reads calm', () => {
		const mixedBelowLowState: SnapshotState = {
			...buildBelowLowState(-12.8, true),
			regime: 'mixed',
			situations: [],
		};

		expect(describeLevels(withState(mixedBelowLowState), 'ars')[0]![0]).toEqual({
			strong: 'Debajo de su último mínimo confirmado',
		});
	});

	test('above the high within the noise band (XLV) gets the calm mirror label', () => {
		const xlvState = buildAboveHighState(0.1, false);

		expect(describeLevels(withState(xlvState), 'ars')[1]).toEqual([
			{ strong: 'Por encima de su último máximo confirmado' },
			` (+0,1${NBSP}%): no hay una resistencia confirmada arriba.`,
		]);
	});

	test('a distance that rounds to zero keeps the side the label names (GLD)', () => {
		const gldState = buildAboveHighState(0.04, false);

		expect(describeLevels(withState(gldState), 'ars')[1]![1]).toBe(
			` (+0,0${NBSP}%): no hay una resistencia confirmada arriba.`,
		);
	});

	test('above the high beyond the noise band in a bullish Regime (XP) reads as rising with no ceiling', () => {
		const xpState = buildAboveHighState(52.1, true);

		expect(describeLevels(withState(xpState), 'ars')[1]).toEqual([
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

		expect(describeLevels(withState(noLevels), 'ars')).toEqual([
			['Todavía no hay máximos ni mínimos confirmados.'],
		]);
		expect(describeLevels(withState(onlyHigh), 'ars')[0]).toEqual([
			'Todavía no hay un mínimo confirmado.',
		]);
	});
});

describe('describePattern', () => {
	test('a downtrend breaks with a close above the last confirmed high, which alone does not change the trend', () => {
		const phrase = describePattern(ggalLine, 'ars');

		expect(toText(phrase)).toBe(
			`Un cierre por encima de $${NBSP}6.223 rompería el patrón descendente: los máximos dejarían de ser cada vez más bajos. Por sí solo, no cambia la tendencia.`,
		);
		expect(phrase).toContainEqual({ strong: `$${NBSP}6.223` });
		expect(phrase).toContainEqual({ strong: 'patrón descendente' });
	});

	test('an uptrend breaks with a close below the last confirmed low', () => {
		const uptrendState: SnapshotState = { ...ggalState, structure: 'uptrend', regime: 'mixed' };

		expect(toText(describePattern(withState(uptrendState), 'ars'))).toBe(
			`Un cierre por debajo de $${NBSP}5.662 rompería el patrón ascendente: los mínimos dejarían de ser cada vez más altos. Por sí solo, no cambia la tendencia.`,
		);
	});

	test('a break says nothing about the trend while the trend is not readable', () => {
		const warmUpTrend: SnapshotState = { ...ggalState, regime: null };

		expect(toText(describePattern(withState(warmUpTrend), 'ars'))).toBe(
			`Un cierre por encima de $${NBSP}6.223 rompería el patrón descendente: los máximos dejarían de ser cada vez más bajos.`,
		);
	});

	test('the USD and CCL views name the level in their own dollars', () => {
		expect(toText(describePattern(ggalLine, 'ccl'))).toContain(
			`Un cierre por encima de U$S${NBSP}3,86 rompería`,
		);
		expect(toText(describePattern(ggalLine, 'usd'))).toBe(
			`Un cierre por encima de U$S${NBSP}4,04 rompería el patrón descendente: los máximos dejarían de ser cada vez más bajos. Por sí solo, no cambia la tendencia.`,
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
		const pampLine = {
			...ggalLine,
			latestState: pampState,
			pesoEquivalents: pampPesoEquivalents,
		};
		const patternText = toText(describePattern(pampLine, 'ars'));

		expect(patternText).toBe(
			`Un cierre por encima de $${NBSP}5.336 rompería el patrón descendente: los máximos dejarían de ser cada vez más bajos. Por sí solo, no cambia la tendencia.`,
		);
		expect(patternText).not.toContain('seguiría siendo');
	});

	test('a trending pattern without its break level reads without a break sentence', () => {
		const noHigh: SnapshotState = { ...ggalState, lastConfirmedSwingHigh: null };

		expect(toText(describePattern(withState(noHigh), 'ars'))).toBe(
			'Patrón descendente: máximos y mínimos cada vez más bajos.',
		);
	});

	test('a range, an expired pattern and a warm-up read differently', () => {
		const range: SnapshotState = { ...ggalState, structure: 'range' };
		const expired: SnapshotState = { ...ggalState, structure: 'undefined' };
		const warmUp: SnapshotState = { ...ggalState, structure: null };

		expect(toText(describePattern(withState(range), 'ars'))).toBe(
			'Patrón lateral: máximos y mínimos no coinciden en una dirección, y el precio sigue entre ellos.',
		);
		expect(toText(describePattern(withState(expired), 'ars'))).toBe(
			'Sin patrón claro: el precio salió de su último patrón y todavía no se confirmó un nuevo máximo o mínimo.',
		);
		expect(describePattern(withState(warmUp), 'ars')[0]).toEqual({
			strong: 'Sin patrón todavía:',
		});
	});
});

describe('describeTippingPoints', () => {
	test('a bearish trend shows where it would stop being bearish: the near, bearish edge', () => {
		expect(describeTippingPoints(ggalLine, 'ars').map(toText)).toEqual([
			`Con cierres por encima de $${NBSP}6.480, la tendencia dejaría de ser bajista.`,
		]);
	});

	test('a bullish trend shows where it would stop being bullish: the near, bullish edge', () => {
		// The 50-session condition is not needed to leave a trend, so it is never added here.
		const bullishState: SnapshotState = { ...ggalState, regime: 'bullish' };

		expect(describeTippingPoints(withState(bullishState), 'ars').map(toText)).toEqual([
			`Con cierres por debajo de $${NBSP}7.344, la tendencia dejaría de ser alcista.`,
		]);
	});

	test('a mixed trend shows both points, each named by the trend it leads to', () => {
		const mixedState: SnapshotState = { ...ggalState, regime: 'mixed' };
		const points = describeTippingPoints(withState(mixedState), 'ars');

		expect(points.map(toText)).toEqual([
			`Con cierres por encima de $${NBSP}7.344, la tendencia pasaría a ser alcista. Además, la media de 50 ruedas tendría que pasar por encima de la de 200.`,
			`Con cierres por debajo de $${NBSP}6.480, la tendencia pasaría a ser bajista.`,
		]);
	});

	test('each view names the tipping point in its own currency', () => {
		expect(describeTippingPoints(ggalLine, 'usd').map(toText)).toEqual([
			`Con cierres por encima de U$S${NBSP}4,21, la tendencia dejaría de ser bajista.`,
		]);
		expect(describeTippingPoints(ggalLine, 'ccl').map(toText)).toEqual([
			`Con cierres por encima de U$S${NBSP}4,02, la tendencia dejaría de ser bajista.`,
		]);
	});

	test('no point while Regime is not readable', () => {
		const warmUpState: SnapshotState = {
			...ggalState,
			regime: null,
			regimeTippingCloses: null,
		};

		expect(describeTippingPoints(withState(warmUpState), 'ars')).toEqual([]);
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
			cclEquivalents: { cclRate: 1604.6, closePrice: 3.2501, definingSwingPrice: 3.3186 },
		},
		coincidesWithLargeMove: false,
	};

	test('a downward Structure Break names its close and low in each view’s own currency', () => {
		const pesoPhrase = describeEvent(pampBreak, 'ars');

		expect(toText(pesoPhrase)).toBe(
			`18${NBSP}sep · Se rompió el patrón ascendente. Cerró en $${NBSP}5.215, por debajo del último mínimo confirmado: $${NBSP}5.325, del 7${NBSP}sep, confirmado el 10${NBSP}sep.`,
		);
		expect(pesoPhrase).toContainEqual({ strong: `$${NBSP}5.215` });
		expect(toText(describeEvent(pampBreak, 'usd'))).toBe(
			`18${NBSP}sep · Se rompió el patrón ascendente. Cerró en U$S${NBSP}3,39, por debajo del último mínimo confirmado: U$S${NBSP}3,46, del 7${NBSP}sep, confirmado el 10${NBSP}sep.`,
		);
		expect(toText(describeEvent(pampBreak, 'ccl'))).toBe(
			`18${NBSP}sep · Se rompió el patrón ascendente. Cerró en U$S${NBSP}3,25, por debajo del último mínimo confirmado: U$S${NBSP}3,32, del 7${NBSP}sep, confirmado el 10${NBSP}sep.`,
		);
	});

	test('a Structure Break on a session without a CCL Rate keeps its sentence without prices in CCL', () => {
		const breakWithoutCcl: SnapshotEvent = {
			...pampBreak,
			event: { ...pampBreak.event, cclEquivalents: null } as SnapshotEvent['event'],
		};

		expect(toText(describeEvent(breakWithoutCcl, 'ccl'))).toBe(
			`18${NBSP}sep · Se rompió el patrón ascendente. Cerró por debajo del último mínimo confirmado, del 7${NBSP}sep, confirmado el 10${NBSP}sep. Sin cotización CCL ese día.`,
		);
		expect(toText(describeEvent(breakWithoutCcl, 'ars'))).toContain(`$${NBSP}5.215`);
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
				cclEquivalents: null,
			},
			coincidesWithLargeMove: false,
		};

		expect(toText(describeEvent(structureBreak, 'ars'))).toContain(
			`Se rompió el patrón descendente. Cerró en $${NBSP}6.314, por encima del último máximo confirmado: $${NBSP}6.222, del 6${NBSP}oct`,
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
				cclEquivalents: null,
			},
			coincidesWithLargeMove: false,
		};

		expect(toText(describeEvent(pampNarrowBreak, 'ars'))).toBe(
			`8${NBSP}may · Se rompió el patrón ascendente. Cerró en $${NBSP}4.703, apenas por debajo del último mínimo confirmado: $${NBSP}4.703, del 27${NBSP}abr, confirmado el 30${NBSP}abr.`,
		);
		expect(toText(describeEvent(pampNarrowBreak, 'usd'))).toContain(
			`Cerró en U$S${NBSP}3,30, apenas por debajo del último mínimo confirmado: U$S${NBSP}3,30`,
		);
	});

	test('"apenas" follows each view’s own printed figures', () => {
		// YPF's break of 13 Oct 2026: 8.330 against 8.328 pesos, U$S 5,41 for both in MEP dollars,
		// and U$S 5,18 against U$S 5,17 in CCL dollars.
		const ypfBreak: SnapshotEvent = {
			sessionDate: '2026-10-13',
			event: {
				type: 'structure-break',
				direction: 'upward',
				priorStructure: 'downtrend',
				definingSwing: { ...swingHigh, price: 5.4085 },
				closePrice: 5.4097,
				pesoEquivalents: { mepRate: 1539.8, closePrice: 8330, definingSwingPrice: 8328.0 },
				cclEquivalents: { cclRate: 1609, closePrice: 5.1772, definingSwingPrice: 5.1734 },
			},
			coincidesWithLargeMove: false,
		};

		expect(toText(describeEvent(ypfBreak, 'ars'))).toContain(
			`Cerró en $${NBSP}8.330, por encima del último máximo confirmado`,
		);
		expect(toText(describeEvent(ypfBreak, 'usd'))).toContain(
			`Cerró en U$S${NBSP}5,41, apenas por encima del último máximo confirmado`,
		);
		expect(toText(describeEvent(ypfBreak, 'ccl'))).toContain(
			`Cerró en U$S${NBSP}5,18, por encima del último máximo confirmado: U$S${NBSP}5,17`,
		);
	});

	test('"apenas" in CCL dollars when only the CCL figures print equal', () => {
		const cclOnlyCollision: SnapshotEvent = {
			sessionDate: '2026-10-13',
			event: {
				type: 'structure-break',
				direction: 'upward',
				priorStructure: 'downtrend',
				definingSwing: { ...swingHigh, price: 5.38 },
				closePrice: 5.4097,
				pesoEquivalents: { mepRate: 1539.8, closePrice: 8330, definingSwingPrice: 8284 },
				cclEquivalents: { cclRate: 1609, closePrice: 5.1772, definingSwingPrice: 5.1751 },
			},
			coincidesWithLargeMove: false,
		};

		expect(toText(describeEvent(cclOnlyCollision, 'ccl'))).toContain(
			`Cerró en U$S${NBSP}5,18, apenas por encima del último máximo confirmado: U$S${NBSP}5,18`,
		);
		expect(toText(describeEvent(cclOnlyCollision, 'usd'))).toContain(
			`Cerró en U$S${NBSP}5,41, por encima del último máximo confirmado: U$S${NBSP}5,38`,
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

		expect(toText(describeEvent(transition, 'ars'))).toBe(
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

		expect(toText(describeEvent(volatileSession, 'ars'))).toBe(
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

	test('raw evidence is in the view’s currency, with the close and its rate where the snapshot has one', () => {
		expect(describeRawEvidence(ggalLine, 'ars')).toEqual([
			`Cierre del 9${NBSP}oct: $${NBSP}5.940,00, con el dólar MEP a $${NBSP}1.540,00.`,
			`Último mínimo confirmado: $${NBSP}5.662,00.`,
			`Último máximo confirmado: $${NBSP}6.223,00.`,
			`Bordes exactos de los puntos de quiebre: alcista $${NBSP}7.344,00 · bajista $${NBSP}6.480,00.`,
		]);
		expect(describeRawEvidence(ggalLine, 'usd')).toEqual([
			`Último mínimo confirmado: U$S${NBSP}3,68.`,
			`Último máximo confirmado: U$S${NBSP}4,04.`,
			`Bordes exactos de los puntos de quiebre: alcista U$S${NBSP}4,77 · bajista U$S${NBSP}4,21.`,
		]);
		expect(describeRawEvidence(ggalLine, 'ccl')).toEqual([
			`Cierre del 9${NBSP}oct: U$S${NBSP}3,6849, con el dólar CCL a 1.612,00.`,
			`Último mínimo confirmado: U$S${NBSP}3,5124.`,
			`Último máximo confirmado: U$S${NBSP}3,8604.`,
			`Bordes exactos de los puntos de quiebre: alcista U$S${NBSP}4,5558 · bajista U$S${NBSP}4,0199.`,
		]);
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

describe('selectDisplayCurrencies', () => {
	test('a peso line offers pesos first, then MEP dollars, then CCL dollars', () => {
		expect(selectDisplayCurrencies(ggalLine, true)).toEqual(['ars', 'usd', 'ccl']);
	});

	test('a peso line without CCL figures offers no CCL view', () => {
		expect(selectDisplayCurrencies({ cclEquivalents: null }, true)).toEqual(['ars', 'usd']);
	});

	test('a line not known to trade in pesos shows its analyzed prices alone', () => {
		expect(selectDisplayCurrencies(ggalLine, false)).toEqual(['usd']);
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
