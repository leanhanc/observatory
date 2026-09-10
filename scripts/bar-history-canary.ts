/* oxlint-disable no-console -- This operational command reports a concise pilot summary. */
import { parseArgs } from 'node:util';

import { checkIfIsoDateIsValid } from '#lib/utils/validation.ts';
import {
	createBarHistoryReader,
	createBarHistoryStorage,
	createBarHistoryUpdater,
} from '#modules/bar-history/index.ts';
import { buildBarHistoryStorageKey } from '#modules/bar-history/storage/index.ts';
import { createLogger } from '#modules/logger/index.ts';

import type { OpenBymadataTradingLineDescriptor } from '#modules/bar-history/adapters/index.ts';
import type {
	BarHistory,
	BarHistoryStorage,
	BarHistoryStorageConfiguration,
	BarHistoryStorageReadResult,
	BarHistoryUpdateMode,
	UpdateBarHistoryLine,
} from '#modules/bar-history/index.ts';

const CANARY_TRADING_LINES = [
	{ tradingLineId: 'cedear-aapl-ars', symbol: 'AAPL' },
	{ tradingLineId: 'cedear-aapl-mep', symbol: 'AAPLD' },
	{ tradingLineId: 'cedear-aapl-ccl', symbol: 'AAPLC' },
	{ tradingLineId: 'equity-ypfd-ars', symbol: 'YPFD' },
] as const satisfies readonly OpenBymadataTradingLineDescriptor[];
const LIQUID_CONTROL_IDS = new Set(['cedear-aapl-ars', 'equity-ypfd-ars']);
const INVALID_ROW_ID_PREFIX = '__canary-invalid-row__';
const NO_DATA_ID_PREFIX = '__canary-no-data__';
const PROVIDER_REQUEST_TIMEOUT_MS = 20_000;
const REQUIRED_ENVIRONMENT_VARIABLES = [
	'OBSERVATORY_STORAGE_ACCESS_KEY_ID',
	'OBSERVATORY_STORAGE_SECRET_ACCESS_KEY',
	'OBSERVATORY_STORAGE_BUCKET',
	'OBSERVATORY_STORAGE_ENDPOINT',
	'OBSERVATORY_STORAGE_REGION',
	'OBSERVATORY_STORAGE_VIRTUAL_HOSTED_STYLE',
] as const;

type CanaryLineStatus = 'created' | 'updated' | 'unchanged' | 'verified';
type CanaryUpdateMode = Extract<BarHistoryUpdateMode, 'initial-backfill' | 'refresh'>;

type CanaryLineSummary = Readonly<{
	tradingLineId: string;
	status: CanaryLineStatus;
	barCount: number;
	oldestSessionDate: string | null;
	newestSessionDate: string | null;
}>;

type CanaryInvocation = Readonly<{
	configuration: BarHistoryStorageConfiguration;
	requestedThroughSession: string;
}>;

export function resolveCanaryInvocation(
	args: readonly string[],
	environment: Readonly<Record<string, string | undefined>>,
): CanaryInvocation {
	const { values } = parseArgs({
		args: [...args],
		options: { 'through-session': { type: 'string' } },
		strict: true,
	});
	const requestedThroughSession = values['through-session'];

	if (!requestedThroughSession || !checkIfIsoDateIsValid(requestedThroughSession)) {
		throw new Error('--through-session must be a real YYYY-MM-DD date.');
	}

	return {
		configuration: resolveStorageConfiguration(environment),
		requestedThroughSession,
	};
}

export function selectCanaryMode(
	history: BarHistory | null,
	requestedThroughSession: string,
): CanaryUpdateMode | 'verified' {
	if (!history) {
		return 'initial-backfill';
	}

	if (history.checkedThroughSession > requestedThroughSession) {
		throw new Error(
			`${history.tradingLineId} is already checked beyond ${requestedThroughSession}.`,
		);
	}

	if (history.checkedThroughSession < requestedThroughSession) {
		return 'refresh';
	}

	return 'verified';
}

