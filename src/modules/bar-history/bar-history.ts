import {
	checkIfBarHistoriesAreEqual,
	findMissingStoredSessionDates,
	findOutOfWindowSessionDates,
	mergeDailyBars,
	validateBarHistory,
	validateDailyBars,
	validateReconciliationRequest,
} from './utils';

import type {
	BarHistory,
	BarHistoryFailure,
	BarHistoryFailureReason,
	BarHistoryResult,
	BarHistoryStatus,
	DailyBar,
	ReconcileBarHistoryInput,
	ValidationIssue,
} from './bar-history.types.ts';

/**
 * Builds the complete Bar History that may replace stored state.
 *
 * The function performs no I/O and does not mutate either the existing history or incoming bars.
 * A failed result always carries the previous history supplied by the caller.
 */
export function reconcileBarHistory(input: ReconcileBarHistoryInput): BarHistoryResult {
	/*
	|--------------------------------------------------------------------------
	| VALIDATIONS START
	|--------------------------------------------------------------------------
	*/
	const requestValidation = validateReconciliationRequest(input);

	if (!requestValidation.isValid) {
		return createFailure(
			input,
			'invalid-request',
			'The reconciliation request is invalid.',
			requestValidation.issues,
		);
	}

	const existingHistoryFailure = validateExistingHistory(input);

	if (existingHistoryFailure) {
		return existingHistoryFailure;
	}

	const identityFailure = validateExistingIdentity(input);

	if (identityFailure) {
		return identityFailure;
	}

	const incomingValidation = validateDailyBars(input.incomingBars, false, 'incomingBars');

	if (!incomingValidation.isValid) {
		return createFailure(
			input,
			'invalid-incoming-bars',
			'The incoming Daily Bars are invalid.',
			incomingValidation.issues,
		);
	}

	const checkedThroughSessionFailure = validateCheckedThroughSession(input);

	if (checkedThroughSessionFailure) {
		return checkedThroughSessionFailure;
	}

	const incrementalBarsFailure = validateIncrementalBars(input);

	if (incrementalBarsFailure) {
		return incrementalBarsFailure;
	}

	const windowFailure = validateAuthoritativeWindow(input);

	if (windowFailure) {
		return windowFailure;
	}

	/*
	|--------------------------------------------------------------------------
	| VALIDATIONS END
	|--------------------------------------------------------------------------
	*/

	const mergedBars = mergeDailyBars(input.existingHistory?.bars ?? [], input.incomingBars);
	const candidateHistory = buildCandidateHistory(input, mergedBars.bars);
	const candidateValidation = validateBarHistory(candidateHistory);

	if (!candidateValidation.isValid) {
		return createFailure(
			input,
			'invalid-resulting-history',
			'The resulting Bar History is invalid.',
			candidateValidation.issues,
		);
	}

	const status = resolveStatus(input.existingHistory, candidateHistory);
	const history =
		status === 'unchanged' && input.existingHistory ? input.existingHistory : candidateHistory;

	return {
		ok: true,
		status,
		history,
		corrections: mergedBars.corrections,
	};
}

function validateExistingHistory(input: ReconcileBarHistoryInput): BarHistoryFailure | null {
	if (!input.existingHistory) {
		return null;
	}

	const validation = validateBarHistory(input.existingHistory);

	if (validation.isValid) {
		return null;
	}

	return createFailure(
		input,
		'invalid-existing-history',
		'The existing Bar History is invalid.',
		validation.issues,
	);
}

function validateExistingIdentity(input: ReconcileBarHistoryInput): BarHistoryFailure | null {
	const { existingHistory, source, tradingLineId } = input;

	if (!existingHistory) {
		return null;
	}

	if (existingHistory.tradingLineId !== tradingLineId) {
		return createFailure(
			input,
			'trading-line-mismatch',
			'The existing history belongs to a different Trading Line.',
		);
	}

	const hasSameProvider = existingHistory.source.provider === source.provider;
	const hasSameSymbol = existingHistory.source.symbol === source.symbol;

	if (!hasSameProvider || !hasSameSymbol) {
		return createFailure(
			input,
			'source-mismatch',
			'The existing history uses different source information.',
		);
	}

	return null;
}

/**
 * Protects the meaning of `checkedThroughSession`: the latest completed session whose provider
 * response has been accepted, even when that session produced no real bar.
 *
 * Progress cannot move behind the stored value, and incoming bars cannot extend beyond the session
 * the caller claims to have checked.
 */
