/* oxlint-disable no-await-in-loop, no-console -- Sequential requests limit provider traffic; this CLI reports each comparison. */
import { mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { createOpenBymadataAdapter } from '#modules/bar-history/adapters/index.ts';
import { detectAdjustmentOrCorrection } from '#modules/bar-history/utils/index.ts';

import type { DailyBar } from '#modules/bar-history/index.ts';
import type { PriceRevision } from '#modules/bar-history/utils/index.ts';

// Quarterly dividend payers make a provider adjustment likely within weeks; AL30 and AL30D are the
// MEP legs; GGAL and GGALD show whether peso and dollar lines are adjusted together.
const SYMBOLS = ['AAPL', 'AAPLD', 'KO', 'JPM', 'MSFT', 'GGAL', 'GGALD', 'YPFD', 'AL30', 'AL30D'];
const REQUEST_PAUSE_MS = 2_000;
const TIMEZONE = 'America/Argentina/Buenos_Aires';
const HISTORY_START_EPOCH_SECONDS = 946_684_800;

type SymbolSnapshot =
	| Readonly<{ ok: true; bars: readonly DailyBar[]; repairedSessionDates: readonly string[] }>
	| Readonly<{ ok: false; message: string }>;

type HistorySnapshot = Readonly<{
	capturedAt: string;
	requestedThroughSession: string;
	symbols: Readonly<Record<string, SymbolSnapshot>>;
}>;

async function captureSnapshot() {
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			output: { type: 'string', default: '.snapshots/bymadata-history' },
			help: { type: 'boolean' },
		},
	});

	if (values.help) {
		console.log('bun scripts/bymadata-history-snapshot.ts [--output /path]');
		return;
	}

	const outputDirectory = resolve(values.output);
	await mkdir(outputDirectory, { recursive: true });

	const previousSnapshot = await readLatestSnapshot(outputDirectory);
	const snapshot = await fetchSnapshot();
	const path = join(outputDirectory, `${snapshot.capturedAt.replaceAll(':', '-')}.json`);
	await Bun.write(path, JSON.stringify(snapshot));
	console.log(`Saved ${path}`);

	if (!previousSnapshot) {
		console.log('No previous snapshot to compare with.');
		return;
	}

	console.log(`Compared with the snapshot captured at ${previousSnapshot.capturedAt}:`);
	reportRevisions(previousSnapshot, snapshot);
}

async function fetchSnapshot(): Promise<HistorySnapshot> {
	const adapter = createOpenBymadataAdapter();
	const capturedAt = Temporal.Now.instant();
	// The current session may still be trading, so only completed sessions are kept.
	const requestedThroughSession = capturedAt
		.toZonedDateTimeISO(TIMEZONE)
		.toPlainDate()
		.subtract({ days: 1 })
		.toString();
	const symbols: Record<string, SymbolSnapshot> = {};

	for (const [index, symbol] of SYMBOLS.entries()) {
		if (index > 0) {
			await Bun.sleep(REQUEST_PAUSE_MS);
		}

		const result = await adapter.fetchHistory({
			tradingLine: { tradingLineId: symbol, symbol },
			fromEpochSeconds: HISTORY_START_EPOCH_SECONDS,
			toEpochSeconds: Math.floor(capturedAt.epochMilliseconds / 1_000),
			requestedThroughSession,
		});

		symbols[symbol] = result.ok
			? {
					ok: true,
					bars: result.bars,
					repairedSessionDates: result.repairs.map((repair) => repair.sessionDate),
				}
			: { ok: false, message: result.message };
	}

	return { capturedAt: capturedAt.toString(), requestedThroughSession, symbols };
}

async function readLatestSnapshot(outputDirectory: string): Promise<HistorySnapshot | null> {
	const fileNames = await readdir(outputDirectory);
	const latestFileName = fileNames
		.filter((fileName) => fileName.endsWith('.json'))
		.toSorted()
		.at(-1);

	if (!latestFileName) {
		return null;
	}

	return Bun.file(join(outputDirectory, latestFileName)).json();
}

function reportRevisions(previousSnapshot: HistorySnapshot, snapshot: HistorySnapshot): void {
	for (const symbol of SYMBOLS) {
		const previous = previousSnapshot.symbols[symbol];
		const current = snapshot.symbols[symbol];

		if (!previous?.ok || !current?.ok) {
			console.log(`  ${symbol}: not compared, a snapshot is missing or failed`);
			continue;
		}

		const revision = detectAdjustmentOrCorrection(previous.bars, current.bars);
		console.log(`  ${symbol}: ${describeRevision(revision)}`);
	}
}

function describeRevision(revision: PriceRevision): string {
	if (revision.kind === 'unchanged') {
		return 'unchanged';
	}

	if (revision.kind === 'corrections') {
		const listedSessionDates = revision.sessionDates.slice(0, 5).join(', ');
		return `${revision.sessionDates.length} corrected sessions (${listedSessionDates})`;
	}

	const adjustments = revision.adjustments.map(
		(adjustment) =>
			`×${adjustment.ratio.toFixed(6)} through ${adjustment.adjustedThroughSession}`,
	);
	return `adjustments ${adjustments.join('; ')}`;
}

await captureSnapshot();