async function startBarHistoryCanary(): Promise<void> {
	const invocation = resolveCanaryInvocation(Bun.argv.slice(2), Bun.env);
	const storage = createBarHistoryStorage(invocation.configuration);
	const s3Client = new Bun.S3Client(invocation.configuration);
	const updater = createBarHistoryUpdater(storage, createLogger({ name: 'BAR_HISTORY_CANARY' }), {
		fetchFromProvider: fetchOpenBymadataWithTimeout,
	});
	const reader = createBarHistoryReader(storage);
	const syntheticNoDataLine = createSyntheticNoDataLine();
	const invalidRowId = `${INVALID_ROW_ID_PREFIX}-${crypto.randomUUID()}`;
	const temporaryIds = [syntheticNoDataLine.tradingLineId, invalidRowId];
	let report: readonly CanaryLineSummary[] | null = null;
	let operationError: unknown = null;

	try {
		await deleteHistories(s3Client, temporaryIds);
		await verifyInvalidRowRejection(
			storage,
			s3Client,
			invalidRowId,
			invocation.requestedThroughSession,
		);
		report = await backfillAndVerify(
			storage,
			s3Client,
			updater,
			reader,
			syntheticNoDataLine,
			invocation.requestedThroughSession,
		);
	} catch (error) {
		operationError = error;
	}

	const cleanupError = await deleteHistoriesSafely(s3Client, temporaryIds);

	if (operationError && cleanupError) {
		throw new AggregateError(
			[operationError, cleanupError],
			'Canary failed and temporary-object cleanup also failed.',
		);
	}

	if (operationError || cleanupError) {
		throw operationError ?? cleanupError;
	}

	if (!report) {
		throw new Error('Canary finished without a verification report.');
	}

	printReport(invocation.requestedThroughSession, report);
}

async function backfillAndVerify(
	storage: BarHistoryStorage,
	s3Client: Bun.S3Client,
	updater: ReturnType<typeof createBarHistoryUpdater>,
	reader: ReturnType<typeof createBarHistoryReader>,
	syntheticNoDataLine: OpenBymadataTradingLineDescriptor,
	requestedThroughSession: string,
): Promise<readonly CanaryLineSummary[]> {
	const { updateLines, verifiedIds } = await buildUpdatePlan(storage, requestedThroughSession);
	const lines = [
		...updateLines,
		{ tradingLine: syntheticNoDataLine, mode: 'initial-backfill' as const },
	];
	const updateResult = await updater.update({ lines, requestedThroughSession });

	if (!updateResult.ok) {
		throw new Error('The Bar History update request was rejected.');
	}

	const failedLine = updateResult.results.find((result) => result.status === 'failed');

	if (failedLine?.status === 'failed') {
		throw new Error(`${failedLine.tradingLineId}: ${failedLine.message}`);
	}

	const statuses = new Map<string, CanaryLineStatus>(
		updateResult.results.flatMap((result) =>
			result.status === 'failed' ? [] : [[result.tradingLineId, result.status]],
		),
	);
	const allLines = [...CANARY_TRADING_LINES, syntheticNoDataLine];
	const histories = await readStoredHistories(storage, allLines, requestedThroughSession);

	await verifyCanonicalKeys(s3Client, allLines);
	await verifyAnalysisFacingRead(reader, histories);
	verifyRealHistoriesContainBars(histories);
	verifySyntheticNoDataHistory(histories, syntheticNoDataLine.tradingLineId);
	verifyLiquidControls(histories, requestedThroughSession);

	return CANARY_TRADING_LINES.map((line) => {
		const history = getRequiredMapValue(histories, line.tradingLineId);
		const status = verifiedIds.has(line.tradingLineId)
			? 'verified'
			: getRequiredMapValue(statuses, line.tradingLineId);

		return createLineSummary(history, status);
	});
}

async function buildUpdatePlan(
	storage: BarHistoryStorage,
	requestedThroughSession: string,
): Promise<
	Readonly<{ updateLines: readonly UpdateBarHistoryLine[]; verifiedIds: ReadonlySet<string> }>
> {
	const storedResults = await Promise.all(
		CANARY_TRADING_LINES.map((line) => storage.read(line.tradingLineId)),
	);
	const updateLines: UpdateBarHistoryLine[] = [];
	const verifiedIds = new Set<string>();

	for (const [index, tradingLine] of CANARY_TRADING_LINES.entries()) {
		const history = selectExistingHistory(storedResults[index]!, tradingLine.tradingLineId);
		const mode = selectCanaryMode(history, requestedThroughSession);

		if (mode === 'verified') {
			verifiedIds.add(tradingLine.tradingLineId);
			continue;
		}

		updateLines.push({ tradingLine, mode });
	}

	return { updateLines, verifiedIds };
}

