import {
	formatDollars,
	formatExactDollars,
	formatExactPesos,
	formatExactRate,
	formatOneDecimal,
	formatPercent,
	formatPesos,
	formatShortDate,
	formatShortDateList,
	formatSignedDollarChange,
	formatSignedPercent,
	formatSignedPesoChange,
	formatWholeNumber,
} from '#web/lib/utils/es-ar-formatting/index.ts';

import type {
	AvailableLine,
	SnapshotEvent,
	UnavailableLine,
} from '#web/lib/utils/snapshot-pages/index.ts';
import type { DisplayCurrency, Phrase } from './line-wording.types.ts';

type SnapshotState = AvailableLine['latestState'];
type ReadableRegime = NonNullable<SnapshotState['regime']>;
type SnapshotPeriodReturn = AvailableLine['periodReturns'][number];
type StructureBreak = Extract<SnapshotEvent['event'], { type: 'structure-break' }>;

/** The parts of an available line whose prices a view shows. */
type PricedLine = Pick<AvailableLine, 'latestState' | 'pesoEquivalents' | 'cclEquivalents'>;
type ReturnsLine = Pick<AvailableLine, 'periodReturns' | 'pesoPeriodReturns' | 'cclPeriodReturns'>;

/** The latest State's levels in one view's currency, as the snapshot publishes them. */
type CurrencyLevels = Readonly<{
	lastConfirmedSwingHigh: number | null;
	lastConfirmedSwingLow: number | null;
	regimeTippingCloses: Readonly<{ bullishCloseAbove: number; bearishCloseBelow: number }> | null;
}>;

/** A Structure Break's close and crossed level in one view's currency. */
type BreakPrices = Readonly<{ closePrice: number; definingSwingPrice: number }>;

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

