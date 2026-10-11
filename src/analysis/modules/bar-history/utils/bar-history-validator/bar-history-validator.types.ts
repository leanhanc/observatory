import type { ValidationError } from '#lib/utils/validation.ts';
import type { ValidationIssue } from '#modules/bar-history/bar-history.types.ts';

export type ValidationResult =
	| Readonly<{ isValid: true; issues: readonly [] }>
	| ValidationError<ValidationIssue>;
