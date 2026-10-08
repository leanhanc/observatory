import { afterAll, describe, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ANALYSIS_CONFIGURATION } from '#lib/config.ts';
import { createInstrumentCatalog } from '#modules/instrument-catalog/instrument-catalog.ts';
import { loadGgalFixture } from '#modules/technical-analysis/tests/support/index.ts';

import { resolveAnalysisRunInvocation, runAnalysisCommand } from './analysis-run.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { CorporateAction } from '#modules/corporate-actions/index.ts';
import type { AnalysisRunCommandOutcome, AnalysisRunLog } from './analysis-run.ts';

const DRY_RUN_ARGS = ['--output', 'snapshot.json'];
const WEDNESDAY_MORNING = '2026-10-07T09:00:00Z';

describe('Analysis Run command', () => {
	describe('default Requested-Through Session', () => {
		test('is the previous date on a weekday morning', () => {
			const invocation = resolveAnalysisRunInvocation(DRY_RUN_ARGS, {}, WEDNESDAY_MORNING);

			expect(invocation.requestedThroughSession).toBe('2026-10-06');
		});

		test('is Friday on a Saturday morning', () => {
			const invocation = resolveAnalysisRunInvocation(
				DRY_RUN_ARGS,
				{},
				'2026-10-10T09:00:00Z',
			);

			expect(invocation.requestedThroughSession).toBe('2026-10-09');
		});

		test('follows the Buenos Aires date, not the UTC date, around midnight', () => {
			// 02:00 UTC on Oct 8 is still 23:00 on Oct 7 in Buenos Aires (UTC-3).
			const beforeBuenosAiresMidnight = resolveAnalysisRunInvocation(
				DRY_RUN_ARGS,
				{},
				'2026-10-08T02:00:00Z',
			);
			const afterBuenosAiresMidnight = resolveAnalysisRunInvocation(
				DRY_RUN_ARGS,
				{},
				'2026-10-08T03:00:00Z',
			);

			expect(beforeBuenosAiresMidnight.requestedThroughSession).toBe('2026-10-06');
			expect(afterBuenosAiresMidnight.requestedThroughSession).toBe('2026-10-07');
		});

		test('crosses month and year boundaries', () => {
			const invocation = resolveAnalysisRunInvocation(
				DRY_RUN_ARGS,
				{},
				'2027-01-01T09:00:00Z',
			);

			expect(invocation.requestedThroughSession).toBe('2026-12-31');
		});
	});

	test('an explicit Requested-Through Session wins over the default', () => {
		const invocation = resolveAnalysisRunInvocation(
			['--through-session', '2026-10-01', ...DRY_RUN_ARGS],
			{},
			WEDNESDAY_MORNING,
		);

		expect(invocation.requestedThroughSession).toBe('2026-10-01');
	});

	test('rejects an explicit Requested-Through Session that is not a real date', () => {
		expect(() =>
			resolveAnalysisRunInvocation(
				['--through-session', '2026-02-30', ...DRY_RUN_ARGS],
				{},
				WEDNESDAY_MORNING,
			),
		).toThrow('--through-session must be a real YYYY-MM-DD date.');
		expect(() =>
			resolveAnalysisRunInvocation(
				['--through-session=', ...DRY_RUN_ARGS],
				{},
				WEDNESDAY_MORNING,
			),
		).toThrow('--through-session must be a real YYYY-MM-DD date.');
	});

	test('rejects an empty output path instead of writing to the bucket', () => {
		expect(() =>
			resolveAnalysisRunInvocation(
				['--through-session', '2026-10-02', '--output='],
				{},
				WEDNESDAY_MORNING,
			),
		).toThrow('--output must be a file path.');
	});

	test('requires storage configuration unless writing to a local file', () => {
		expect(() => resolveAnalysisRunInvocation([], {}, WEDNESDAY_MORNING)).toThrow(
			'Missing storage configuration',
		);
		expect(
			resolveAnalysisRunInvocation(DRY_RUN_ARGS, {}, WEDNESDAY_MORNING)
				.requestedThroughSession,
		).toBe('2026-10-06');
	});
});

