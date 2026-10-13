import {
	formatExactPesos,
	formatExactPrice,
	formatOneDecimal,
	formatPercent,
	formatPesos,
	formatPrice,
	formatShortDate,
	formatShortDateList,
	formatSignedPercent,
	formatWholeNumber,
} from '#web/lib/utils/es-ar-formatting/index.ts';

import type {
	AvailableLine,
	SnapshotEvent,
	SnapshotPriceUnit,
	UnavailableLine,
} from '#web/lib/utils/snapshot-pages/index.ts';
import type { Phrase, PriceContext } from './line-wording.types.ts';

type SnapshotState = AvailableLine['latestState'];
type ReadableRegime = NonNullable<SnapshotState['regime']>;
type PesoEquivalents = AvailableLine['pesoEquivalents'];
type SnapshotPeriodReturn = AvailableLine['periodReturns'][number];
type StructureBreak = Extract<SnapshotEvent['event'], { type: 'structure-break' }>;

// A settled trend lags the close by its confirming sessions, so the sentence says what confirmed it
// rather than where the price is today.
const TREND_PHRASES: Record<ReadableRegime, Phrase> = {
	bullish: [
		{ strong: 'Tendencia alcista.' },
		' Se confirmó con el precio y la media de 50 ruedas por encima de la de 200.',
	],
	mixed: [
		{ strong: 'Tendencia indefinida.' },
		' El precio y las medias móviles no coinciden en una dirección.',
	],
	bearish: [
		{ strong: 'Tendencia bajista.' },
		' Se confirmó con el precio y la media de 50 ruedas por debajo de la de 200.',
	],
};

const TREND_NAMES: Record<ReadableRegime, string> = {
	bullish: 'alcista',
	mixed: 'indefinida',
	bearish: 'bajista',
};

const PRICE_UNIT_NAMES: Record<SnapshotPriceUnit, string> = {
	'mep-dollar': 'dólares MEP',
};

const PERIOD_NAMES: Record<number, string> = {
	1: 'en un mes',
	3: 'en tres meses',
	12: 'en un año',
};

const PATTERN_NAMES: Record<StructureBreak['priorStructure'], string> = {
	uptrend: 'ascendente',
	downtrend: 'descendente',
};

/** Shown next to an Event whose session coincides with a Large One-Session Move. */
export const LARGE_MOVE_NOTE =
	'⚠ Movimiento inusual en una sola rueda; suele deberse a un split u otro evento corporativo.';

/** The tier-2 note on a peso line: levels are analyzed in MEP dollars and converted per session. */
export const CURRENCY_NOTE =
	'Precios analizados en dólares MEP; los valores en pesos son equivalentes al dólar MEP de ese día.';

/** What the trend (Regime) reads, or that there is not enough history to read it. */
export function describeTrend(regime: SnapshotState['regime']): Phrase {
	if (regime === null) {
		return [
			{ strong: 'Sin historia suficiente' },
			' para leer la tendencia (hacen falta unas 200 ruedas).',
		];
	}

	return TREND_PHRASES[regime];
}

/** The period returns on one line; an unavailable window shows as a dash, never as `0`. */
export function describePeriodReturns(
	periodReturns: AvailableLine['periodReturns'],
	priceUnit: SnapshotPriceUnit,
): Phrase {
	const windowPhrases = periodReturns.map(describePeriodReturn);
	const separatedPhrases = windowPhrases.flatMap((phrase, index) =>
		index === 0 ? phrase : [' · ', ...phrase],
	);

	return [...separatedPhrases, ` (en ${PRICE_UNIT_NAMES[priceUnit]})`];
}

function describePeriodReturn(periodReturn: SnapshotPeriodReturn): Phrase {
	const { windowMonths, percentChange } = periodReturn;
	const periodName = PERIOD_NAMES[windowMonths] ?? `en ${windowMonths} meses`;

	if (percentChange === null) {
		return [`— ${periodName} (sin historia suficiente)`];
	}

	return [{ strong: formatSignedPercent(percentChange) }, ` ${periodName}`];
}

