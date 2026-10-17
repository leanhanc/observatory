import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readRenderableSnapshot } from './latest-analysis-snapshot.ts';

let directory: string;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'snapshot-file-'));
});

afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

// A local build reads a dry run's file with the bucket read's validation, and needs no storage
// configuration at all.
describe('readRenderableSnapshot from OBSERVATORY_SNAPSHOT_FILE', () => {
	test('rejects a file that fails the snapshot read’s validation', async () => {
		const path = join(directory, 'snapshot.json');
		await writeFile(path, JSON.stringify({ schemaVersion: 12, analyzedLines: [] }));

		const error = await readRenderableSnapshot({ OBSERVATORY_SNAPSHOT_FILE: path }).catch(
			(reason: unknown) => reason,
		);

		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toContain('Schema version must be 13.');
	});

	test('fails when the file does not exist, without asking for storage variables', async () => {
		const path = join(directory, 'missing.json');

		const error = await readRenderableSnapshot({ OBSERVATORY_SNAPSHOT_FILE: path }).catch(
			(reason: unknown) => reason,
		);

		expect((error as Error).message).toBe(
			`No Analysis Snapshot to render: ${path} does not exist.`,
		);
	});
});
