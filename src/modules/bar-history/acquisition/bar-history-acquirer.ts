/* eslint-disable no-await-in-loop -- BYMADATA historical requests are intentionally paced, and panel requests stay sequential to avoid undocumented anonymous-rate bursts. */
import {
	checkIfIsoDateIsValid,
	checkIfValueIsRecord,
	createValidationError,
} from '#lib/utils/validation.ts';

import { buildOpenBymadataSource } from '../adapters/index.ts';
import { validateBarHistory } from '../utils/index.ts';

import type { ValidationError } from '#lib/utils/validation.ts';
import type {
	OpenBymadataAdapter,
	OpenBymadataFailure,
	OpenBymadataPanel,
	OpenBymadataPanelLineResult,
	OpenBymadataTradingLineDescriptor,
} from '../adapters/index.ts';
import type {
	BarHistory,
	DailyBar,
	SessionDateRange,
	ValidationIssue,
} from '../bar-history.types.ts';
import type {
	BarHistoryAcquirer,
	BarHistoryAcquisitionFailure,
	BarHistoryAcquisitionLine,
	BarHistoryAcquisitionLineResult,
	BarHistoryAcquisitionMode,
	BarHistoryAcquisitionResult,
	BarHistoryPause,
} from './bar-history-acquirer.types.ts';

const HISTORY_START_SESSION = '2000-01-01';
const HISTORICAL_REQUEST_PAUSE_MS = 2_000;
const TIMEZONE = 'America/Argentina/Buenos_Aires';
const ACQUISITION_MODES = new Set<BarHistoryAcquisitionMode>([
	'catch-up',
	'initial-backfill',
	'ordinary-refresh',
	'reconciliation',
]);
const PANELS = new Set<OpenBymadataPanel>(['cedears', 'general-equity', 'leading-equity']);

/**
 * Acquires normalized Daily Bar candidates using caller-authorized update modes.
 *
 * It does not reconcile candidates, write storage, or decide whether an undated provider panel
 * represents a completed session. The scheduled caller makes that last decision.
 */
export function createBarHistoryAcquirer(
	adapter: OpenBymadataAdapter,
	pause: BarHistoryPause = Bun.sleep,
): BarHistoryAcquirer {
	return {
		acquire: (request) => acquireBarHistories(adapter, pause, request),
	};
}

async function acquireBarHistories(
	adapter: OpenBymadataAdapter,
	pause: BarHistoryPause,
	request: unknown,
): Promise<BarHistoryAcquisitionResult> {
	const requestValidation = validateAcquisitionRequest(request);

	if (!requestValidation.isValid) {
		return createInvalidRequestFailure(requestValidation.issues);
	}

	const { lines, throughSession } = requestValidation.request;
	const resultsByTradingLineId = new Map<string, BarHistoryAcquisitionLineResult>();
	const historicalLines = selectHistoricalLines(lines, throughSession);
	const panelLines = selectOrdinaryRefreshLines(lines, throughSession);

	await acquireHistoricalLines(
		adapter,
		pause,
		historicalLines,
		throughSession,
		resultsByTradingLineId,
	);
	await acquirePanelLines(adapter, panelLines, throughSession, resultsByTradingLineId);

	const results = lines.map((line) => {
		const result = resultsByTradingLineId.get(line.tradingLine.tradingLineId);

		if (result) {
			return result;
		}

		return createNotRequiredResult(line.tradingLine.tradingLineId);
	});

	return { ok: true, lines: results };
}

function validateAcquisitionRequest(value: unknown): AcquisitionRequestValidationResult {
	if (!checkIfValueIsRecord(value)) {
		return createValidationError([
			createValidationIssue(
				'invalid-type',
				'request',
				'Bar History acquisition request must be an object.',
			),
		]);
	}

	const throughSessionValidation = validateSessionDate(value.throughSession, 'throughSession');
	const linesValidation = validateAcquisitionLines(value.lines);

	if (!throughSessionValidation.isValid || !linesValidation.isValid) {
		return createValidationError([
			...selectValidationIssues(throughSessionValidation),
			...selectValidationIssues(linesValidation),
		]);
	}

	const reconciliationProgressIssues = validateReconciliationProgress(
		linesValidation.value,
		throughSessionValidation.value,
	);

	if (reconciliationProgressIssues.length > 0) {
		return createValidationError(reconciliationProgressIssues);
	}

	return {
		isValid: true,
		request: {
			throughSession: throughSessionValidation.value,
			lines: linesValidation.value,
		},
	};
}