function selectExistingHistory(
	result: BarHistoryStorageReadResult,
	tradingLineId: string,
): BarHistory | null {
	if (result.ok) {
		return result.history;
	}

	if (result.reason === 'not-found') {
		return null;
	}

	throw new Error(`${tradingLineId}: ${result.message}`);
}

async function readStoredHistories(
	storage: BarHistoryStorage,
	lines: readonly OpenBymadataTradingLineDescriptor[],
	requestedThroughSession: string,
): Promise<ReadonlyMap<string, BarHistory>> {
	const results = await Promise.all(lines.map((line) => storage.read(line.tradingLineId)));
	const histories = new Map<string, BarHistory>();

	for (const [index, line] of lines.entries()) {
		const result = results[index]!;

		if (!result.ok) {
			throw new Error(`${line.tradingLineId}: ${result.message}`);
		}

		verifyStoredHistory(result.history, line, requestedThroughSession);
		histories.set(line.tradingLineId, result.history);
	}

	return histories;
}

function verifyStoredHistory(
	history: BarHistory,
	line: OpenBymadataTradingLineDescriptor,
	requestedThroughSession: string,
): void {
	const expectedSourceSymbol = `${line.symbol} 24HS`;
	const hasExpectedSource =
		history.source.provider === 'open-bymadata' &&
		history.source.symbol === expectedSourceSymbol;

	if (!hasExpectedSource || history.schemaVersion !== 1 || history.priceAdjustment !== 'none') {
		throw new Error(`${line.tradingLineId} has unexpected stored source information.`);
	}

	if (history.checkedThroughSession !== requestedThroughSession) {
		throw new Error(
			`${line.tradingLineId} was checked through ${history.checkedThroughSession}, not ${requestedThroughSession}.`,
		);
	}
}

async function verifyCanonicalKeys(
	s3Client: Bun.S3Client,
	lines: readonly OpenBymadataTradingLineDescriptor[],
): Promise<void> {
	const keyChecks = await Promise.all(
		lines.map((line) => s3Client.file(buildBarHistoryStorageKey(line.tradingLineId)).exists()),
	);
	const missingLine = lines.find((_, index) => !keyChecks[index]);

	if (missingLine) {
		throw new Error(`${missingLine.tradingLineId} is missing its canonical storage key.`);
	}
}

async function verifyAnalysisFacingRead(
	reader: ReturnType<typeof createBarHistoryReader>,
	histories: ReadonlyMap<string, BarHistory>,
): Promise<void> {
	const result = await reader.read({ tradingLineIds: [...histories.keys()], range: null });

	if (!result.ok) {
		throw new Error('The analysis-facing read request was rejected.');
	}

	for (const line of result.results) {
		if (!line.ok) {
			throw new Error(`${line.tradingLineId}: ${line.message}`);
		}

		const history = getRequiredMapValue(histories, line.tradingLineId);

		if (!Bun.deepEquals(line.bars, history.bars, true)) {
			throw new Error(`${line.tradingLineId} read back different bars.`);
		}
	}
}

function verifyRealHistoriesContainBars(histories: ReadonlyMap<string, BarHistory>): void {
	const emptyLine = CANARY_TRADING_LINES.find(
		(line) => getRequiredMapValue(histories, line.tradingLineId).bars.length === 0,
	);

	if (emptyLine) {
		throw new Error(`${emptyLine.tradingLineId} did not return any real Daily Bars.`);
	}
}

function verifySyntheticNoDataHistory(
	histories: ReadonlyMap<string, BarHistory>,
	tradingLineId: string,
): void {
	const history = getRequiredMapValue(histories, tradingLineId);

	if (history.bars.length > 0) {
		throw new Error('The synthetic no-data Trading Line unexpectedly contained bars.');
	}
}

function createSyntheticNoDataLine(): OpenBymadataTradingLineDescriptor {
	return {
		tradingLineId: `${NO_DATA_ID_PREFIX}-${crypto.randomUUID()}`,
		symbol: 'INACTIVE',
	};
}