// Noon in Buenos Aires on 2026-10-01: the fixture's last session, 2026-09-30, has closed.
const RAN_AT = '2026-10-01T15:00:00Z';
const MEP_RATE = 1_000;
const SNAPSHOT_PATH = join(tmpdir(), `analysis-run-command-test-${process.pid}.json`);
const SECRET_SENTINEL = 'sentinel-secret-7f3a9c';
const ACCESS_KEY_SENTINEL = 'sentinel-access-key-2b8e';
// Nothing listens on the discard port, so the real S3 client fails its write without leaving the
// machine.
const UNREACHABLE_STORAGE_ENVIRONMENT = {
	OBSERVATORY_STORAGE_ACCESS_KEY_ID: ACCESS_KEY_SENTINEL,
	OBSERVATORY_STORAGE_SECRET_ACCESS_KEY: SECRET_SENTINEL,
	OBSERVATORY_STORAGE_BUCKET: 'observatory-test',
	OBSERVATORY_STORAGE_ENDPOINT: 'http://127.0.0.1:9',
	OBSERVATORY_STORAGE_REGION: 'auto',
	OBSERVATORY_STORAGE_VIRTUAL_HOSTED_STYLE: 'false',
};

// The fixture is read as dollar prices; at a constant MEP Rate the peso line is liquid.
const ggalDollarBars = await loadGgalFixture();
const ggalPesoBars = ggalDollarBars.map((bar) => scaleBarPrices(bar, MEP_RATE));
const thinlyTradedPesoBars = ggalPesoBars.map((bar) => ({ ...bar, volume: 1 }));
const al30Bars = ggalDollarBars.map((bar) => createFlatBar(bar.sessionDate, MEP_RATE));
const al30dBars = ggalDollarBars.map((bar) => createFlatBar(bar.sessionDate, 1));
const GGAL_SHARE_DISTRIBUTION: CorporateAction = {
	tradingLineId: 'galicia-stock-byma-ars',
	exDate: '2025-06-02',
	priceFactor: 0.5,
	kind: 'share-distribution',
	sourceUrl: 'https://example.com/notice',
};
// Galicia as a provider that did not adjust a 1:1 share distribution: earlier prices are twice the
// later scale.
const unadjustedGgalPesoBars = ggalPesoBars.map((bar) =>
	bar.sessionDate < GGAL_SHARE_DISTRIBUTION.exDate ? scaleBarPrices(bar, 2) : bar,
);

