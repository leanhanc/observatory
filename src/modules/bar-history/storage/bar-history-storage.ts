import { validateBarHistory } from '../utils/index.ts';
import { buildBarHistoryStorageKey } from './bar-history-storage-key.ts';

import type { BarHistory, ValidationIssue } from '../bar-history.types.ts';
import type {
	BarHistoryStorage,
	BarHistoryStorageConfiguration,
	BarHistoryStorageFailure,
	BarHistoryStorageReadResult,
	BarHistoryStorageWriteResult,
} from './bar-history-storage.types.ts';

type BarHistoryStorageS3File = Readonly<{
	exists(): Promise<boolean>;
	text(): Promise<string>;
}>;

type BarHistoryStorageS3Client = Readonly<{
	file(path: string): BarHistoryStorageS3File;
	write(path: string, data: string, options: Readonly<{ type: string }>): Promise<number>;
}>;

const JSON_CONTENT_TYPE = 'application/json';

/**
 * Creates storage for complete Bar History envelopes in a private S3-compatible bucket.
 *
 * The configuration is explicit so the application, rather than Bun's ambient environment
 * variables, controls the Railway Bucket and endpoint style used for market data.
 */
export function createBarHistoryStorage(
	configuration: BarHistoryStorageConfiguration,
): BarHistoryStorage {
	const s3Client = new Bun.S3Client(configuration);
	return createBarHistoryStorageFromS3Client(s3Client);
}

export function createBarHistoryStorageFromS3Client(
	s3Client: BarHistoryStorageS3Client,
): BarHistoryStorage {
	return {
		read: async (tradingLineId) => readBarHistory(s3Client, tradingLineId),
		write: async (history) => writeBarHistory(s3Client, history),
	};
}

async function readBarHistory(
	s3Client: BarHistoryStorageS3Client,
	tradingLineId: string,
): Promise<BarHistoryStorageReadResult> {
	const storageKey = buildBarHistoryStorageKey(tradingLineId);
	const file = s3Client.file(storageKey);

	try {
		const exists = await file.exists();

		if (!exists) {
			return createFailure(
				'not-found',
				'No stored Bar History exists for this Trading Line.',
			);
		}

		const serializedHistory = await file.text();
		return parseStoredHistory(serializedHistory, tradingLineId);
	} catch {
		return createFailure('unreadable', 'The stored Bar History could not be read.');
	}
}

async function writeBarHistory(
	s3Client: BarHistoryStorageS3Client,
	history: BarHistory,
): Promise<BarHistoryStorageWriteResult> {
	const historyValidation = validateBarHistory(history);

	if (!historyValidation.isValid) {
		return createFailure(
			'invalid-history',
			'The replacement Bar History is invalid.',
			historyValidation.issues,
		);
	}

	const storageKey = buildBarHistoryStorageKey(history.tradingLineId);
	const serializedHistory = JSON.stringify(history);

	try {
		await s3Client.write(storageKey, serializedHistory, { type: JSON_CONTENT_TYPE });
		return { ok: true, history };
	} catch {
		return createFailure('write-failed', 'The replacement Bar History could not be stored.');
	}
}

function parseStoredHistory(
	serializedHistory: string,
	tradingLineId: string,
): BarHistoryStorageReadResult {
	const parsedHistory = parseStoredHistoryJSON(serializedHistory);

	if (!parsedHistory.ok) {
		return parsedHistory;
	}

	const historyValidation = validateBarHistory(parsedHistory.value);

	if (!historyValidation.isValid) {
		return createFailure(
			'invalid-stored-history',
			'The stored Bar History is invalid.',
			historyValidation.issues,
		);
	}

	const history = parsedHistory.value as BarHistory;

	if (history.tradingLineId !== tradingLineId) {
		return createFailure(
			'invalid-stored-history',
			'The stored Bar History belongs to a different Trading Line.',
			[
				{
					code: 'invalid-value',
					path: 'history.tradingLineId',
					message: `Stored Trading Line ${history.tradingLineId} does not match ${tradingLineId}.`,
				},
			],
		);
	}

	return { ok: true, history };
}

function parseStoredHistoryJSON(
	serializedHistory: string,
): Readonly<{ ok: true; value: unknown }> | BarHistoryStorageFailure {
	try {
		return { ok: true, value: JSON.parse(serializedHistory) };
	} catch {
		return createFailure('invalid-stored-history', 'The stored Bar History is not valid JSON.');
	}
}

function createFailure(
	reason: BarHistoryStorageFailure['reason'],
	message: string,
	issues: readonly ValidationIssue[] = [],
): BarHistoryStorageFailure {
	return { ok: false, reason, message, issues };
}