/** The close's distance from its 200-session average, or `null` while it is not readable. */
export function describeLongTermDistance(
	priceRelativeToLongTermEmaInPercent: number | null,
): Phrase | null {
	if (priceRelativeToLongTermEmaInPercent === null) {
		return null;
	}

	if (priceRelativeToLongTermEmaInPercent === 0) {
		return ['El cierre está sobre su media móvil de 200 ruedas.'];
	}

	const distance = formatPercent(priceRelativeToLongTermEmaInPercent);
	const side = priceRelativeToLongTermEmaInPercent > 0 ? 'por encima' : 'por debajo';
	return [
		'El cierre está ',
		{ strong: `${distance} ${side}` },
		' de su media móvil de 200 ruedas.',
	];
}

/**
 * Support and resistance, one phrase per level, from each level's close position. A close beyond a
 * level reads as a Situation only when the analysis flags it beyond the noise band; otherwise, and
 * when no Situation is active, it gets the calm label with its distance.
 */
export function describeLevels(
	state: SnapshotState,
	pesoEquivalents: PesoEquivalents,
	context: PriceContext,
): readonly Phrase[] {
	const { lastConfirmedSwingLow: low, lastConfirmedSwingHigh: high } = state;

	if (low === null && high === null) {
		return [['Todavía no hay máximos ni mínimos confirmados.']];
	}

	return [
		describeLowLevel(state, pesoEquivalents.lastConfirmedSwingLow, context),
		describeHighLevel(state, pesoEquivalents.lastConfirmedSwingHigh, context),
	];
}

function describeLowLevel(
	state: SnapshotState,
	pesoPrice: number | null,
	context: PriceContext,
): Phrase {
	const low = state.lastConfirmedSwingLow;

	if (low === null) {
		return ['Todavía no hay un mínimo confirmado.'];
	}

	const distance = low.priceRelativeToSwingInPercent;

	if (low.closePosition === 'at-or-above') {
		// The distance is measured against the level, so the close is its subject.
		const distanceText =
			distance === null ? '' : `: el cierre está ${formatPercent(distance)} por encima`;
		return [
			{ strong: 'Soporte' },
			` en ${formatLevelPrice(low.price, pesoPrice, context)}${distanceText}.`,
		];
	}

	const situation = state.situations.find(
		({ type }) => type === 'below-last-confirmed-low-in-bearish-regime',
	);
	const isFallingWithoutFloor = situation?.isBeyondNoiseBand === true;

	if (isFallingWithoutFloor) {
		const distanceText = distance === null ? '' : ` ${formatPercent(distance)}`;
		return [
			{ strong: 'Caída sin piso confirmado.' },
			` El cierre está${distanceText} por debajo de su último mínimo confirmado y todavía no se confirmó un mínimo nuevo.`,
		];
	}

	// The close is below the low, so the sign stays even when the distance rounds to 0,0.
	const distanceText = distance === null ? '' : ` (−${formatPercent(distance)})`;
	return [
		{ strong: 'Debajo de su último mínimo confirmado' },
		`${distanceText}: ya no hay un soporte confirmado.`,
	];
}

function describeHighLevel(
	state: SnapshotState,
	pesoPrice: number | null,
	context: PriceContext,
): Phrase {
	const high = state.lastConfirmedSwingHigh;

	if (high === null) {
		return ['Todavía no hay un máximo confirmado.'];
	}

	const distance = high.priceRelativeToSwingInPercent;

	if (high.closePosition === 'at-or-below') {
		const distanceText =
			distance === null ? '' : `: el cierre está ${formatPercent(distance)} por debajo`;
		return [
			{ strong: 'Resistencia' },
			` en ${formatLevelPrice(high.price, pesoPrice, context)}${distanceText}.`,
		];
	}

	const situation = state.situations.find(
		({ type }) => type === 'above-last-confirmed-high-in-bullish-regime',
	);
	const isRisingWithoutCeiling = situation?.isBeyondNoiseBand === true;

	if (isRisingWithoutCeiling) {
		const distanceText = distance === null ? '' : ` ${formatPercent(distance)}`;
		return [
			{ strong: 'Subida sin techo confirmado.' },
			` El cierre está${distanceText} por encima de su último máximo confirmado y todavía no se confirmó un máximo nuevo.`,
		];
	}

	const distanceText = distance === null ? '' : ` (+${formatPercent(distance)})`;
	return [
		{ strong: 'Por encima de su último máximo confirmado' },
		`${distanceText}: no hay una resistencia confirmada arriba.`,
	];
}