describe('Analysis Run command logging', () => {
	afterAll(() => rm(SNAPSHOT_PATH, { force: true }));

	test('logs the start, the MEP rate source, each line in order and the outcome', async () => {
		// Galicia's last bar is missing, so it ends one session before the MEP rate source.
		const { entries, outcome } = await runCommandWithProvider({
			GGAL: ggalPesoBars.slice(0, -1),
			THIN: thinlyTradedPesoBars,
		});

		expect(outcome).toBe('snapshot-written');
		expect(entries.map(({ level, message }) => `${level} ${message}`)).toEqual([
			`info Analysis Run through 2026-09-30: 3 lines, configuration v${ANALYSIS_CONFIGURATION.version}.`,
			'info MEP rate source fetched; latest rate session 2026-09-30.',
			expect.stringMatching(
				/^info \[1\/3\] galicia-stock-byma-ars: available \(last session 2026-09-29, \d+ events, \d+ large moves\)$/,
			),
			expect.stringMatching(
				/^info \[2\/3\] thin-stock-byma-ars: unavailable: insufficient-liquidity \(participation 1\.00, median USD \d+k\)$/,
			),
			expect.stringMatching(
				/^warn \[3\/3\] missing-stock-byma-ars: unavailable: fetch-failed \(.+\)$/,
			),
			expect.stringMatching(
				/^info Analysis Run through 2026-09-30 completed in \d+ s: 1 available \(1 ending before 2026-09-30\), 2 unavailable; written to .+\.json\.$/,
			),
		]);
		expect(entries[2]!.fields).toMatchObject({
			event: 'line-analyzed',
			position: 1,
			analyzedLineCount: 3,
			tradingLineId: 'galicia-stock-byma-ars',
			status: 'available',
			lastSessionDate: '2026-09-29',
		});
		expect(entries.at(-1)!.fields).toMatchObject({ lateLineCount: 1 });
	});

	test('warns when the requested session has no MEP Rate, as on a holiday', async () => {
		const { entries, outcome } = await runCommandWithProvider(
			{ GGAL: ggalPesoBars, THIN: thinlyTradedPesoBars },
			{
				args: ['--through-session', '2026-10-01', '--output', SNAPSHOT_PATH],
				currentInstant: '2026-10-02T15:00:00Z',
			},
		);

		expect(outcome).toBe('snapshot-written');
		expect(entries[1]).toMatchObject({
			level: 'warn',
			message: 'No MEP Rate session on 2026-10-01; analyzing through 2026-09-30.',
		});
	});

	test('warns about a listed Corporate Action whose step is not observed, with its ratio', async () => {
		const { entries } = await runCommandWithProvider(
			{ GGAL: ggalPesoBars, THIN: thinlyTradedPesoBars },
			{ corporateActions: [GGAL_SHARE_DISTRIBUTION] },
		);

		expect(entries[2]).toMatchObject({
			level: 'warn',
			message: expect.stringMatching(
				/^\[1\/3\] galicia-stock-byma-ars: available \(.+; corporate action 2025-06-02: step-not-observed \(observed ×\d\.\d{3}; check the history before removing the entry\)\)$/,
			),
			fields: {
				corporateActions: [
					{
						exDate: '2025-06-02',
						status: 'step-not-observed',
						observedCloseRatio: expect.any(Number),
					},
				],
			},
		});
	});

	test('logs a line whose listed Corporate Action was applied at info', async () => {
		const { entries } = await runCommandWithProvider(
			{ GGAL: unadjustedGgalPesoBars, THIN: thinlyTradedPesoBars },
			{ corporateActions: [GGAL_SHARE_DISTRIBUTION] },
		);

		expect(entries[2]).toMatchObject({
			level: 'info',
			message: expect.stringMatching(
				/^\[1\/3\] galicia-stock-byma-ars: available \(.+, 0 large moves; corporate action 2025-06-02: applied\)$/,
			),
		});
	});

	test('warns about each Large One-Session Move with its session and ratio', async () => {
		const { entries } = await runCommandWithProvider({
			GGAL: unadjustedGgalPesoBars,
			THIN: thinlyTradedPesoBars,
		});

		expect(entries[2]).toMatchObject({
			level: 'warn',
			message: expect.stringMatching(
				/^\[1\/3\] galicia-stock-byma-ars: available \(.+, 1 large moves; large move 2025-06-02 ×0\.\d{3}\)$/,
			),
			fields: {
				largeMoves: [{ sessionDate: '2025-06-02', closeRatio: expect.any(Number) }],
			},
		});
	});

	test('warns about an available line with a dropped bar', async () => {
		const droppedSession = ggalPesoBars.at(-5)!.sessionDate;
		const ggalWithInvalidBar = ggalPesoBars.map((bar) =>
			bar.sessionDate === droppedSession ? { ...bar, close: 0 } : bar,
		);
		const { entries } = await runCommandWithProvider({
			GGAL: ggalWithInvalidBar,
			THIN: thinlyTradedPesoBars,
		});

		expect(entries[2]).toMatchObject({
			level: 'warn',
			message: expect.stringMatching(
				/^\[1\/3\] galicia-stock-byma-ars: available \(.+; 1 dropped bar\)$/,
			),
			fields: { droppedBarSessions: [droppedSession] },
		});
	});

	test('warns about an illiquid line with dropped bars, which lower its participation', async () => {
		const droppedSession = ggalPesoBars.at(-5)!.sessionDate;
		const thinWithInvalidBar = thinlyTradedPesoBars.map((bar) =>
			bar.sessionDate === droppedSession ? { ...bar, close: 0 } : bar,
		);
		const { entries } = await runCommandWithProvider({
			GGAL: ggalPesoBars,
			THIN: thinWithInvalidBar,
		});

		expect(entries[3]).toMatchObject({
			level: 'warn',
			message: expect.stringMatching(
				/^\[2\/3\] thin-stock-byma-ars: unavailable: insufficient-liquidity \(participation 0\.99, median USD \d+k; 1 dropped bar\)$/,
			),
			fields: { droppedBarSessions: [droppedSession] },
		});
	});

	test('logs a failed MEP rate source as one error and reports failure', async () => {
		const { entries, outcome } = await runCommandWithProvider({
			GGAL: ggalPesoBars,
			AL30D: null,
		});

		expect(outcome).toBe('failed');
		expect(entries.map(({ level }) => level)).toEqual(['info', 'error']);
		expect(entries[1]!.message).toStartWith(
			'Analysis Run failed: mep-rate-source-unavailable: ',
		);
		expect(entries[1]!.fields).toMatchObject({ reason: 'mep-rate-source-unavailable' });
	});

	test('logs an invalid invocation as one error', async () => {
		const { entries, outcome } = await runCommandWithProvider(
			{},
			{ args: ['--through-session', '2026-02-30', '--output', SNAPSHOT_PATH] },
		);

		expect(outcome).toBe('failed');
		expect(entries).toEqual([
			{
				level: 'error',
				message: 'Analysis Run failed: --through-session must be a real YYYY-MM-DD date.',
				fields: expect.any(Object),
			},
		]);
	});

	test('fails a run that does not finish before its deadline', async () => {
		const { entries, outcome } = await runCommandWithProvider(
			{},
			{ deadlineMs: 20, fetchFromProvider: () => new Promise<Response>(() => {}) },
		);

		expect(outcome).toBe('deadline-exceeded');
		expect(entries.at(-1)).toMatchObject({
			level: 'error',
			message: 'Analysis Run failed: deadline-exceeded: the run did not finish within 20 ms.',
		});
	});

	test('never logs storage credentials, even when the bucket write fails', async () => {
		const { entries, outcome } = await runCommandWithProvider(
			{ GGAL: ggalPesoBars, THIN: thinlyTradedPesoBars },
			{
				args: ['--through-session', '2026-09-30'],
				environment: UNREACHABLE_STORAGE_ENVIRONMENT,
			},
		);
		const serializedLog = JSON.stringify(entries);

		expect(outcome).toBe('failed');
		expect(entries.at(-1)!.message).toStartWith('Analysis Run failed: snapshot-write-failed: ');
		expect(serializedLog).not.toContain(SECRET_SENTINEL);
		expect(serializedLog).not.toContain(ACCESS_KEY_SENTINEL);
	});
});