function validateAcquisitionLines(value: unknown): AcquisitionLinesValidationResult {
	if (!Array.isArray(value)) {
		return createValidationError([
			createValidationIssue('invalid-type', 'lines', 'Acquisition lines must be an array.'),
		]);
	}

	const lineValidations = value.map((line, index) => validateAcquisitionLine(line, index));
	const lineIssues = lineValidations.flatMap((validation) => validation.issues);
	const duplicateIssues = validateUniqueTradingLineIds(lineValidations);
	const issues = [...lineIssues, ...duplicateIssues];

	if (issues.length > 0) {
		return createValidationError(issues);
	}

	return {
		isValid: true,
		value: lineValidations.flatMap((validation) =>
			validation.isValid ? [validation.value] : [],
		),
		issues: [],
	};
}

function validateAcquisitionLine(value: unknown, index: number): AcquisitionLineValidationResult {
	const path = `lines[${index}]`;

	if (!checkIfValueIsRecord(value)) {
		return createValidationError([
			createValidationIssue('invalid-type', path, 'Acquisition line must be an object.'),
		]);
	}

	const tradingLineValidation = validateTradingLine(value.tradingLine, `${path}.tradingLine`);
	const modeValidation = validateAcquisitionMode(value.mode, `${path}.mode`);
	const historyValidation = validateExistingHistory(
		value.existingHistory,
		`${path}.existingHistory`,
	);
	const issues = [
		...tradingLineValidation.issues,
		...modeValidation.issues,
		...historyValidation.issues,
	];

	if (tradingLineValidation.isValid && modeValidation.isValid && historyValidation.isValid) {
		const modeCompatibilityIssue = validateModeCompatibility(
			modeValidation.value,
			historyValidation.value,
			path,
		);

		if (modeCompatibilityIssue) {
			return createValidationError([modeCompatibilityIssue]);
		}

		const historyIdentityIssue = validateHistoryIdentity(
			tradingLineValidation.value,
			historyValidation.value,
			path,
		);

		if (historyIdentityIssue) {
			return createValidationError([historyIdentityIssue]);
		}

		const historySourceIssue = validateHistorySource(
			tradingLineValidation.value,
			historyValidation.value,
			path,
		);

		if (historySourceIssue) {
			return createValidationError([historySourceIssue]);
		}

		return {
			isValid: true,
			value: {
				tradingLine: tradingLineValidation.value,
				existingHistory: historyValidation.value,
				mode: modeValidation.value,
			},
			issues: [],
		};
	}

	return createValidationError(issues);
}

function validateTradingLine(value: unknown, path: string): TradingLineValidationResult {
	if (!checkIfValueIsRecord(value)) {
		return createValidationError([
			createValidationIssue('invalid-type', path, 'Trading Line must be an object.'),
		]);
	}

	const issues = [
		...validateNonBlankString(value.tradingLineId, `${path}.tradingLineId`),
		...validateNonBlankString(value.symbol, `${path}.symbol`),
		...validatePanel(value.panel, `${path}.panel`),
	];

	if (issues.length > 0) {
		return createValidationError(issues);
	}

	return { isValid: true, value: value as OpenBymadataTradingLineDescriptor, issues: [] };
}

function validateAcquisitionMode(value: unknown, path: string): AcquisitionModeValidationResult {
	if (typeof value === 'string' && ACQUISITION_MODES.has(value as BarHistoryAcquisitionMode)) {
		return { isValid: true, value: value as BarHistoryAcquisitionMode, issues: [] };
	}

	return createValidationError([
		createValidationIssue('invalid-value', path, 'Acquisition mode is not supported.'),
	]);
}

function validateExistingHistory(value: unknown, path: string): ExistingHistoryValidationResult {
	if (value === null) {
		return { isValid: true, value: null, issues: [] };
	}

	const historyValidation = validateBarHistory(value);

	if (historyValidation.isValid) {
		return { isValid: true, value: value as BarHistory, issues: [] };
	}

	const issues = historyValidation.issues.map((issue) => ({
		...issue,
		path: `${path}.${issue.path}`,
	}));

	return createValidationError(issues);
}

