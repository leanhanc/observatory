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

	const islandScript = '<script type="module" src="/_astro/line-chart-script.Bq3x.js"></script>';
	const islandPage = `<html><body><line-chart data-src="/lines/ggal-stock-byma-ars/chart.json"></line-chart>${islandScript}</body></html>`;

	test('accepts the chart island’s one bundled module on an available line’s page', async () => {
		await publish('index.html', '<html><body></body></html>');
		await publish('lines/ggal-stock-byma-ars/index.html', islandPage);

		expect(await findPublishedOutputViolations(outputDirectory)).toEqual([]);
	});

	test.each([
		['an inline script', islandPage.replace('</body>', '<script>hydrate()</script></body>')],
		['a second module script', islandPage.replace('</body>', `${islandScript}</body>`)],
		[
			'a script from another host',
			islandPage.replace('src="/_astro/', 'src="https://cdn.example.test/'),
		],
		[
			'a modulepreload link',
			islandPage.replace(
				'<body>',
				'<head><link rel="modulepreload" href="/_astro/react.js"></head><body>',
			),
		],
	])('names a line page with %s', async (_case, page) => {
		await publish('lines/ggal-stock-byma-ars/index.html', page);

		const violations = await findPublishedOutputViolations(outputDirectory);

		expect(violations).toHaveLength(1);
		expect(violations[0]!.file).toBe(join('lines', 'ggal-stock-byma-ars', 'index.html'));
	});

	test('names the island’s script on a page without a chart', async () => {
		await publish('index.html', `<html><body>${islandScript}</body></html>`);
		await publish(
			'lines/ggal-stock-byma-ars/index.html',
			`<html><body><h1>GGAL</h1>${islandScript}</body></html>`,
		);

		const violations = await findPublishedOutputViolations(outputDirectory);

		expect(violations).toEqual(
			expect.arrayContaining([
				{ file: 'index.html', markers: ['<script'] },
				{ file: join('lines', 'ggal-stock-byma-ars', 'index.html'), markers: ['<script'] },
			]),
		);
	});

	test('names a chart page that lost its island script', async () => {
		await publish('lines/ggal-stock-byma-ars/index.html', islandPage.replace(islandScript, ''));

		expect(await findPublishedOutputViolations(outputDirectory)).toEqual([
			{ file: join('lines', 'ggal-stock-byma-ars', 'index.html'), markers: ['<script'] },
		]);
	});

	// Only a line page may host the island, so a chart element elsewhere does not license a script.
	test('names the island on a page outside the line pages', async () => {
		await publish('index.html', islandPage);

		expect(await findPublishedOutputViolations(outputDirectory)).toEqual([
			{ file: 'index.html', markers: ['<script'] },
		]);
	});

	test('checks a chart file for storage configuration', async () => {
		await publish('lines/ggal-stock-byma-ars/chart.json', '{"note":"storageapi.example.test"}');

		expect(await findPublishedOutputViolations(outputDirectory)).toEqual([
			{ file: join('lines', 'ggal-stock-byma-ars', 'chart.json'), markers: ['storageapi'] },
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
