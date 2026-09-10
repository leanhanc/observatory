import * as v from 'valibot';

import {
	checkIfIsoDateIsValid,
	createValidationError,
	mapValibotIssues,
} from '#lib/utils/validation.ts';

import {
	BAR_HISTORY_ACQUISITION_MODES,
	createOpenBymadataBarHistoryAcquirer,
} from '../acquisition/index.ts';
import { buildOpenBymadataSource, createOpenBymadataAdapter } from '../adapters/index.ts';
import { reconcileBarHistory } from '../bar-history.ts';

import type {
	BarHistoryAcquisitionLine,
	BarHistoryAcquisitionLineResult,
} from '../acquisition/index.ts';
import type { BarHistory, BarHistoryCorrection, ValidationIssue } from '../bar-history.types.ts';
import type { BarHistoryStorage, BarHistoryStorageReadResult } from '../storage/index.ts';
import type {
	BarHistoryUpdate,
	BarHistoryUpdateFailure,
	BarHistoryUpdateLogger,
	BarHistoryUpdater,
	BarHistoryUpdaterOptions,
	PreparedLineResult,
	PreparedUpdateLine,
	UpdateBarHistoriesFailure,
	UpdateBarHistoriesResult,
	UpdateRequestValidationResult,
	UpdateBarHistoryLine,
} from './bar-history-updater.types.ts';

const INVALID_DATE_MESSAGE = 'Value must be a real YYYY-MM-DD date.';
const INVALID_TYPE_MESSAGE = 'Value has an invalid type or shape.';
const INVALID_VALUE_MESSAGE = 'Value is not supported.';

const sessionDateSchema = v.pipe(
	v.string(INVALID_DATE_MESSAGE),
	v.isoDate(INVALID_DATE_MESSAGE),
	v.check(checkIfIsoDateIsValid, INVALID_DATE_MESSAGE),
);
const nonBlankStringSchema = v.pipe(
	v.string(INVALID_TYPE_MESSAGE),
	v.check(checkIfStringIsNotBlank, INVALID_VALUE_MESSAGE),
);
const tradingLineSchema = v.strictObject(
	{
		tradingLineId: nonBlankStringSchema,
		symbol: nonBlankStringSchema,
	},
	INVALID_TYPE_MESSAGE,
);
const updateLineSchema = v.strictObject(
	{
		tradingLine: tradingLineSchema,
		mode: v.picklist(BAR_HISTORY_ACQUISITION_MODES, INVALID_VALUE_MESSAGE),
	},
	INVALID_TYPE_MESSAGE,
);
const updateRequestSchema = v.strictObject(
	{
		lines: v.array(updateLineSchema, INVALID_TYPE_MESSAGE),
		requestedThroughSession: sessionDateSchema,
	},
	INVALID_TYPE_MESSAGE,
);

/**
 * Creates the application-facing operation that acquires, reconciles, and stores Bar Histories.
 *
 * Provider normalization and acquisition remain internal. Correction events are emitted only
 * after the corresponding replacement has been stored successfully.
 */
export function createBarHistoryUpdater(
	storage: BarHistoryStorage,
	logger: BarHistoryUpdateLogger,
	options: BarHistoryUpdaterOptions = {},
): BarHistoryUpdater {
	const fetchFromProvider = options.fetchFromProvider ?? fetch;
	const pause = options.pause ?? Bun.sleep;
	const getCurrentInstant = options.getCurrentInstant ?? getCurrentUtcInstant;
	const adapter = createOpenBymadataAdapter(fetchFromProvider);
	const acquirer = createOpenBymadataBarHistoryAcquirer(adapter, pause);

	return {
		update: (request) =>
			updateBarHistories(storage, acquirer, logger, getCurrentInstant, request),
	};
}

async function updateBarHistories(
	storage: BarHistoryStorage,
	acquirer: ReturnType<typeof createOpenBymadataBarHistoryAcquirer>,
	logger: BarHistoryUpdateLogger,
	getCurrentInstant: () => string,
	request: unknown,
): Promise<UpdateBarHistoriesResult> {
	const requestValidation = validateUpdateRequest(request);

	if (!requestValidation.isValid) {
		return createInvalidRequestFailure(requestValidation.issues);
	}

	const { lines, requestedThroughSession } = requestValidation.request;
	const preparedResults = await Promise.all(
		lines.map((line) => prepareUpdateLine(storage, line, requestedThroughSession)),
	);
	const resultsByTradingLineId = selectPreparationFailures(preparedResults);
	const preparedLines = selectPreparedLines(preparedResults);

	if (preparedLines.length > 0) {
		await acquireAndStoreLines(
			storage,
			acquirer,
			logger,
			getCurrentInstant,
			preparedLines,
			requestedThroughSession,
			resultsByTradingLineId,
		);
	}

	const results = lines.map((line) =>
		getRequiredMapValue(resultsByTradingLineId, line.tradingLine.tradingLineId),
	);
	return { ok: true, results };
}