function validateCheckedThroughSession(input: ReconcileBarHistoryInput): BarHistoryFailure | null {
	const { existingHistory, incomingBars, throughSession } = input;
	const hasRegressedProgress =
		existingHistory !== null && throughSession < existingHistory.checkedThroughSession;

	if (hasRegressedProgress) {
		return createFailure(
			input,
			'check-progress-regression',
			'The requested check-through session is older than stored progress.',
		);
	}

	const barsAfterCheckThrough = incomingBars
		.map((bar, index) => ({ bar, index }))
		.filter(({ bar }) => bar.sessionDate > throughSession);

	if (barsAfterCheckThrough.length === 0) {
		return null;
	}

	const issues = barsAfterCheckThrough.map<ValidationIssue>(({ bar, index }) => ({
		code: 'bar-after-check-through',
		path: `incomingBars[${index}].sessionDate`,
		message: `Session ${bar.sessionDate} is later than ${throughSession}.`,
	}));

	return createFailure(
		input,
		'invalid-incoming-bars',
		'Incoming bars extend beyond the requested completed session.',
		issues,
	);
}

function validateIncrementalBars(input: ReconcileBarHistoryInput): BarHistoryFailure | null {
	const { existingHistory, incomingBars, reconciliationWindow } = input;

	if (!existingHistory || reconciliationWindow) {
		return null;
	}

	const storedBarsBySessionDate = new Map(
		existingHistory.bars.map((bar) => [bar.sessionDate, bar]),
	);
	const unexpectedCoveredBars = incomingBars
		.map((bar, index) => ({ bar, index }))
		.filter(({ bar }) => bar.sessionDate <= existingHistory.checkedThroughSession)
		.filter(({ bar }) => {
			const storedBar = storedBarsBySessionDate.get(bar.sessionDate);
			return !storedBar || !Bun.deepEquals(storedBar, bar, true);
		});

	if (unexpectedCoveredBars.length === 0) {
		return null;
	}

	const issues = unexpectedCoveredBars.map<ValidationIssue>(({ bar, index }) => ({
		code: 'invalid-value',
		path: `incomingBars[${index}]`,
		message: `Session ${bar.sessionDate} requires reconciliation because it was already checked.`,
	}));

	return createFailure(
		input,
		'invalid-incoming-bars',
		'Ordinary refresh cannot add or change already-checked sessions.',
		issues,
	);
}

/**
 * Treats the provider's returned interval as authoritative without allowing it to erase history.
 * Every supplied bar must fall inside the interval, and every previously stored real bar inside
 * that interval must still be present. Older bars outside the interval remain untouched.
 */
function validateAuthoritativeWindow(input: ReconcileBarHistoryInput): BarHistoryFailure | null {
	const { existingHistory, incomingBars, reconciliationWindow } = input;

	if (!reconciliationWindow) {
		return null;
	}

	const outOfWindowDates = findOutOfWindowSessionDates(incomingBars, reconciliationWindow);

	if (outOfWindowDates.length > 0) {
		const issues = outOfWindowDates.map<ValidationIssue>((sessionDate) => ({
			code: 'invalid-value',
			path: 'incomingBars',
			message: `Session ${sessionDate} is outside the authoritative reconciliation window.`,
		}));

		return createFailure(
			input,
			'invalid-request',
			'Reconciliation bars must stay inside the authoritative window.',
			issues,
		);
	}

	if (!existingHistory) {
		return null;
	}

	const missingSessionDates = findMissingStoredSessionDates(
		existingHistory.bars,
		incomingBars,
		reconciliationWindow,
	);

	if (missingSessionDates.length === 0) {
		return null;
	}

	const issues = missingSessionDates.map<ValidationIssue>((sessionDate) => ({
		code: 'invalid-value',
		path: 'incomingBars',
		message: `Previously stored session ${sessionDate} is missing from the authoritative window.`,
	}));

	return createFailure(
		input,
		'history-shrinkage',
		'A previously stored real bar disappeared inside the authoritative window.',
		issues,
	);
}

function buildCandidateHistory(
	input: ReconcileBarHistoryInput,
	bars: readonly DailyBar[],
): BarHistory {
	const {
		checkedAt,
		existingHistory,
		reconciliationWindow,
		source,
		throughSession,
		tradingLineId,
	} = input;
	const isInitialBackfill = existingHistory === null;
	const backfilledAt = existingHistory?.backfilledAt ?? checkedAt;
	const lastReconciledAt =
		!isInitialBackfill && reconciliationWindow
			? checkedAt
			: (existingHistory?.lastReconciledAt ?? null);

	return {
		schemaVersion: 1,
		tradingLineId,
		source: { ...source },
		priceAdjustment: 'none',
		backfilledAt,
		lastReconciledAt,
		checkedThroughSession: throughSession,
		bars,
	};
}

function resolveStatus(
	existingHistory: BarHistory | null,
	candidateHistory: BarHistory,
): Exclude<BarHistoryStatus, 'failed'> {
	if (!existingHistory) {
		return 'created';
	}

	if (checkIfBarHistoriesAreEqual(existingHistory, candidateHistory)) {
		return 'unchanged';
	}

	return 'updated';
}

function createFailure(
	input: ReconcileBarHistoryInput,
	reason: BarHistoryFailureReason,
	message: string,
	issues: readonly ValidationIssue[] = [],
): BarHistoryFailure {
	return {
		ok: false,
		status: 'failed',
		reason,
		message,
		issues,
		previousHistory: input.existingHistory,
	};
}