/**
 * The pattern (Structure) and, for a trend, the close that would break it: the last confirmed swing
 * a Structure Break reads, the high in a downtrend and the low in an uptrend.
 */
export function describePattern(
	state: SnapshotState,
	pesoEquivalents: PesoEquivalents,
	context: PriceContext,
): Phrase {
	const { structure, lastConfirmedSwingHigh: high, lastConfirmedSwingLow: low } = state;

	if (structure === null) {
		return [
			{ strong: 'Sin patrón todavía:' },
			' no hay suficientes máximos y mínimos confirmados.',
		];
	}

	if (structure === 'downtrend') {
		const breakText =
			high === null
				? ''
				: ` Un cierre por encima de ${formatLevelPrice(high.price, pesoEquivalents.lastConfirmedSwingHigh, context)} lo rompería.`;
		return [
			{ strong: 'Patrón descendente:' },
			` máximos y mínimos cada vez más bajos.${breakText}`,
		];
	}

	if (structure === 'uptrend') {
		const breakText =
			low === null
				? ''
				: ` Un cierre por debajo de ${formatLevelPrice(low.price, pesoEquivalents.lastConfirmedSwingLow, context)} lo rompería.`;
		return [
			{ strong: 'Patrón ascendente:' },
			` máximos y mínimos cada vez más altos.${breakText}`,
		];
	}

	if (structure === 'range') {
		return [
			{ strong: 'Patrón lateral:' },
			' máximos y mínimos no coinciden en una dirección, y el precio sigue entre ellos.',
		];
	}

	return [
		{ strong: 'Sin patrón claro:' },
		' el precio salió de su último patrón y todavía no se confirmó un nuevo máximo o mínimo.',
	];
}

/**
 * The trend tipping points (Regime tipping closes) at the nearest change. A bearish trend stops
 * being bearish with closes above the bearish edge, and a bullish trend stops being bullish with
 * closes at or below the bullish edge: the price condition alone is enough to leave a trend. A
 * mixed trend shows both edges, each with the 50-session condition while EMA50 is not yet on that
 * side of EMA200, since entering a trend needs both.
 */
export function describeTippingPoints(
	state: SnapshotState,
	pesoEquivalents: PesoEquivalents,
	context: PriceContext,
): readonly Phrase[] {
	const { regime, regimeTippingCloses } = state;
	const pesoTippingCloses = pesoEquivalents.regimeTippingCloses;

	if (regime === null || regimeTippingCloses === null) {
		return [];
	}

	const { closeAbove, isFastEmaAligned: isFastEmaAboveSlow } = regimeTippingCloses.bullish;
	const { closeBelow, isFastEmaAligned: isFastEmaBelowSlow } = regimeTippingCloses.bearish;
	const bullishEdge = formatLevelPrice(
		closeAbove,
		pesoTippingCloses?.bullishCloseAbove ?? null,
		context,
	);
	const bearishEdge = formatLevelPrice(
		closeBelow,
		pesoTippingCloses?.bearishCloseBelow ?? null,
		context,
	);

	if (regime === 'bearish') {
		return [
			[
				{ strong: 'Punto de quiebre de la tendencia:' },
				` ${bearishEdge}: con cierres por encima, dejaría de ser bajista.`,
			],
		];
	}

	if (regime === 'bullish') {
		return [
			[
				{ strong: 'Punto de quiebre de la tendencia:' },
				` ${bullishEdge}: con cierres por debajo, dejaría de ser alcista.`,
			],
		];
	}

	const bullishAverageText = isFastEmaAboveSlow
		? ''
		: ' Además, la media de 50 ruedas tendría que pasar por encima de la de 200.';
	const bearishAverageText = isFastEmaBelowSlow
		? ''
		: ' Además, la media de 50 ruedas tendría que pasar por debajo de la de 200.';
	return [
		[
			{ strong: 'Punto de quiebre hacia tendencia alcista:' },
			` ${bullishEdge}.${bullishAverageText}`,
		],
		[
			{ strong: 'Punto de quiebre hacia tendencia bajista:' },
			` ${bearishEdge}.${bearishAverageText}`,
		],
	];
}

