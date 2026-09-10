/* eslint-disable no-await-in-loop, no-console -- Sequential requests limit provider traffic; this CLI reports observation paths. */
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const BASE_URL = 'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free';
const PANEL_PATHS = ['cedears', 'leading-equity'];
const PANEL_REQUEST_BODY = JSON.stringify({
	excludeZeroPxAndQty: false,
	T1: true,
	T0: false,
	page_size: 5_000,
});
const SYMBOLS = ['GGAL', 'YPFD', 'AAPL'];
const REQUEST_PAUSE_MS = 2_000;
const REQUEST_TIMEOUT_MS = 20_000;
const REQUESTS_PER_SAMPLE = 1 + PANEL_PATHS.length + SYMBOLS.length;
const TIMEZONE = 'America/Argentina/Buenos_Aires';

async function observe() {
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			samples: { type: 'string', default: '1' },
			'interval-minutes': { type: 'string', default: '15' },
			output: { type: 'string', default: '/tmp/observatory-bymadata-observations' },
			help: { type: 'boolean' },
		},
	});
	if (values.help) {
		console.log(
			'bun scripts/bymadata-observer.ts [--samples 8] [--interval-minutes 15] [--output /path]',
		);
		return;
	}
	const samples = Number(values.samples);
	const intervalMinutes = Number(values['interval-minutes']);
	if (!Number.isInteger(samples) || samples < 1 || samples > 32) {
		throw new Error('Samples must be an integer between 1 and 32.');
	}
	if (!Number.isFinite(intervalMinutes) || intervalMinutes < 10) {
		throw new Error('Interval must be at least 10 minutes.');
	}
	const outputDirectory = resolve(values.output);
	await mkdir(outputDirectory, { recursive: true });
	console.log(`Up to ${samples * REQUESTS_PER_SAMPLE} requests; output: ${outputDirectory}`);
	for (let sample = 0; sample < samples; sample++) {
		const observedAt = Temporal.Now.instant();
		const sessionDate = observedAt.toZonedDateTimeISO(TIMEZONE).toPlainDate();
		const from =
			sessionDate.subtract({ days: 7 }).toZonedDateTime(TIMEZONE).epochMilliseconds / 1_000;
		const to = sessionDate.add({ days: 1 }).toZonedDateTime(TIMEZONE).epochMilliseconds / 1_000;
		const observations = [];
		const market = await request('market-time', new URL(`${BASE_URL}/market-time`), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		});
		observations.push(market);
		if (!market.stop) {
			for (const panelPath of PANEL_PATHS) {
				await Bun.sleep(REQUEST_PAUSE_MS);
				const panel = await request(
					`${panelPath}-panel`,
					new URL(`${BASE_URL}/${panelPath}`),
					{
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: PANEL_REQUEST_BODY,
					},
				);
				observations.push(panel);
				if (panel.stop) break;
			}
		}
		const hasPanelFailure = observations.some((observation) => observation.stop);
		if (!hasPanelFailure) {
			for (const symbol of SYMBOLS) {
				await Bun.sleep(REQUEST_PAUSE_MS);
				const url = new URL(`${BASE_URL}/chart/historical-series/history`);
				url.search = new URLSearchParams({
					symbol: `${symbol} 24HS`,
					resolution: 'D',
					from: String(from),
					to: String(to),
				}).toString();
				const observation = await request(symbol, url);
				observations.push(observation);
				if (observation.stop) break;
			}
		}
		const fileName = `${observedAt.toString().replaceAll(':', '-')}-${crypto.randomUUID()}.json`;
		const path = join(outputDirectory, fileName);
		await Bun.write(
			path,
			JSON.stringify(
				{
					observedAt: observedAt.toString(),
					localDate: sessionDate.toString(),
					timezone: TIMEZONE,
					observations,
				},
				null,
				2,
			),
		);
		console.log(`Saved ${path}`);
		const shouldStop = observations.some((observation) => observation.stop);
		if (shouldStop) {
			console.error(
				'Stopped after a failed request. Inspect the saved observation before retrying.',
			);
			process.exitCode = 1;
			return;
		}
		if (sample + 1 < samples) await Bun.sleep(intervalMinutes * 60_000);
	}
}

async function request(label: string, url: URL, init?: RequestInit) {
	const requestedAt = new Date().toISOString();
	let response: Response | undefined;
	try {
		response = await fetch(url, {
			...init,
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		const body = await response.text();
		return {
			label,
			requestedAt,
			receivedAt: new Date().toISOString(),
			url: url.toString(),
			status: response.status,
			serverDate: response.headers.get('date'),
			lastModified: response.headers.get('last-modified'),
			age: response.headers.get('age'),
			retryAfter: response.headers.get('retry-after'),
			body,
			stop: !response.ok,
		};
	} catch (error) {
		return {
			label,
			requestedAt,
			receivedAt: new Date().toISOString(),
			url: url.toString(),
			status: response?.status,
			serverDate: response?.headers.get('date'),
			lastModified: response?.headers.get('last-modified'),
			age: response?.headers.get('age'),
			retryAfter: response?.headers.get('retry-after'),
			error: String(error),
			stop: true,
		};
	}
}

await observe();
