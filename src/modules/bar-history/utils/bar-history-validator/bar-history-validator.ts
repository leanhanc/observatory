import * as v from 'valibot';

import {
	checkIfValueIsRecord,
	createValibotObjectPath,
	mapValibotIssues,
} from '../../../../lib/utils/validation.ts';

import type { ReconcileBarHistoryInput, ValidationIssue } from '../../bar-history.types.ts';
import type { ValidationResult } from './bar-history-validator.types.ts';

const messages = {
	barHistoryObject: 'Bar History must be an object.',
	dailyBarObject: 'Daily Bar must be an object.',
	dailyBarsArray: 'Daily Bars must be an array.',
	invalidNumber: 'Value must be a finite number.',
	invalidPriceRange: 'Price values must respect the Daily Bar range.',
	invalidSchemaVersion: 'Schema version must be 1.',
	invalidSessionDate: 'Value must be a real YYYY-MM-DD date.',
	invalidUtcInstant: 'Value must be a valid UTC ISO-8601 instant.',
	invalidValue: 'Value is not supported by storage schema v1.',
	negativeNumber: 'Value must not be negative.',
	sourceObject: 'Source must be an object.',
} as const;

const issueCodesByMessage: Readonly<Record<string, ValidationIssue['code']>> = {
	[messages.barHistoryObject]: 'invalid-type',
	[messages.dailyBarObject]: 'invalid-type',
	[messages.dailyBarsArray]: 'invalid-type',
	[messages.invalidNumber]: 'invalid-number',
	[messages.invalidPriceRange]: 'invalid-price-range',
	[messages.invalidSchemaVersion]: 'invalid-schema-version',
	[messages.invalidSessionDate]: 'invalid-date',
	[messages.invalidUtcInstant]: 'invalid-date',
	[messages.invalidValue]: 'invalid-value',
	[messages.negativeNumber]: 'negative-number',
	[messages.sourceObject]: 'invalid-type',
};

const sessionDateSchema = v.pipe(
	v.string(messages.invalidSessionDate),
	v.isoDate(messages.invalidSessionDate),
	v.check(checkIfSessionDateIsValid, messages.invalidSessionDate),
);

const utcInstantSchema = v.pipe(
	v.string(messages.invalidUtcInstant),
	v.isoTimestamp(messages.invalidUtcInstant),
	v.endsWith('Z', messages.invalidUtcInstant),
	v.check(checkIfUtcInstantIsValid, messages.invalidUtcInstant),
);

const nonEmptyStringSchema = v.pipe(
	v.string(messages.invalidValue),
	v.nonEmpty(messages.invalidValue),
);

const nonNegativeNumberSchema = v.pipe(
	v.number(messages.invalidNumber),
	v.finite(messages.invalidNumber),
	v.minValue(0, messages.negativeNumber),
);

const sourceSchema = v.strictObject(
	{
		provider: v.literal('open-bymadata', messages.invalidValue),
		symbol: nonEmptyStringSchema,
	},
	messages.sourceObject,
);

const dailyBarSchema = v.pipe(
	v.strictObject(
		{
			sessionDate: sessionDateSchema,
			open: nonNegativeNumberSchema,
			high: nonNegativeNumberSchema,
			low: nonNegativeNumberSchema,
			close: nonNegativeNumberSchema,
			volume: nonNegativeNumberSchema,
		},
		messages.dailyBarObject,
	),
	v.rawCheck(({ dataset, addIssue }) => {
		if (!dataset.typed) {
			return;
		}

		const { close, high, low, open } = dataset.value;

		if (low > high) {
			addIssue({ message: messages.invalidPriceRange });
			return;
		}

		if (open < low || open > high) {
			addIssue({
				message: messages.invalidPriceRange,
				path: [createValibotObjectPath(dataset.value, 'open')],
			});
		}

		if (close < low || close > high) {
			addIssue({
				message: messages.invalidPriceRange,
				path: [createValibotObjectPath(dataset.value, 'close')],
			});
		}
	}),
);

const dailyBarsSchema = v.array(dailyBarSchema, messages.dailyBarsArray);

const barHistorySchema = v.strictObject(
	{
		schemaVersion: v.literal(1, messages.invalidSchemaVersion),
		tradingLineId: nonEmptyStringSchema,
		source: sourceSchema,
		priceAdjustment: v.literal('none', messages.invalidValue),
		backfilledAt: utcInstantSchema,
		lastReconciledAt: v.nullable(utcInstantSchema),
		checkedThroughSession: sessionDateSchema,
		bars: v.unknown(),
	},
	messages.barHistoryObject,
);

const sessionDateRangeSchema = v.strictObject({
	start: sessionDateSchema,
	end: sessionDateSchema,
});

const reconciliationRequestSchema = v.strictObject({
	existingHistory: v.unknown(),
	tradingLineId: nonEmptyStringSchema,
	source: sourceSchema,
	incomingBars: v.unknown(),
	throughSession: sessionDateSchema,
	checkedAt: utcInstantSchema,
	reconciliationWindow: v.nullable(sessionDateRangeSchema),
});

