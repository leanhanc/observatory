import type { ValidationIssue } from '../../bar-history.types.ts';

export type ValidationResult =
	| Readonly<{ isValid: true; issues: readonly [] }>
	| Readonly<{ isValid: false; issues: readonly ValidationIssue[] }>;