type LogEntry = Readonly<{ level: 'info' | 'warn' | 'error'; message: string; fields: object }>;

type CommandOverrides = Readonly<{
	args?: readonly string[];
	environment?: Readonly<Record<string, string>>;
	currentInstant?: string;
	deadlineMs?: number;
	fetchFromProvider?: (input: string | URL | Request) => Promise<Response>;
	corporateActions?: readonly CorporateAction[];
}>;

/** Symbols missing from the provider answer with an HTTP error; `null` forces one. */
async function runCommandWithProvider(
	provider: Readonly<Record<string, readonly DailyBar[] | null>>,
	overrides: CommandOverrides = {},
): Promise<Readonly<{ entries: readonly LogEntry[]; outcome: AnalysisRunCommandOutcome }>> {
	const {
		args = ['--through-session', '2026-09-30', '--output', SNAPSHOT_PATH],
		environment = {},
		currentInstant = RAN_AT,
		deadlineMs = 60_000,
		fetchFromProvider = createFakeProvider(provider),
		corporateActions = [],
	} = overrides;
	const entries: LogEntry[] = [];
	const recordAt =
		(level: LogEntry['level']) =>
		(fields: object, message: string): void => {
			entries.push({ level, message, fields });
		};
	const log: AnalysisRunLog = {
		info: recordAt('info'),
		warn: recordAt('warn'),
		error: recordAt('error'),
	};
	const outcome = await runAnalysisCommand({
		args,
		environment,
		log,
		getCurrentInstant: () => currentInstant,
		deadlineMs,
		runnerOptions: {
			fetchFromProvider,
			pause: () => Promise.resolve(),
			catalog: createTestCatalog(),
			corporateActions,
		},
	});

	return { entries, outcome };
}