function validateUpdateRequest(value: unknown): UpdateRequestValidationResult {
	const validation = v.safeParse(updateRequestSchema, value);

	if (!validation.success) {
		return createValidationError(
			mapValibotIssues(validation.issues, resolveValidationIssueCode),
		);
	}

	const duplicateIssues = validateUniqueTradingLineIds(validation.output.lines);

	if (duplicateIssues.length > 0) {
		return createValidationError(duplicateIssues);
	}

	return {
		isValid: true,
		request: validation.output,
	};
}

function validateUniqueTradingLineIds(lines: readonly UpdateBarHistoryLine[]): ValidationIssue[] {
	const seenTradingLineIds = new Set<string>();

	return lines.flatMap((line, index) => {
		const { tradingLineId } = line.tradingLine;

		if (!seenTradingLineIds.has(tradingLineId)) {
			seenTradingLineIds.add(tradingLineId);
			return [];
		}

		return [
			createValidationIssue(
				'invalid-value',
				`lines[${index}].tradingLine.tradingLineId`,
				`Trading Line ${tradingLineId} occurs more than once.`,
			),
		];
	});
}

async function prepareUpdateLine(
	storage: BarHistoryStorage,
	line: UpdateBarHistoryLine,
	requestedThroughSession: string,
): Promise<PreparedLineResult> {
	const { tradingLineId } = line.tradingLine;
	const storageResult = await storage.read(tradingLineId);

	if (!storageResult.ok) {
		return prepareMissingOrFailedLine(line, storageResult);
	}

	if (line.mode === 'initial-backfill') {
		return {
			ok: false,
			failure: createLineFailure(
				tradingLineId,
				'mode-conflict',
				'Initial backfill cannot replace an existing Bar History.',
			),
		};
	}

	const historyFailure = validateStoredHistoryForUpdate(
		line,
		storageResult.history,
		requestedThroughSession,
	);

	if (historyFailure) {
		return { ok: false, failure: historyFailure };
	}

	return { ok: true, value: { line, existingHistory: storageResult.history } };
}

function prepareMissingOrFailedLine(
	line: UpdateBarHistoryLine,
	storageResult: Exclude<BarHistoryStorageReadResult, { ok: true }>,
): PreparedLineResult {
	if (storageResult.reason === 'not-found' && line.mode === 'initial-backfill') {
		return { ok: true, value: { line, existingHistory: null } };
	}

	return {
		ok: false,
		failure: createLineFailure(
			line.tradingLine.tradingLineId,
			storageResult.reason,
			storageResult.message,
			storageResult.issues,
		),
	};
}

function validateStoredHistoryForUpdate(
	line: UpdateBarHistoryLine,
	history: BarHistory,
	requestedThroughSession: string,
): BarHistoryUpdateFailure | null {
	const expectedSource = buildOpenBymadataSource(line.tradingLine);
	const hasExpectedSource =
		history.source.provider === expectedSource.provider &&
		history.source.symbol === expectedSource.symbol;

	if (!hasExpectedSource) {
		return createLineFailure(
			line.tradingLine.tradingLineId,
			'source-mismatch',
			'Stored Bar History uses different provider source information.',
		);
	}

	const hasRegressingCheckProgress = requestedThroughSession < history.checkedThroughSession;

	if (hasRegressingCheckProgress) {
		return createLineFailure(
			line.tradingLine.tradingLineId,
			'check-progress-regression',
			'Requested session cannot move behind stored check progress.',
		);
	}

	return null;
}

function selectPreparationFailures(
	preparedResults: readonly PreparedLineResult[],
): Map<string, BarHistoryUpdate> {
	return new Map(
		preparedResults.flatMap((result) =>
			result.ok ? [] : [[result.failure.tradingLineId, result.failure] as const],
		),
	);
}

function selectPreparedLines(
	preparedResults: readonly PreparedLineResult[],
): readonly PreparedUpdateLine[] {
	return preparedResults.flatMap((result) => (result.ok ? [result.value] : []));
}

async function acquireAndStoreLines(
	storage: BarHistoryStorage,
	acquirer: ReturnType<typeof createOpenBymadataBarHistoryAcquirer>,
	logger: BarHistoryUpdateLogger,
	getCurrentInstant: () => string,
	preparedLines: readonly PreparedUpdateLine[],
	requestedThroughSession: string,
	resultsByTradingLineId: Map<string, BarHistoryUpdate>,
): Promise<void> {
	const acquisitionLines = preparedLines.map(createAcquisitionLine);
	const acquisitionResult = await acquirer.acquire({
		lines: acquisitionLines,
		requestedThroughSession,
	});

	if (!acquisitionResult.ok) {
		for (const preparedLine of preparedLines) {
			resultsByTradingLineId.set(
				preparedLine.line.tradingLine.tradingLineId,
				createLineFailure(
					preparedLine.line.tradingLine.tradingLineId,
					acquisitionResult.reason,
					acquisitionResult.message,
					acquisitionResult.issues,
				),
			);
		}

		return;
	}

	const hasAvailableLines = acquisitionResult.lines.some((line) => line.status === 'available');
	const checkedAt = hasAvailableLines ? getCurrentInstant() : null;
	const preparedLinesById = new Map(
		preparedLines.map((preparedLine) => [
			preparedLine.line.tradingLine.tradingLineId,
			preparedLine,
		]),
	);
	const lineResults = await Promise.all(
		acquisitionResult.lines.map((acquisitionLine) => {
			const preparedLine = getRequiredMapValue(
				preparedLinesById,
				acquisitionLine.tradingLineId,
			);
			return reconcileAndStoreLine(
				storage,
				logger,
				preparedLine,
				acquisitionLine,
				requestedThroughSession,
				checkedAt,
			);
		}),
	);

	for (const lineResult of lineResults) {
		resultsByTradingLineId.set(lineResult.tradingLineId, lineResult);
	}
}

