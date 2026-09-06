import { checkIfValueIsRecord } from '../../../lib/utils/validation.ts';

import type { DailyBar, SessionDateRange, ValidationIssue } from '../bar-history.types.ts';
import type { BarHistoryStorage, BarHistoryStorageReadResult } from '../storage/index.ts';
import type {
	BarHistoryRead,
	BarHistoryReader,
	ReadBarHistoriesFailure,
	ReadBarHistoriesResult,
} from './bar-history-reader.types.ts';

/**
 * Creates the application-facing reader for stored Bar Histories.
 *
 * The reader owns request validation and result shaping. Storage remains responsible for
 * loading and validating complete persisted histories.
 */
export function createBarHistoryReader(storage: BarHistoryStorage): BarHistoryReader {
	return {
		read: (request) => readBarHistories(storage, request),
	};
}

async function readBarHistories(
	storage: BarHistoryStorage,
	request: unknown,
): Promise<ReadBarHistoriesResult> {
	const requestValidation = validateReadRequest(request);

	if (!requestValidation.isValid) {
		return createInvalidRequestFailure(requestValidation.issues);
	}

	const { range, tradingLineIds } = requestValidation.request;
	const uniqueTradingLineIds = selectUniqueTradingLineIds(tradingLineIds);
	const storageResults = await Promise.all(
		uniqueTradingLineIds.map((tradingLineId) => storage.read(tradingLineId)),
	);
	const results = uniqueTradingLineIds.map((tradingLineId, index) =>
		createBarHistoryReadResult(tradingLineId, storageResults[index]!, range),
	);

	return { ok: true, results };
}

function validateReadRequest(value: unknown): ReadRequestValidationResult {
	if (!checkIfValueIsRecord(value)) {
		return createInvalidReadRequestValidation([
			createValidationIssue(
				'invalid-type',
				'request',
				'Bar History read request must be an object.',
			),
		]);
	}

	const tradingLineIdsValidation = validateTradingLineIds(value.tradingLineIds);
	const rangeValidation = validateSessionDateRange(value.range);

	if (!tradingLineIdsValidation.isValid || !rangeValidation.isValid) {
		const issues = [
			...selectValidationIssues(tradingLineIdsValidation),
			...selectValidationIssues(rangeValidation),
		];

		return createInvalidReadRequestValidation(issues);
	}

	return {
		isValid: true,
		request: {
			tradingLineIds: tradingLineIdsValidation.tradingLineIds,
			range: rangeValidation.range,
		},
	};
}

function validateTradingLineIds(value: unknown): TradingLineIdsValidationResult {
	if (!Array.isArray(value)) {
		return {
			isValid: false,
			issues: [
				createValidationIssue(
					'invalid-type',
					'tradingLineIds',
					'Trading Line IDs must be an array.',
				),
			],
		};
	}

	const issues = value.flatMap((tradingLineId, index) => {
		if (typeof tradingLineId !== 'string') {
			return [
				createValidationIssue(
					'invalid-type',
					`tradingLineIds[${index}]`,
					'Trading Line IDs must be strings.',
				),
			];
		}

		if (tradingLineId.trim().length > 0) {
			return [];
		}

		return [
			createValidationIssue(
				'invalid-value',
				`tradingLineIds[${index}]`,
				'Trading Line IDs must not be blank.',
			),
		];
	});

	return issues.length === 0
		? { isValid: true, tradingLineIds: value, issues: [] }
		: { isValid: false, issues };
}

function validateSessionDateRange(value: unknown): SessionDateRangeValidationResult {
	if (value === undefined || value === null) {
		return { isValid: true, range: null, issues: [] };
	}

	if (!checkIfValueIsRecord(value)) {
		return {
			isValid: false,
			issues: [
				createValidationIssue('invalid-type', 'range', 'Range must be an object or null.'),
			],
		};
	}

	const startIssue = createInvalidSessionDateIssue(value.start, 'range.start');
	const endIssue = createInvalidSessionDateIssue(value.end, 'range.end');
	const dateIssues = [startIssue, endIssue].filter(
		(issue): issue is ValidationIssue => issue !== null,
	);

	if (dateIssues.length > 0) {
		return { isValid: false, issues: dateIssues };
	}

	const range = value as SessionDateRange;

	if (range.start <= range.end) {
		return { isValid: true, range, issues: [] };
	}

	return {
		isValid: false,
		issues: [
			createValidationIssue(
				'invalid-value',
				'range',
				'Range start must not be after its end.',
			),
		],
	};
}

function createInvalidSessionDateIssue(value: unknown, path: string): ValidationIssue | null {
	if (typeof value === 'string' && checkIfSessionDateIsValid(value)) {
		return null;
	}

	return createValidationIssue('invalid-date', path, 'Value must be a real YYYY-MM-DD date.');
}

function checkIfSessionDateIsValid(value: string): boolean {
	try {
		const sessionDate = Temporal.PlainDate.from(value);
		return sessionDate.toString() === value;
	} catch {
		return false;
	}
}

function selectUniqueTradingLineIds(tradingLineIds: readonly string[]): readonly string[] {
	return [...new Set(tradingLineIds)];
}

function createBarHistoryReadResult(
	tradingLineId: string,
	storageResult: BarHistoryStorageReadResult,
	range: SessionDateRange | null,
): BarHistoryRead {
	if (!storageResult.ok) {
		return {
			ok: false,
			tradingLineId,
			reason: storageResult.reason,
			message: storageResult.message,
			issues: storageResult.issues,
		};
	}

	const { history } = storageResult;
	const bars = selectBarsInRange(history.bars, range);

	return {
		ok: true,
		tradingLineId,
		source: history.source,
		priceAdjustment: history.priceAdjustment,
		checkedThroughSession: history.checkedThroughSession,
		bars,
	};
}

function selectBarsInRange(
	bars: readonly DailyBar[],
	range: SessionDateRange | null,
): readonly DailyBar[] {
	if (range === null) {
		return bars;
	}

	return bars.filter((bar) => bar.sessionDate >= range.start && bar.sessionDate <= range.end);
}

function createInvalidRequestFailure(issues: readonly ValidationIssue[]): ReadBarHistoriesFailure {
	return {
		ok: false,
		reason: 'invalid-request',
		message: 'The Bar History read request is invalid.',
		issues,
	};
}

function createInvalidReadRequestValidation(
	issues: readonly ValidationIssue[],
): ReadRequestValidationResult {
	return { isValid: false, issues };
}

function selectValidationIssues(
	validation: TradingLineIdsValidationResult | SessionDateRangeValidationResult,
): readonly ValidationIssue[] {
	return validation.isValid ? [] : validation.issues;
}

function createValidationIssue(
	code: ValidationIssue['code'],
	path: string,
	message: string,
): ValidationIssue {
	return { code, path, message };
}

type ReadRequestValidationResult =
	| Readonly<{
			isValid: true;
			request: Readonly<{
				tradingLineIds: readonly string[];
				range: SessionDateRange | null;
			}>;
	  }>
	| Readonly<{ isValid: false; issues: readonly ValidationIssue[] }>;

type TradingLineIdsValidationResult =
	| Readonly<{ isValid: true; tradingLineIds: readonly string[]; issues: readonly [] }>
	| Readonly<{ isValid: false; issues: readonly ValidationIssue[] }>;

type SessionDateRangeValidationResult =
	| Readonly<{ isValid: true; range: SessionDateRange | null; issues: readonly [] }>
	| Readonly<{ isValid: false; issues: readonly ValidationIssue[] }>;
