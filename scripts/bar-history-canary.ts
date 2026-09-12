/* oxlint-disable no-console -- This operational command reports a concise pilot summary. */
import { parseArgs } from 'node:util';

import { checkIfIsoDateIsValid } from '#lib/utils/validation.ts';
import {
	createBarHistoryReader,
	createBarHistoryStorage,
	createBarHistoryUpdater,
} from '#modules/bar-history/index.ts';
import { buildBarHistoryStorageKey } from '#modules/bar-history/storage/index.ts';
import { instrumentCatalog } from '#modules/instrument-catalog/index.ts';
import { createLogger } from '#modules/logger/index.ts';

import { resolveBarHistoryStorageConfiguration } from './bar-history-storage-configuration.ts';

import type { OpenBymadataTradingLineDescriptor } from '#modules/bar-history/adapters/index.ts';
import type {
	BarHistory,
	BarHistoryStorage,
	BarHistoryStorageConfiguration,
	BarHistoryStorageReadResult,
	BarHistoryUpdate,
	BarHistoryUpdateMode,
	UpdateBarHistoryLine,
} from '#modules/bar-history/index.ts';
import type { InstrumentCatalog } from '#modules/instrument-catalog/index.ts';

const V1_BYMA_TRADING_LINE_IDS = ['ypf-stock-byma-ars', 'apple-cedear-byma-ars'] as const;
const DIAGNOSTIC_TRADING_LINES = [
	{ tradingLineId: 'cedear-aapl-mep', symbol: 'AAPLD' },
	{ tradingLineId: 'cedear-aapl-ccl', symbol: 'AAPLC' },
	{ tradingLineId: 'equity-ypfd-ars', symbol: 'YPFD' },
] as const satisfies readonly OpenBymadataTradingLineDescriptor[];
const V1_BYMA_TRADING_LINES = resolveV1BymaTradingLines();
const CANARY_TRADING_LINES = [...V1_BYMA_TRADING_LINES, ...DIAGNOSTIC_TRADING_LINES];
const LIQUID_CONTROL_IDS = new Set(['ypf-stock-byma-ars', 'apple-cedear-byma-ars']);
const RETAINED_SENTINEL_SESSION = '1999-12-31';
const CORRECTION_ID_PREFIX = '__canary-correction__';
const INVALID_ROW_ID_PREFIX = '__canary-invalid-row__';
const NO_DATA_ID_PREFIX = '__canary-no-data__';
const PROVIDER_REQUEST_TIMEOUT_MS = 20_000;

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
		configuration: resolveBarHistoryStorageConfiguration(environment),
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