function createAcquisitionLine(preparedLine: PreparedUpdateLine): BarHistoryAcquisitionLine {
	return {
		tradingLine: preparedLine.line.tradingLine,
		mode: preparedLine.line.mode,
		existingHistory: preparedLine.existingHistory,
	};
}

async function reconcileAndStoreLine(
	storage: BarHistoryStorage,
	logger: BarHistoryUpdateLogger,
	preparedLine: PreparedUpdateLine,
	acquisitionLine: BarHistoryAcquisitionLineResult,
	requestedThroughSession: string,
	checkedAt: string | null,
): Promise<BarHistoryUpdate> {
	if (acquisitionLine.status === 'failed') {
		return createLineFailure(
			acquisitionLine.tradingLineId,
			acquisitionLine.reason,
			acquisitionLine.message,
		);
	}

	if (acquisitionLine.status === 'not-required') {
		return createLineSuccess(acquisitionLine.tradingLineId, 'unchanged', []);
	}

	if (checkedAt === null) {
		throw new Error('Available Bar History acquisition is missing its check instant.');
	}

	const reconciliationResult = reconcileBarHistory({
		existingHistory: preparedLine.existingHistory,
		tradingLineId: acquisitionLine.tradingLineId,
		source: acquisitionLine.source,
		incomingBars: acquisitionLine.bars,
		requestedThroughSession,
		checkedAt,
		reconciliationWindow: acquisitionLine.reconciliationWindow,
	});

	if (!reconciliationResult.ok) {
		return createLineFailure(
			acquisitionLine.tradingLineId,
			reconciliationResult.reason,
			reconciliationResult.message,
			reconciliationResult.issues,
		);
	}

	if (reconciliationResult.status === 'unchanged') {
		return createLineSuccess(acquisitionLine.tradingLineId, 'unchanged', []);
	}

	const storageResult = await storage.write(reconciliationResult.history);

	if (!storageResult.ok) {
		return createLineFailure(
			acquisitionLine.tradingLineId,
			storageResult.reason,
			storageResult.message,
			storageResult.issues,
		);
	}

	logCorrections(logger, acquisitionLine.tradingLineId, reconciliationResult.corrections);
	return createLineSuccess(
		acquisitionLine.tradingLineId,
		reconciliationResult.status,
		reconciliationResult.corrections,
	);
}

function logCorrections(
	logger: BarHistoryUpdateLogger,
	tradingLineId: string,
	corrections: readonly BarHistoryCorrection[],
): void {
	for (const correction of corrections) {
		logger.info(
			{
				event: 'market-history-correction',
				tradingLineId,
				sessionDate: correction.sessionDate,
				previousBar: correction.previousBar,
				correctedBar: correction.correctedBar,
			},
			'Market history correction accepted.',
		);
	}
}

function resolveValidationIssueCode(issue: v.BaseIssue<unknown>): ValidationIssue['code'] {
	if (issue.message === INVALID_DATE_MESSAGE) {
		return 'invalid-date';
	}

	if (issue.message === INVALID_TYPE_MESSAGE) {
		return 'invalid-type';
	}

	return 'invalid-value';
}

function createInvalidRequestFailure(
	issues: readonly ValidationIssue[],
): UpdateBarHistoriesFailure {
	return {
		ok: false,
		reason: 'invalid-request',
		message: 'The Bar History update request is invalid.',
		issues,
	};
}

function createLineSuccess(
	tradingLineId: string,
	status: Exclude<BarHistoryUpdate['status'], 'failed'>,
	corrections: readonly BarHistoryCorrection[],
): BarHistoryUpdate {
	return { status, tradingLineId, corrections };
}

function createLineFailure(
	tradingLineId: string,
	reason: BarHistoryUpdateFailure['reason'],
	message: string,
	issues: readonly ValidationIssue[] = [],
): BarHistoryUpdateFailure {
	return { status: 'failed', tradingLineId, reason, message, issues };
}

function createValidationIssue(
	code: ValidationIssue['code'],
	path: string,
	message: string,
): ValidationIssue {
	return { code, path, message };
}

function checkIfStringIsNotBlank(value: string): boolean {
	return value.trim().length > 0;
}

function getRequiredMapValue<Value>(values: ReadonlyMap<string, Value>, key: string): Value {
	const value = values.get(key);

	if (value === undefined) {
		throw new Error(`Expected update state for Trading Line ${key}.`);
	}

	return value;
}

function getCurrentUtcInstant(): string {
	return Temporal.Now.instant().toString();
}