export function validateBarHistory(value: unknown): ValidationResult {
	const historyValidation = v.safeParse(barHistorySchema, value);
	const issues = mapValibotIssues(historyValidation.issues, resolveIssueCode, 'history');

	if (!checkIfValueIsRecord(value)) {
		return fromIssues(issues);
	}

	const barsValidation = validateDailyBars(value.bars, true, 'history.bars');
	issues.push(...barsValidation.issues);

	if (Array.isArray(value.bars) && typeof value.checkedThroughSession === 'string') {
		validateBarsDoNotExceedCheckThrough(value.bars, value.checkedThroughSession, issues);
	}

	return fromIssues(issues);
}

export function validateDailyBars(
	value: unknown,
	requireChronologicalOrder: boolean,
	path: string,
): ValidationResult {
	const barsValidation = v.safeParse(dailyBarsSchema, value);
	const issues = mapValibotIssues(barsValidation.issues, resolveIssueCode, path);

	if (!Array.isArray(value)) {
		return fromIssues(issues);
	}

	const sessionDates = value.flatMap((bar) =>
		checkIfValueIsRecord(bar) && typeof bar.sessionDate === 'string' ? [bar.sessionDate] : [],
	);

	validateUniqueSessionDates(sessionDates, path, issues);

	if (requireChronologicalOrder) {
		validateChronologicalOrder(sessionDates, path, issues);
	}

	return fromIssues(issues);
}

export function validateReconciliationRequest(input: ReconcileBarHistoryInput): ValidationResult {
	const requestValidation = v.safeParse(reconciliationRequestSchema, input);
	const issues = mapValibotIssues(requestValidation.issues, resolveIssueCode);

	if (!requestValidation.success || !requestValidation.output.reconciliationWindow) {
		return fromIssues(issues);
	}

	const { reconciliationWindow, throughSession } = requestValidation.output;

	if (reconciliationWindow.start > reconciliationWindow.end) {
		issues.push(
			createIssue(
				'invalid-value',
				'reconciliationWindow',
				'Reconciliation window start must not be after its end.',
			),
		);
	}

	if (reconciliationWindow.end !== throughSession) {
		issues.push(
			createIssue(
				'invalid-value',
				'reconciliationWindow.end',
				'Reconciliation window must end at the check-through session.',
			),
		);
	}

	return fromIssues(issues);
}

function validateUniqueSessionDates(
	sessionDates: readonly string[],
	path: string,
	issues: ValidationIssue[],
): void {
	const seenSessionDates = new Set<string>();

	for (const sessionDate of sessionDates) {
		if (seenSessionDates.has(sessionDate)) {
			issues.push(
				createIssue(
					'duplicate-session-date',
					path,
					`Session ${sessionDate} occurs more than once.`,
				),
			);
		}

		seenSessionDates.add(sessionDate);
	}
}

function validateChronologicalOrder(
	sessionDates: readonly string[],
	path: string,
	issues: ValidationIssue[],
): void {
	for (let index = 1; index < sessionDates.length; index += 1) {
		const previousSessionDate = sessionDates[index - 1];
		const sessionDate = sessionDates[index];
		const hasInvalidOrder =
			previousSessionDate !== undefined &&
			sessionDate !== undefined &&
			sessionDate <= previousSessionDate;

		if (hasInvalidOrder) {
			issues.push(
				createIssue(
					'unsorted-session-date',
					path,
					'Bar History must be ordered from oldest to newest.',
				),
			);
			return;
		}
	}
}

function validateBarsDoNotExceedCheckThrough(
	bars: readonly unknown[],
	checkedThroughSession: string,
	issues: ValidationIssue[],
): void {
	for (const [index, bar] of bars.entries()) {
		if (!checkIfValueIsRecord(bar) || typeof bar.sessionDate !== 'string') {
			continue;
		}

		if (bar.sessionDate > checkedThroughSession) {
			issues.push(
				createIssue(
					'bar-after-check-through',
					`history.bars[${index}].sessionDate`,
					'Bar session must not be later than stored check progress.',
				),
			);
		}
	}
}

function resolveIssueCode(issue: v.BaseIssue<unknown>): ValidationIssue['code'] {
	return issueCodesByMessage[issue.message] ?? 'invalid-value';
}

function checkIfSessionDateIsValid(value: string): boolean {
	try {
		const sessionDate = Temporal.PlainDate.from(value);
		return sessionDate.toString() === value;
	} catch {
		return false;
	}
}

function checkIfUtcInstantIsValid(value: string): boolean {
	try {
		Temporal.Instant.from(value);
		return true;
	} catch {
		return false;
	}
}

function createIssue(
	code: ValidationIssue['code'],
	path: string,
	message: string,
): ValidationIssue {
	return { code, path, message };
}

function fromIssues(issues: readonly ValidationIssue[]): ValidationResult {
	return issues.length === 0 ? { isValid: true, issues: [] } : { isValid: false, issues };
}