// A peso return includes the peso's devaluation, so the ARS view says so where it names the unit.
const RETURN_CURRENCY_NAMES: Record<DisplayCurrency, string> = {
	ars: 'en pesos, incluye la suba del dólar',
	usd: 'en dólares MEP',
	ccl: 'en dólares CCL',
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

/**
 * The tier-2 note of each view: levels are analyzed in MEP dollars and converted at a session's
 * rate, so the page says once that converted figures are approximate instead of marking each one.
 * "De cada día" and "de ese día" cover both rates the page uses: the levels at the last session's,
 * and each Event's prices at its own session's.
 */
export const CURRENCY_NOTES: Record<DisplayCurrency, string> = {
	ars: 'Precios en pesos. El análisis se hace en dólares MEP; los precios en pesos son aproximados: equivalen al dólar MEP de cada día.',
	usd: 'Precios en dólares MEP, la moneda en la que se hace el análisis: cada precio en pesos dividido por el dólar MEP de ese día.',
	ccl: 'Precios en dólares CCL, aproximados: cada precio en pesos dividido por el dólar CCL de ese día. El análisis se hace en dólares MEP.',
};

/**
 * The views a line page offers, the default first. A peso line offers pesos and MEP dollars, and
 * CCL dollars only when the analysis published CCL figures for its last session. A line not known
 * to trade in pesos shows its analyzed prices alone.
 */
export function selectDisplayCurrencies(
	line: Pick<AvailableLine, 'cclEquivalents'>,
	isPesoLine: boolean,
): readonly DisplayCurrency[] {
	if (!isPesoLine) {
		return ['usd'];
	}

	if (line.cclEquivalents === null) {
		return ['ars', 'usd'];
	}

	return ['ars', 'usd', 'ccl'];
}

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

/**
 * The period returns in the view's currency on one line; an unavailable window shows as a dash,
 * never as `0`. A CCL return missing where the MEP-dollar one exists lacked a CCL Rate at one of
 * its sessions, not history, and says so.
 */
export function describePeriodReturns(line: ReturnsLine, currency: DisplayCurrency): Phrase {
	const periodReturns = selectPeriodReturns(line, currency);
	const windowPhrases = periodReturns.map((periodReturn) => {
		const mepReturn = line.periodReturns.find(
			({ windowMonths }) => windowMonths === periodReturn.windowMonths,
		);
		const lacksCclRate =
			currency === 'ccl' &&
			periodReturn.percentChange === null &&
			mepReturn?.percentChange != null;
		return describePeriodReturn(periodReturn, lacksCclRate);
	});
	const separatedPhrases = windowPhrases.flatMap((phrase, index) =>
		index === 0 ? phrase : [' · ', ...phrase],
	);

	return [...separatedPhrases, ` (${RETURN_CURRENCY_NAMES[currency]})`];
}

function selectPeriodReturns(
	line: ReturnsLine,
	currency: DisplayCurrency,
): readonly SnapshotPeriodReturn[] {
	if (currency === 'ars') {
		return line.pesoPeriodReturns;
	}

	if (currency === 'ccl') {
		return line.cclPeriodReturns;
	}

	return line.periodReturns;
}

function describePeriodReturn(periodReturn: SnapshotPeriodReturn, lacksCclRate: boolean): Phrase {
	const { windowMonths, percentChange } = periodReturn;
	const periodName = PERIOD_NAMES[windowMonths] ?? `en ${windowMonths} meses`;

	if (percentChange === null) {
		const reason = lacksCclRate ? 'sin cotización CCL' : 'sin historia suficiente';
		return [`— ${periodName} (${reason})`];
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
export function describeLevels(line: PricedLine, currency: DisplayCurrency): readonly Phrase[] {
	const { latestState: state } = line;
	const { lastConfirmedSwingLow: low, lastConfirmedSwingHigh: high } = state;
	const levels = selectCurrencyLevels(line, currency);

	if (low === null && high === null) {
		return [['Todavía no hay máximos ni mínimos confirmados.']];
	}

	return [
		describeLowLevel(state, levels.lastConfirmedSwingLow, currency),
		describeHighLevel(state, levels.lastConfirmedSwingHigh, currency),
	];
}

function describeLowLevel(
	state: SnapshotState,
	levelPrice: number | null,
	currency: DisplayCurrency,
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
			' en ',
			...describePrice(levelPrice, currency),
			`${distanceText}.`,
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
	levelPrice: number | null,
	currency: DisplayCurrency,
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
			' en ',
			...describePrice(levelPrice, currency),
			`${distanceText}.`,
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
 * The pattern (Structure). A trending pattern reads as the close that would break it: the last
 * confirmed swing a Structure Break reads, the high in a downtrend and the low in an uptrend. A break
 * leaves the pattern unclear rather than reversing it, and it never changes the trend (Regime) on its
 * own. The sentence says so without naming the current trend: the break level can lie beyond a trend
 * tipping point, where "the trend would stay as it is" would contradict the tipping-point line.
 */
export function describePattern(line: PricedLine, currency: DisplayCurrency): Phrase {
	const { latestState: state } = line;
	const { structure, regime, lastConfirmedSwingHigh: high, lastConfirmedSwingLow: low } = state;
	const levels = selectCurrencyLevels(line, currency);
	const trendText = regime === null ? '' : ' Por sí solo, no cambia la tendencia.';

	if (structure === null) {
		return [
			{ strong: 'Sin patrón todavía:' },
			' no hay suficientes máximos y mínimos confirmados.',
		];
	}

	if (structure === 'downtrend') {
		if (high === null) {
			return [{ strong: 'Patrón descendente:' }, ' máximos y mínimos cada vez más bajos.'];
		}

		return [
			'Un cierre por encima de ',
			...describePrice(levels.lastConfirmedSwingHigh, currency),
			' rompería el ',
			{ strong: 'patrón descendente' },
			`: los máximos dejarían de ser cada vez más bajos.${trendText}`,
		];
	}

	if (structure === 'uptrend') {
		if (low === null) {
			return [{ strong: 'Patrón ascendente:' }, ' máximos y mínimos cada vez más altos.'];
		}

		return [
			'Un cierre por debajo de ',
			...describePrice(levels.lastConfirmedSwingLow, currency),
			' rompería el ',
			{ strong: 'patrón ascendente' },
			`: los mínimos dejarían de ser cada vez más altos.${trendText}`,
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
	line: PricedLine,
	currency: DisplayCurrency,
): readonly Phrase[] {
	const { regime, regimeTippingCloses } = line.latestState;
	const currencyTippingCloses = selectCurrencyLevels(line, currency).regimeTippingCloses;

	if (regime === null || regimeTippingCloses === null) {
		return [];
	}

	const isFastEmaAboveSlow = regimeTippingCloses.bullish.isFastEmaAligned;
	const isFastEmaBelowSlow = regimeTippingCloses.bearish.isFastEmaAligned;
	const bullishEdge = describePrice(currencyTippingCloses?.bullishCloseAbove ?? null, currency);
	const bearishEdge = describePrice(currencyTippingCloses?.bearishCloseBelow ?? null, currency);

	if (regime === 'bearish') {
		return [
			[
				'Con cierres por encima de ',
				...bearishEdge,
				', la ',
				{ strong: 'tendencia' },
				' dejaría de ser bajista.',
			],
		];
	}

	if (regime === 'bullish') {
		return [
			[
				'Con cierres por debajo de ',
				...bullishEdge,
				', la ',
				{ strong: 'tendencia' },
				' dejaría de ser alcista.',
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
			'Con cierres por encima de ',
			...bullishEdge,
			', la ',
			{ strong: 'tendencia' },
			` pasaría a ser alcista.${bullishAverageText}`,
		],
		[
			'Con cierres por debajo de ',
			...bearishEdge,
			', la ',
			{ strong: 'tendencia' },
			` pasaría a ser bajista.${bearishAverageText}`,
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
 * One Event, led by its session. A Structure Break's prices are its own, in the view's currency at
 * its session's rates: in pesos, the close is the peso close the line had that day. Only Structure
 * Breaks name prices, so the other kinds read the same in every view.
 */
export function describeEvent(snapshotEvent: SnapshotEvent, currency: DisplayCurrency): Phrase {
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
		return describeStructureBreak(date, event, currency);
	}

	return [
		{ strong: `${date} · Rueda volátil:` },
		` el rango del día fue ${formatOneDecimal(event.atrMultiple)} veces su rango diario típico.`,
	];
}

function describeStructureBreak(
	date: string,
	event: StructureBreak,
	currency: DisplayCurrency,
): Phrase {
	const { direction, priorStructure, definingSwing } = event;
	const swingName = definingSwing.kind === 'low' ? 'mínimo' : 'máximo';
	const side = direction === 'downward' ? 'por debajo' : 'por encima';
	const swingDates = `del ${formatShortDate(definingSwing.occurredAtSession)}, confirmado el ${formatShortDate(definingSwing.confirmedAtSession)}`;
	const lead = { strong: `${date} · Se rompió el patrón ${PATTERN_NAMES[priorStructure]}.` };
	const prices = selectBreakPrices(event, currency);

	// No other session's rate stands in for a session without a CCL Rate, so the sentence keeps the
	// break without its prices.
	if (prices === null) {
		return [
			lead,
			` Cerró ${side} del último ${swingName} confirmado, ${swingDates}. Sin cotización CCL ese día.`,
		];
	}

	// The reader compares the printed figures, so a close that crossed the level by less than their
	// rounding reads as "apenas" beyond it instead of beyond an equal-looking price.
	const closeFigure = formatCurrencyPrice(prices.closePrice, currency);
	const swingFigure = formatCurrencyPrice(prices.definingSwingPrice, currency);
	const crossing = closeFigure === swingFigure ? `apenas ${side}` : side;

	return [
		lead,
		' Cerró en ',
		{ strong: closeFigure },
		`, ${crossing} del último ${swingName} confirmado: `,
		{ strong: swingFigure },
		`, ${swingDates}.`,
	];
}

function selectBreakPrices(event: StructureBreak, currency: DisplayCurrency): BreakPrices | null {
	if (currency === 'ars') {
		return event.pesoEquivalents;
	}

	if (currency === 'ccl') {
		return event.cclEquivalents;
	}

	return { closePrice: event.closePrice, definingSwingPrice: event.definingSwing.price };
}

/**
 * The latest close in the view's currency, with its change since the line's previous session as a
 * signed figure and percentage. Its place under the line's name says what it is, so it has no
 * label. A change the analysis left `null`, for a previous session without a rate in this
 * currency, is left out rather than shown as `0`.
 *
 * @throws {Error} for a CCL view of a line without a CCL close, which offers no such view.
 */
export function describeLatestClose(
	line: Pick<AvailableLine, 'latestClose'>,
	currency: DisplayCurrency,
): Phrase {
	const closeChange = selectCloseChange(line.latestClose, currency);
	const closeText = formatCurrencyPrice(closeChange.close, currency);
	const { change, percentChange } = closeChange;

	if (change === null || percentChange === null) {
		return [{ strong: closeText }];
	}

	const changeText =
		currency === 'ars'
			? formatSignedPesoChange(change, closeChange.close)
			: formatSignedDollarChange(change);
	return [{ strong: closeText }, ` (${changeText}, ${formatSignedPercent(percentChange)})`];
}

function selectCloseChange(
	latestClose: AvailableLine['latestClose'],
	currency: DisplayCurrency,
): NonNullable<AvailableLine['latestClose']['ccl']> {
	if (currency === 'ars') {
		return latestClose.peso;
	}

	if (currency === 'usd') {
		return latestClose.mep;
	}

	if (latestClose.ccl === null) {
		throw new Error('A line without a CCL close has no CCL view.');
	}

	return latestClose.ccl;
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
 * The tier-3 raw evidence in the view's currency: the session's close with the rate that converted
 * it, where the snapshot has one, then the exact prices of the levels and tipping points the page
 * rounds. The analyzed MEP-dollar view has no close, since the snapshot publishes it in pesos.
 */
export function describeRawEvidence(
	line: PricedLine,
	currency: DisplayCurrency,
): readonly string[] {
	const levels = selectCurrencyLevels(line, currency);
	const formatExact = (value: number) => formatExactCurrencyPrice(value, currency);
	const close = describeRawClose(line, currency);
	const low =
		levels.lastConfirmedSwingLow === null
			? []
			: [`Último mínimo confirmado: ${formatExact(levels.lastConfirmedSwingLow)}.`];
	const high =
		levels.lastConfirmedSwingHigh === null
			? []
			: [`Último máximo confirmado: ${formatExact(levels.lastConfirmedSwingHigh)}.`];
	const tippingPoints =
		levels.regimeTippingCloses === null
			? []
			: [
					`Bordes exactos de los puntos de quiebre: alcista ${formatExact(levels.regimeTippingCloses.bullishCloseAbove)} · bajista ${formatExact(levels.regimeTippingCloses.bearishCloseBelow)}.`,
				];

	return [...close, ...low, ...high, ...tippingPoints];
}

function describeRawClose(line: PricedLine, currency: DisplayCurrency): readonly string[] {
	const { pesoEquivalents, cclEquivalents } = line;

	if (currency === 'ars') {
		return [
			`Cierre del ${formatShortDate(pesoEquivalents.sessionDate)}: ${formatExactPesos(pesoEquivalents.close)}, con el dólar MEP a ${formatExactPesos(pesoEquivalents.mepRate)}.`,
		];
	}

	if (currency === 'ccl' && cclEquivalents !== null) {
		return [
			`Cierre del ${formatShortDate(cclEquivalents.sessionDate)}: ${formatExactDollars(cclEquivalents.close)}, con el dólar CCL a ${formatExactRate(cclEquivalents.cclRate)}.`,
		];
	}

	return [];
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
 * The latest State's levels in the view's currency: the analyzed prices in MEP dollars, or the
 * analysis's peso or CCL equivalents. The page converts nothing.
 *
 * @throws {Error} for a CCL view of a line without CCL figures, which offers no such view.
 */
function selectCurrencyLevels(line: PricedLine, currency: DisplayCurrency): CurrencyLevels {
	if (currency === 'ars') {
		return line.pesoEquivalents;
	}

	if (currency === 'ccl') {
		if (line.cclEquivalents === null) {
			throw new Error('A line without CCL figures has no CCL view.');
		}

		return line.cclEquivalents;
	}

	const { lastConfirmedSwingHigh, lastConfirmedSwingLow, regimeTippingCloses } = line.latestState;
	return {
		lastConfirmedSwingHigh: lastConfirmedSwingHigh?.price ?? null,
		lastConfirmedSwingLow: lastConfirmedSwingLow?.price ?? null,
		regimeTippingCloses:
			regimeTippingCloses === null
				? null
				: {
						bullishCloseAbove: regimeTippingCloses.bullish.closeAbove,
						bearishCloseBelow: regimeTippingCloses.bearish.closeBelow,
					},
	};
}

/** A level's price in bold. The snapshot pairs every State level with its equivalents. */
function describePrice(price: number | null, currency: DisplayCurrency): Phrase {
	if (price === null) {
		throw new Error('The snapshot has no equivalent for a level the State has.');
	}

	return [{ strong: formatCurrencyPrice(price, currency) }];
}

function formatCurrencyPrice(price: number, currency: DisplayCurrency): string {
	if (currency === 'ars') {
		return formatPesos(price);
	}

	return formatDollars(price);
}

function formatExactCurrencyPrice(price: number, currency: DisplayCurrency): string {
	if (currency === 'ars') {
		return formatExactPesos(price);
	}

	return formatExactDollars(price);
}