function verifyLiquidControls(
	histories: ReadonlyMap<string, BarHistory>,
	requestedThroughSession: string,
): void {
	for (const tradingLineId of LIQUID_CONTROL_IDS) {
		const history = getRequiredMapValue(histories, tradingLineId);
		const hasRequestedSession = history.bars.some(
			(bar) => bar.sessionDate === requestedThroughSession,
		);

		if (!hasRequestedSession) {
			throw new Error(
				`${tradingLineId} does not contain completed session ${requestedThroughSession}.`,
			);
		}
	}
}

async function verifyInvalidRowRejection(
	storage: BarHistoryStorage,
	s3Client: Bun.S3Client,
	tradingLineId: string,
	requestedThroughSession: string,
): Promise<void> {
	const invalidHistory: BarHistory = {
		schemaVersion: 1,
		tradingLineId,
		source: { provider: 'open-bymadata', symbol: 'INVALID 24HS' },
		priceAdjustment: 'none',
		backfilledAt: Temporal.Now.instant().toString(),
		lastReconciledAt: null,
		checkedThroughSession: requestedThroughSession,
		bars: [
			{
				sessionDate: requestedThroughSession,
				open: 0,
				high: 1,
				low: 0,
				close: 1,
				volume: 0,
			},
		],
	};
	const result = await storage.write(invalidHistory);

	if (result.ok || result.reason !== 'invalid-history') {
		throw new Error('Storage did not reject the deliberately invalid Daily Bar.');
	}

	const historyExists = await s3Client.file(buildBarHistoryStorageKey(tradingLineId)).exists();

	if (historyExists) {
		throw new Error('The deliberately invalid Daily Bar reached the bucket.');
	}
}

async function deleteHistoriesSafely(
	s3Client: Bun.S3Client,
	tradingLineIds: readonly string[],
): Promise<unknown> {
	try {
		await deleteHistories(s3Client, tradingLineIds);
		return null;
	} catch (error) {
		return error;
	}
}

async function deleteHistories(
	s3Client: Bun.S3Client,
	tradingLineIds: readonly string[],
): Promise<void> {
	await Promise.all(
		tradingLineIds.map((tradingLineId) =>
			s3Client.delete(buildBarHistoryStorageKey(tradingLineId)),
		),
	);
	const remainingObjects = await Promise.all(
		tradingLineIds.map((tradingLineId) =>
			s3Client.file(buildBarHistoryStorageKey(tradingLineId)).exists(),
		),
	);

	if (remainingObjects.some(Boolean)) {
		throw new Error('A temporary canary object could not be removed from the bucket.');
	}
}

function resolveStorageConfiguration(
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

async function fetchOpenBymadataWithTimeout(
	input: string | URL | Request,
	init?: RequestInit,
): Promise<Response> {
	return fetch(input, {
		...init,
		signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
	});
}

function createLineSummary(history: BarHistory, status: CanaryLineStatus): CanaryLineSummary {
	return {
		tradingLineId: history.tradingLineId,
		status,
		barCount: history.bars.length,
		oldestSessionDate: history.bars[0]?.sessionDate ?? null,
		newestSessionDate: history.bars.at(-1)?.sessionDate ?? null,
	};
}

function getRequiredMapValue<Key, Value>(map: ReadonlyMap<Key, Value>, key: Key): Value {
	const value = map.get(key);

	if (value === undefined) {
		throw new Error(`Missing expected canary result for ${String(key)}.`);
	}

	return value;
}

function printReport(requestedThroughSession: string, lines: readonly CanaryLineSummary[]): void {
	console.log(`Bar History canary passed through ${requestedThroughSession}.`);

	for (const line of lines) {
		const range = `${line.oldestSessionDate ?? 'none'} to ${line.newestSessionDate ?? 'none'}`;
		console.log(`${line.tradingLineId}: ${line.status}, ${line.barCount} bars, ${range}.`);
	}

	console.log('Invalid rows were rejected and temporary objects were removed.');
}

if (import.meta.main) {
	try {
		await startBarHistoryCanary();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Bar History canary failed: ${message}`);
		process.exitCode = 1;
	}
}
