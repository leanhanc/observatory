import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findPublishedOutputViolations } from './published-output-guard.ts';

let outputDirectory: string;

beforeEach(async () => {
	outputDirectory = await mkdtemp(join(tmpdir(), 'published-output-'));
	await mkdir(join(outputDirectory, 'lines', 'ggal-stock-byma-ars'), { recursive: true });
});

afterEach(async () => {
	await rm(outputDirectory, { recursive: true, force: true });
});

async function publish(relativePath: string, content: string): Promise<void> {
	await writeFile(join(outputDirectory, relativePath), content);
}

describe('findPublishedOutputViolations', () => {
	test('accepts pages that are plain HTML', async () => {
		await publish(
			'index.html',
			'<html><body><a href="/lines/ggal-stock-byma-ars">GGAL</a></body></html>',
		);
		await publish(
			'lines/ggal-stock-byma-ars/index.html',
			'<html><body><h1>GGAL</h1></body></html>',
		);

		expect(await findPublishedOutputViolations(outputDirectory)).toEqual([]);
	});

	test('names a nested page that has a script tag, in any case', async () => {
		await publish('index.html', '<html><body></body></html>');
		await publish(
			'lines/ggal-stock-byma-ars/index.html',
			'<html><body><SCRIPT type="module">hydrate()</SCRIPT></body></html>',
		);

		expect(await findPublishedOutputViolations(outputDirectory)).toEqual([
			{ file: join('lines', 'ggal-stock-byma-ars', 'index.html'), markers: ['<script'] },
		]);
	});

	test('names any published file that carries storage configuration', async () => {
		await publish('config.json', '{"OBSERVATORY_STORAGE_BUCKET":"history-bars"}');
		await publish('notes.txt', 'Endpoint: https://storageapi.example.test');

		const violations = await findPublishedOutputViolations(outputDirectory);

		expect(violations).toHaveLength(2);
		expect(violations).toContainEqual({
			file: 'config.json',
			markers: ['OBSERVATORY_STORAGE'],
		});
		expect(violations).toContainEqual({ file: 'notes.txt', markers: ['storageapi'] });
	});
});