function createFakeProvider(
	provider: Readonly<Record<string, readonly DailyBar[] | null>>,
): (input: string | URL | Request) => Promise<Response> {
	const bars: Readonly<Record<string, readonly DailyBar[] | null>> = {
		AL30: al30Bars,
		AL30D: al30dBars,
		...provider,
	};

	return (input) => {
		const url = new URL(input instanceof Request ? input.url : input);
		const symbol = url.searchParams.get('symbol')!.replace(' 24HS', '');
		return Promise.resolve(createProviderResponse(bars[symbol] ?? null));
	};
}

function createProviderResponse(bars: readonly DailyBar[] | null): Response {
	if (!bars) {
		return new Response(null, { status: 500 });
	}

	return Response.json({
		s: 'ok',
		t: bars.map((bar) => convertSessionDateToEpochSeconds(bar.sessionDate)),
		o: bars.map((bar) => bar.open),
		h: bars.map((bar) => bar.high),
		l: bars.map((bar) => bar.low),
		c: bars.map((bar) => bar.close),
		v: bars.map((bar) => bar.volume),
	});
}

function convertSessionDateToEpochSeconds(sessionDate: string): number {
	const zonedMidnight = Temporal.PlainDate.from(sessionDate).toZonedDateTime(
		'America/Argentina/Buenos_Aires',
	);
	return zonedMidnight.epochMilliseconds / 1_000;
}

function createTestCatalog() {
	const creation = createInstrumentCatalog({
		schemaVersion: 1,
		instruments: [
			createStock('galicia-stock', 'GGAL'),
			createStock('thin-stock', 'THIN'),
			createStock('missing-stock', 'MISSING'),
			{
				id: 'al30-bond',
				type: 'bond',
				tradingLines: [
					{ id: 'al30-bond-byma-ars', symbol: 'AL30', exchange: 'BYMA', currency: 'ARS' },
					{
						id: 'al30-bond-byma-usd-mep',
						symbol: 'AL30D',
						exchange: 'BYMA',
						currency: 'USD',
					},
				],
			},
		],
	});

	if (!creation.ok) {
		throw new Error('The test Instrument Catalog is invalid.');
	}

	return creation.catalog;
}

function createStock(id: string, symbol: string) {
	return {
		id,
		type: 'stock' as const,
		tradingLines: [{ id: `${id}-byma-ars`, symbol, exchange: 'BYMA', currency: 'ARS' }],
	};
}

function createFlatBar(sessionDate: string, price: number): DailyBar {
	return { sessionDate, open: price, high: price, low: price, close: price, volume: 1_000_000 };
}

function scaleBarPrices(bar: DailyBar, factor: number): DailyBar {
	return {
		...bar,
		open: bar.open * factor,
		high: bar.high * factor,
		low: bar.low * factor,
		close: bar.close * factor,
	};
}
