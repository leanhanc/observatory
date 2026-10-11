import type { BarHistoryStorageConfiguration } from '#modules/bar-history/index.ts';

const REQUIRED_ENVIRONMENT_VARIABLES = [
	'OBSERVATORY_STORAGE_ACCESS_KEY_ID',
	'OBSERVATORY_STORAGE_SECRET_ACCESS_KEY',
	'OBSERVATORY_STORAGE_BUCKET',
	'OBSERVATORY_STORAGE_ENDPOINT',
	'OBSERVATORY_STORAGE_REGION',
	'OBSERVATORY_STORAGE_VIRTUAL_HOSTED_STYLE',
] as const;

export function resolveBarHistoryStorageConfiguration(
	environment: Readonly<Record<string, string | undefined>>,
): BarHistoryStorageConfiguration {
	const missingVariables = REQUIRED_ENVIRONMENT_VARIABLES.filter(
		(name) => !environment[name]?.trim(),
	);

	if (missingVariables.length > 0) {
		throw new Error(`Missing storage configuration: ${missingVariables.join(', ')}.`);
	}

	const virtualHostedStyle = environment.OBSERVATORY_STORAGE_VIRTUAL_HOSTED_STYLE;
	const endpoint = environment.OBSERVATORY_STORAGE_ENDPOINT!;

	if (virtualHostedStyle !== 'true' && virtualHostedStyle !== 'false') {
		throw new Error('OBSERVATORY_STORAGE_VIRTUAL_HOSTED_STYLE must be true or false.');
	}

	if (!URL.canParse(endpoint)) {
		throw new Error('OBSERVATORY_STORAGE_ENDPOINT must be a valid URL.');
	}

	return {
		accessKeyId: environment.OBSERVATORY_STORAGE_ACCESS_KEY_ID!,
		secretAccessKey: environment.OBSERVATORY_STORAGE_SECRET_ACCESS_KEY!,
		bucket: environment.OBSERVATORY_STORAGE_BUCKET!,
		endpoint,
		region: environment.OBSERVATORY_STORAGE_REGION!,
		virtualHostedStyle: virtualHostedStyle === 'true',
	};
}