export function resolveV1BymaTradingLines(
	catalog: InstrumentCatalog = instrumentCatalog,
): readonly OpenBymadataTradingLineDescriptor[] {
	const result = catalog.getTradingLinesByIds(V1_BYMA_TRADING_LINE_IDS);

	if (!result.ok) {
		throw new Error('The Instrument Catalog cannot resolve the v1 BYMA Trading Lines.');
	}

	return result.tradingLines.map((tradingLine) => ({
		tradingLineId: tradingLine.id,
		symbol: tradingLine.symbol,
	}));
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
	const correctionLine = createCorrectionLine();
	const invalidRowId = `${INVALID_ROW_ID_PREFIX}-${crypto.randomUUID()}`;
	const temporaryIds = [
		syntheticNoDataLine.tradingLineId,
		correctionLine.tradingLineId,
		invalidRowId,
	];
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
		await verifyKnownProviderCorrection(
			storage,
			updater,
			correctionLine,
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
	await reconcileV1BymaTradingLines(updater, requestedThroughSession);
	const allLines = [...CANARY_TRADING_LINES, syntheticNoDataLine];
	const histories = await readStoredHistories(storage, allLines, requestedThroughSession);

	await verifyCanonicalKeys(s3Client, allLines);
	await verifyAnalysisFacingRead(reader, histories);
	verifyV1ReconciliationMetadata(histories);
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

function verifyV1ReconciliationMetadata(histories: ReadonlyMap<string, BarHistory>): void {
	for (const tradingLine of V1_BYMA_TRADING_LINES) {
		const history = getRequiredMapValue(histories, tradingLine.tradingLineId);

		if (!history.lastReconciledAt) {
			throw new Error(`${tradingLine.tradingLineId} has no reconciliation timestamp.`);
		}
	}
}

async function reconcileV1BymaTradingLines(
	updater: ReturnType<typeof createBarHistoryUpdater>,
	requestedThroughSession: string,
): Promise<void> {
	const lines = V1_BYMA_TRADING_LINES.map((tradingLine) => ({
		tradingLine,
		mode: 'reconciliation' as const,
	}));
	const result = await updater.update({ lines, requestedThroughSession });

	if (!result.ok) {
		throw new Error('The v1 BYMA reconciliation request was rejected.');
	}

	const failedLine = result.results.find((line) => line.status === 'failed');

	if (failedLine?.status === 'failed') {
		throw new Error(`${failedLine.tradingLineId}: ${failedLine.message}`);
	}
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

function createCorrectionLine(): OpenBymadataTradingLineDescriptor {
	return {
		tradingLineId: `${CORRECTION_ID_PREFIX}-${crypto.randomUUID()}`,
		symbol: 'YPFD',
	};
}

async function verifyKnownProviderCorrection(
	storage: BarHistoryStorage,
	updater: ReturnType<typeof createBarHistoryUpdater>,
	tradingLine: OpenBymadataTradingLineDescriptor,
	requestedThroughSession: string,
): Promise<void> {
	await updateRequiredLine(updater, tradingLine, 'initial-backfill', requestedThroughSession);
	const storedResult = await storage.read(tradingLine.tradingLineId);

	if (!storedResult.ok) {
		throw new Error(`${tradingLine.tradingLineId}: ${storedResult.message}`);
	}

	const providerBar = storedResult.history.bars.at(-1);

	if (!providerBar) {
		throw new Error('The correction canary requires at least one real provider bar.');
	}

	const alteredBar = { ...providerBar, volume: providerBar.volume + 1 };
	const retainedSentinelBar = {
		sessionDate: RETAINED_SENTINEL_SESSION,
		open: 1,
		high: 1,
		low: 1,
		close: 1,
		volume: 1,
	};
	const alteredHistory = {
		...storedResult.history,
		bars: [
			retainedSentinelBar,
			...storedResult.history.bars.map((bar) =>
				bar.sessionDate === alteredBar.sessionDate ? alteredBar : bar,
			),
		],
	};
	const alteredWrite = await storage.write(alteredHistory);

	if (!alteredWrite.ok) {
		throw new Error(`Could not prepare the correction canary: ${alteredWrite.message}`);
	}

	const reconciliation = await updateRequiredLine(
		updater,
		tradingLine,
		'reconciliation',
		requestedThroughSession,
	);
	const correction = reconciliation.corrections.find(
		(candidate) => candidate.sessionDate === providerBar.sessionDate,
	);

	if (
		!correction ||
		correction.previousBar.volume !== alteredBar.volume ||
		correction.correctedBar.volume !== providerBar.volume
	) {
		throw new Error('Reconciliation did not report the prepared provider correction.');
	}

	const reconciledResult = await storage.read(tradingLine.tradingLineId);

	if (!reconciledResult.ok) {
		throw new Error(`${tradingLine.tradingLineId}: ${reconciledResult.message}`);
	}

	const retainedSentinel = reconciledResult.history.bars.find(
		(bar) => bar.sessionDate === RETAINED_SENTINEL_SESSION,
	);
	const correctedBar = reconciledResult.history.bars.find(
		(bar) => bar.sessionDate === providerBar.sessionDate,
	);

	if (!retainedSentinel || !correctedBar || correctedBar.volume !== providerBar.volume) {
		throw new Error('Reconciliation did not preserve old history and restore provider facts.');
	}
}

async function updateRequiredLine(
	updater: ReturnType<typeof createBarHistoryUpdater>,
	tradingLine: OpenBymadataTradingLineDescriptor,
	mode: BarHistoryUpdateMode,
	requestedThroughSession: string,
): Promise<Exclude<BarHistoryUpdate, { status: 'failed' }>> {
	const result = await updater.update({
		lines: [{ tradingLine, mode }],
		requestedThroughSession,
	});

	if (!result.ok) {
		throw new Error('The correction canary update request was rejected.');
	}

	const lineResult = result.results[0];

	if (!lineResult || lineResult.status === 'failed') {
		const message = lineResult?.message ?? 'The correction canary returned no result.';
		throw new Error(`${tradingLine.tradingLineId}: ${message}`);
	}

	return lineResult;
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
		console.error(`Bar History canary failed: ${formatCanaryError(error)}`);
		process.exitCode = 1;
	}
}

function formatCanaryError(error: unknown): string {
	if (error instanceof AggregateError) {
		const causes = [...error.errors].map(formatCanaryError).join(' | ');
		return `${error.message} (${causes})`;
	}

	return error instanceof Error ? error.message : String(error);
}
