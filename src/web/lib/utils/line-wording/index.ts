export {
	CURRENCY_NOTES,
	LARGE_MOVE_NOTE,
	describeEvent,
	describeLatestClose,
	describeLatestCloseParts,
	describeLevels,
	describeLongTermDistance,
	describeMomentum,
	describePattern,
	describePendingTransition,
	describePeriodReturns,
	describeRawEvidence,
	describeReturnFigures,
	describeShortTermStretch,
	describeSwingDates,
	describeTippingPoints,
	describeTrend,
	describeTrendName,
	describeUnavailableLine,
	formatCurrencyPrice,
	readPrintedDirection,
	selectCurrencyLevels,
	selectDisplayCurrencies,
	selectNamedLevels,
	selectViewClose,
} from './line-wording.ts';
export type {
	CurrencyLevels,
	LatestCloseParts,
	NamedLevels,
	ReturnFigure,
} from './line-wording.ts';
export { selectNamedTippingPoints, selectPatternLevel } from './line-levels.ts';
export type { NamedTippingPoint } from './line-levels.ts';
export { groupHistoryByYear, selectRecentChanges } from './recent-changes.ts';
export type { HistoryYear, RecentChanges } from './recent-changes.ts';
export type {
	ChangeDirection,
	DisplayCurrency,
	Phrase,
	PhraseSegment,
} from './line-wording.types.ts';