function validateModeCompatibility(
	mode: BarHistoryAcquisitionMode,
	existingHistory: BarHistory | null,
	path: string,
): ValidationIssue | null {
	if (mode === 'initial-backfill' && existingHistory === null) {
		return null;
	}

	if (mode !== 'initial-backfill' && existingHistory !== null) {
		return null;
	}

	return createValidationIssue(
		'invalid-value',
		`${path}.mode`,
		'Initial backfill requires no stored history; all other modes require stored history.',
	);
}

function validateHistoryIdentity(
	tradingLine: OpenBymadataTradingLineDescriptor,
	existingHistory: BarHistory | null,
	path: string,
): ValidationIssue | null {
	if (!existingHistory || existingHistory.tradingLineId === tradingLine.tradingLineId) {
		return null;
	}

	return createValidationIssue(
		'invalid-value',
		`${path}.existingHistory.tradingLineId`,
		'Stored Bar History belongs to a different Trading Line.',
	);
}

function validateHistorySource(
	tradingLine: OpenBymadataTradingLineDescriptor,
	existingHistory: BarHistory | null,
	path: string,
): ValidationIssue | null {
	if (!existingHistory) {
		return null;
	}

	const expectedSource = buildOpenBymadataSource(tradingLine);
	const hasExpectedSource =
		existingHistory.source.provider === expectedSource.provider &&
		existingHistory.source.symbol === expectedSource.symbol;

	if (hasExpectedSource) {
		return null;
	}

	return createValidationIssue(
		'invalid-value',
		`${path}.existingHistory.source`,
		'Stored Bar History uses different provider source information.',
	);
}

function validateReconciliationProgress(
	lines: readonly BarHistoryAcquisitionLine[],
	throughSession: string,
): ValidationIssue[] {
	return lines.flatMap((line, index) => {
		if (line.mode !== 'reconciliation' || !line.existingHistory) {
			return [];
		}

		if (throughSession >= line.existingHistory.checkedThroughSession) {
			return [];
		}

		return [
			createValidationIssue(
				'invalid-value',
				`lines[${index}].mode`,
				'Reconciliation cannot move behind the stored check progress.',
			),
		];
	});
}