/** A trend change still gathering its confirming sessions, or `null` when there is none. */
export function describePendingTransition(
	pending: SnapshotState['pendingRegimeTransition'],
): Phrase | null {
	if (pending === null) {
		return null;
	}

	const { candidate, confirmations, requiredConfirmations } = pending;
	return [
		{ strong: `Posible cambio a tendencia ${TREND_NAMES[candidate]} en curso` },
		` (${confirmations} de ${requiredConfirmations} ruedas).`,
	];
}

/**
 * One Event, led by its session. A Structure Break's close is in the snapshot's price unit: the
 * snapshot has no peso equivalent for Event prices.
 */
export function describeEvent(snapshotEvent: SnapshotEvent, priceUnit: SnapshotPriceUnit): Phrase {
	const { sessionDate, event } = snapshotEvent;
	const date = formatShortDate(sessionDate);

	if (event.type === 'regime-transition') {
		const { from, to, confirmingSessionDates } = event;
		return [
			{ strong: `${date} · Tendencia: ${TREND_NAMES[from]} → ${TREND_NAMES[to]}.` },
			` Se confirmó tras ${confirmingSessionDates.length} ruedas (${formatShortDateList(confirmingSessionDates)}).`,
		];
	}

	if (event.type === 'structure-break') {
		return describeStructureBreak(date, event, priceUnit);
	}

	return [
		{ strong: `${date} · Rueda volátil:` },
		` el rango del día fue ${formatOneDecimal(event.atrMultiple)} veces su rango diario típico.`,
	];
}

function describeStructureBreak(
	date: string,
	event: StructureBreak,
	priceUnit: SnapshotPriceUnit,
): Phrase {
	const { direction, priorStructure, definingSwing, closePrice } = event;
	const swingName = definingSwing.kind === 'low' ? 'mínimo' : 'máximo';
	const side = direction === 'downward' ? 'por debajo' : 'por encima';
	const swingDates = `${swingName} del ${formatShortDate(definingSwing.occurredAtSession)}, confirmado el ${formatShortDate(definingSwing.confirmedAtSession)}`;

	return [
		{ strong: `${date} · Se rompió el patrón ${PATTERN_NAMES[priorStructure]}.` },
		` Cerró en ${formatPrice(closePrice, priceUnit)}, ${side} del último ${swingName} confirmado (${swingDates}).`,
	];
}

/** RSI as momentum: the share of recent movement that was gains. `null` while not readable. */
export function describeMomentum(rsi: number | null): Phrase | null {
	if (rsi === null) {
		return null;
	}

	const momentum = formatWholeNumber(rsi);
	return [
		{ strong: `Momentum: ${momentum} sobre 100.` },
		` En las últimas ruedas, las subas fueron el ${momentum} % del movimiento total.`,
	];
}

