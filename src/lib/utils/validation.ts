import type * as v from 'valibot';

type MappedValibotIssue<TCode extends string> = Readonly<{
	code: TCode;
	path: string;
	message: string;
}>;

export function mapValibotIssues<TCode extends string>(
	issues: readonly v.BaseIssue<unknown>[] | undefined,
	resolveCode: (issue: v.BaseIssue<unknown>) => TCode,
	prefix = '',
): MappedValibotIssue<TCode>[] {
	return (issues ?? []).map((issue) => ({
		code: resolveCode(issue),
		path: buildValibotIssuePath(prefix, issue.path),
		message: issue.message,
	}));
}

export function createValibotObjectPath<TValue extends Record<string, unknown>>(
	input: TValue,
	key: Extract<keyof TValue, string>,
): v.ObjectPathItem {
	return {
		type: 'object',
		origin: 'value',
		input,
		key,
		value: input[key],
	};
}

export function checkIfValueIsRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildValibotIssuePath(
	prefix: string,
	path: readonly v.IssuePathItem[] | undefined,
): string {
	return (path ?? []).reduce((currentPath, item) => {
		if (typeof item.key === 'number') {
			return `${currentPath}[${item.key}]`;
		}

		return currentPath ? `${currentPath}.${String(item.key)}` : String(item.key);
	}, prefix);
}