function validateUniqueTradingLineIds(
	lineValidations: readonly AcquisitionLineValidationResult[],
): ValidationIssue[] {
	const seenTradingLineIds = new Set<string>();

	return lineValidations.flatMap((validation, index) => {
		if (!validation.isValid) {
			return [];
		}

		const tradingLineId = validation.value.tradingLine.tradingLineId;

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

function validateSessionDate(value: unknown, path: string): SessionDateValidationResult {
	if (typeof value === 'string' && checkIfIsoDateIsValid(value)) {
		return { isValid: true, value, issues: [] };
	}

	return createValidationError([
		createValidationIssue('invalid-date', path, 'Value must be a real YYYY-MM-DD date.'),
	]);
}

function validateNonBlankString(value: unknown, path: string): ValidationIssue[] {
	if (typeof value === 'string' && value.trim().length > 0) {
		return [];
	}

	return [createValidationIssue('invalid-value', path, 'Value must be a non-blank string.')];
}

function validatePanel(value: unknown, path: string): ValidationIssue[] {
	if (typeof value === 'string' && PANELS.has(value as OpenBymadataPanel)) {
		return [];
	}

	return [createValidationIssue('invalid-value', path, 'Provider panel is not supported.')];
}

function selectHistoricalLines(
	lines: readonly BarHistoryAcquisitionLine[],
	throughSession: string,
): readonly BarHistoryAcquisitionLine[] {
	return lines.filter((line) => {
		if (line.mode === 'initial-backfill' || line.mode === 'reconciliation') {
			return true;
		}

		if (line.mode !== 'catch-up' || !line.existingHistory) {
			return false;
		}

		return line.existingHistory.checkedThroughSession < throughSession;
	});
}

function selectOrdinaryRefreshLines(
	lines: readonly BarHistoryAcquisitionLine[],
	throughSession: string,
): readonly BarHistoryAcquisitionLine[] {
	return lines.filter(
		(line) =>
			line.mode === 'ordinary-refresh' &&
			line.existingHistory !== null &&
			line.existingHistory.checkedThroughSession < throughSession,
	);
}

async function acquireHistoricalLines(
	adapter: OpenBymadataAdapter,
	pause: BarHistoryPause,
	lines: readonly BarHistoryAcquisitionLine[],
	throughSession: string,
	resultsByTradingLineId: Map<string, BarHistoryAcquisitionLineResult>,
): Promise<void> {
	for (const [index, line] of lines.entries()) {
		if (index > 0) {
			await pause(HISTORICAL_REQUEST_PAUSE_MS);
		}

		const result = await acquireHistoricalLine(adapter, line, throughSession);
		resultsByTradingLineId.set(line.tradingLine.tradingLineId, result);
	}
}

async function acquireHistoricalLine(
	adapter: OpenBymadataAdapter,
	line: BarHistoryAcquisitionLine,
	throughSession: string,
): Promise<BarHistoryAcquisitionLineResult> {
	const range = createHistoricalRange(line, throughSession);
	const result = await adapter.fetchHistory({
		tradingLine: line.tradingLine,
		fromEpochSeconds: convertSessionDateToEpochSeconds(range.start),
		toEpochSeconds: convertSessionDateToEpochSeconds(range.end),
		throughSession,
	});

	if (!result.ok) {
		return createProviderFailure(line.tradingLine.tradingLineId, result);
	}

	const reconciliationWindow = buildReconciliationWindow(line.mode, result.bars, range);

	return {
		status: 'available',
		tradingLineId: line.tradingLine.tradingLineId,
		source: result.source,
		bars: result.bars,
		reconciliationWindow,
	};
}

function buildReconciliationWindow(
	mode: BarHistoryAcquisitionMode,
	bars: readonly DailyBar[],
	requestedRange: SessionDateRange,
): SessionDateRange | null {
	if (mode !== 'reconciliation') {
		return null;
	}

	const earliestReturnedSession = selectEarliestSessionDate(bars);
	const authoritativeStart =
		earliestReturnedSession && earliestReturnedSession > requestedRange.start
			? earliestReturnedSession
			: requestedRange.start;

	return { start: authoritativeStart, end: requestedRange.end };
}

function selectEarliestSessionDate(bars: readonly DailyBar[]): string | null {
	return bars.reduce<string | null>((earliestSession, bar) => {
		if (!earliestSession || bar.sessionDate < earliestSession) {
			return bar.sessionDate;
		}

		return earliestSession;
	}, null);
}

function createHistoricalRange(
	line: BarHistoryAcquisitionLine,
	throughSession: string,
): SessionDateRange {
	if (line.mode === 'catch-up' && line.existingHistory) {
		return {
			start: getNextSessionDate(line.existingHistory.checkedThroughSession),
			end: throughSession,
		};
	}

	return { start: HISTORY_START_SESSION, end: throughSession };
}

function getNextSessionDate(sessionDate: string): string {
	return Temporal.PlainDate.from(sessionDate).add({ days: 1 }).toString();
}

function convertSessionDateToEpochSeconds(sessionDate: string): number {
	return Temporal.PlainDate.from(sessionDate).toZonedDateTime(TIMEZONE).epochMilliseconds / 1_000;
}

async function acquirePanelLines(
	adapter: OpenBymadataAdapter,
	lines: readonly BarHistoryAcquisitionLine[],
	throughSession: string,
	resultsByTradingLineId: Map<string, BarHistoryAcquisitionLineResult>,
): Promise<void> {
	const linesByPanel = groupLinesByPanel(lines);

	for (const panelLines of linesByPanel.values()) {
		const result = await adapter.fetchPanel({
			tradingLines: panelLines.map((line) => line.tradingLine),
			throughSession,
		});

		if (!result.ok) {
			for (const line of panelLines) {
				resultsByTradingLineId.set(
					line.tradingLine.tradingLineId,
					createProviderFailure(line.tradingLine.tradingLineId, result),
				);
			}

			continue;
		}

		for (const line of panelLines) {
			const panelLine = result.lines.find(
				(candidate) => candidate.tradingLineId === line.tradingLine.tradingLineId,
			);
			const acquisitionResult = createPanelAcquisitionResult(
				line.tradingLine.tradingLineId,
				panelLine,
			);
			resultsByTradingLineId.set(line.tradingLine.tradingLineId, acquisitionResult);
		}
	}
}

function groupLinesByPanel(
	lines: readonly BarHistoryAcquisitionLine[],
): ReadonlyMap<OpenBymadataPanel, readonly BarHistoryAcquisitionLine[]> {
	const linesByPanel = new Map<OpenBymadataPanel, BarHistoryAcquisitionLine[]>();

	for (const line of lines) {
		const panel = line.tradingLine.panel;
		const panelLines = linesByPanel.get(panel) ?? [];
		panelLines.push(line);
		linesByPanel.set(panel, panelLines);
	}

	return linesByPanel;
}

function createPanelAcquisitionResult(
	tradingLineId: string,
	panelLine: OpenBymadataPanelLineResult | undefined,
): BarHistoryAcquisitionLineResult {
	if (!panelLine) {
		return {
			status: 'failed',
			tradingLineId,
			reason: 'invalid-response',
			message: 'Open BYMADATA omitted a requested Trading Line from its panel response.',
		};
	}

	if (panelLine.status === 'missing') {
		return {
			status: 'failed',
			tradingLineId,
			reason: 'missing-provider-line',
			message: 'Open BYMADATA did not return the requested Trading Line.',
		};
	}

	if (panelLine.status === 'excluded') {
		return {
			status: 'available',
			tradingLineId,
			source: panelLine.source,
			bars: [],
			reconciliationWindow: null,
		};
	}

	return {
		status: 'available',
		tradingLineId,
		source: panelLine.source,
		bars: [panelLine.bar],
		reconciliationWindow: null,
	};
}

function createProviderFailure(
	tradingLineId: string,
	failure: OpenBymadataFailure,
): BarHistoryAcquisitionLineResult {
	return {
		status: 'failed',
		tradingLineId,
		reason: failure.reason,
		message: failure.message,
	};
}

function createNotRequiredResult(tradingLineId: string): BarHistoryAcquisitionLineResult {
	return { status: 'not-required', tradingLineId };
}

function createInvalidRequestFailure(
	issues: readonly ValidationIssue[],
): BarHistoryAcquisitionFailure {
	return {
		ok: false,
		reason: 'invalid-request',
		message: 'The Bar History acquisition request is invalid.',
		issues,
	};
}

function createValidationIssue(
	code: ValidationIssue['code'],
	path: string,
	message: string,
): ValidationIssue {
	return { code, path, message };
}

function selectValidationIssues(
	validation: AcquisitionLinesValidationResult | SessionDateValidationResult,
): readonly ValidationIssue[] {
	return validation.isValid ? [] : validation.issues;
}

type AcquisitionRequestValidationResult =
	| Readonly<{
			isValid: true;
			request: Readonly<{
				lines: readonly BarHistoryAcquisitionLine[];
				throughSession: string;
			}>;
	  }>
	| ValidationError<ValidationIssue>;

type AcquisitionLinesValidationResult =
	| Readonly<{
			isValid: true;
			value: readonly BarHistoryAcquisitionLine[];
			issues: readonly [];
	  }>
	| ValidationError<ValidationIssue>;

type AcquisitionLineValidationResult =
	| Readonly<{
			isValid: true;
			value: BarHistoryAcquisitionLine;
			issues: readonly [];
	  }>
	| ValidationError<ValidationIssue>;

type TradingLineValidationResult =
	| Readonly<{
			isValid: true;
			value: OpenBymadataTradingLineDescriptor;
			issues: readonly [];
	  }>
	| ValidationError<ValidationIssue>;

type AcquisitionModeValidationResult =
	| Readonly<{
			isValid: true;
			value: BarHistoryAcquisitionMode;
			issues: readonly [];
	  }>
	| ValidationError<ValidationIssue>;

type ExistingHistoryValidationResult =
	| Readonly<{ isValid: true; value: BarHistory | null; issues: readonly [] }>
	| ValidationError<ValidationIssue>;

type SessionDateValidationResult =
	| Readonly<{ isValid: true; value: string; issues: readonly [] }>
	| ValidationError<ValidationIssue>;