/** The close's distance from its 20-session average in typical daily moves (ATR). */
export function describeShortTermStretch(priceRelativeToEmaInAtr: number | null): Phrase | null {
	if (priceRelativeToEmaInAtr === null) {
		return null;
	}

	if (priceRelativeToEmaInAtr === 0) {
		return ['El cierre está sobre su media móvil de 20 ruedas.'];
	}

	const moves = formatOneDecimal(Math.abs(priceRelativeToEmaInAtr));
	const side = priceRelativeToEmaInAtr > 0 ? 'por encima' : 'por debajo';
	return [`${moves} movimientos diarios típicos ${side} de su media móvil de 20 ruedas.`];
}

/** When each last confirmed swing occurred and was confirmed, or `null` when none is confirmed. */
export function describeSwingDates(state: SnapshotState): string | null {
	const { lastConfirmedSwingLow: low, lastConfirmedSwingHigh: high } = state;
	const lowText =
		low === null
			? []
			: [
					`Mínimo del ${formatShortDate(low.occurredAtSession)}, confirmado el ${formatShortDate(low.confirmedAtSession)}`,
				];
	const highText =
		high === null
			? []
			: [
					`Máximo del ${formatShortDate(high.occurredAtSession)}, confirmado el ${formatShortDate(high.confirmedAtSession)}`,
				];
	const swingTexts = [...lowText, ...highText];

	if (swingTexts.length === 0) {
		return null;
	}

	return `${swingTexts.join(' · ')}.`;
}

/**
 * The tier-3 raw evidence: the session's peso close and MEP Rate on a peso line, then the exact
 * analyzed prices of the levels and tipping points the page rounds.
 */
export function describeRawEvidence(line: AvailableLine, context: PriceContext): readonly string[] {
	const { latestState: state, pesoEquivalents } = line;
	const { priceUnit } = context;
	const pesoClose = context.isPesoLine
		? [
				`Cierre del ${formatShortDate(pesoEquivalents.sessionDate)}: ${formatExactPesos(pesoEquivalents.close)}, con el dólar MEP a ${formatExactPesos(pesoEquivalents.mepRate)}.`,
			]
		: [];
	const low =
		state.lastConfirmedSwingLow === null
			? []
			: [
					`Último mínimo confirmado: ${formatExactPrice(state.lastConfirmedSwingLow.price, priceUnit)}.`,
				];
	const high =
		state.lastConfirmedSwingHigh === null
			? []
			: [
					`Último máximo confirmado: ${formatExactPrice(state.lastConfirmedSwingHigh.price, priceUnit)}.`,
				];
	const tippingPoints =
		state.regimeTippingCloses === null
			? []
			: [
					`Bordes exactos de los puntos de quiebre: alcista ${formatExactPrice(state.regimeTippingCloses.bullish.closeAbove, priceUnit)} · bajista ${formatExactPrice(state.regimeTippingCloses.bearish.closeBelow, priceUnit)}.`,
				];

	return [...pesoClose, ...low, ...high, ...tippingPoints];
}

/** Why a line was not analyzed. */
export function describeUnavailableLine(line: UnavailableLine): Phrase {
	if (line.reason === 'insufficient-liquidity') {
		return [
			{ strong: 'Sin analizar: opera muy poco volumen.' },
			' Con tan poco volumen, los indicadores describirían unas pocas operaciones y no al mercado.',
		];
	}

	if (line.reason === 'no-provider-bars') {
		return [
			{ strong: 'Sin datos.' },
			' Nuestra fuente de datos de mercado no devolvió precios para esta especie.',
		];
	}

	return [
		{ strong: 'Sin analizar.' },
		' No se pudieron analizar los precios de esta especie en la última actualización.',
	];
}

/**
 * A level's price for the reader: on a peso line, its peso equivalent first and the analyzed price
 * after it; otherwise the analyzed price alone.
 */
export function formatLevelPrice(
	price: number,
	pesoPrice: number | null,
	context: PriceContext,
): string {
	const analyzedPrice = formatPrice(price, context.priceUnit);

	if (!context.isPesoLine || pesoPrice === null) {
		return analyzedPrice;
	}

	return `≈ ${formatPesos(pesoPrice)} (${analyzedPrice})`;
}
