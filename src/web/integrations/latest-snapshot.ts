import { fileURLToPath } from 'node:url';

import { loadEnv } from 'vite';

import {
	SNAPSHOT_FILE_VARIABLE,
	readRenderableSnapshot,
} from '#web/lib/utils/latest-analysis-snapshot/index.ts';

import type { AstroIntegration } from 'astro';
import type { Plugin } from 'vite';

const LATEST_SNAPSHOT_MODULE_ID = 'virtual:observatory/latest-snapshot';
const RESOLVED_LATEST_SNAPSHOT_MODULE_ID = `\0${LATEST_SNAPSHOT_MODULE_ID}`;

/**
 * Reads the latest Analysis Snapshot once, when a build or dev server starts, and serves it to the
 * pages as `virtual:observatory/latest-snapshot`. Pages import the snapshot, never the storage
 * client, so storage configuration stays in this process.
 *
 * Astro does not load `.env` into the config's process, so it is loaded here. Variables already set
 * in the process, as on Railway, take precedence.
 *
 * @throws {Error} when the storage environment variables are missing or invalid, or when there is
 * no snapshot to render, which fails the build.
 */
export function provideLatestSnapshot(): AstroIntegration {
	return {
		name: 'observatory:latest-snapshot',
		hooks: {
			'astro:config:setup': async ({ command, config, updateConfig, logger }) => {
				const shouldRenderPages = command === 'build' || command === 'dev';

				if (!shouldRenderPages) {
					return;
				}

				const environment = loadEnv('production', fileURLToPath(config.root), '');
				const snapshotFile = environment[SNAPSHOT_FILE_VARIABLE]?.trim();

				// `.env` feeds this too, so a leftover override must not silently replace the bucket.
				if (snapshotFile) {
					logger.warn(`Reading the snapshot from ${snapshotFile}, not the bucket.`);
				}

				const snapshot = await readRenderableSnapshot(environment);
				updateConfig({ vite: { plugins: [serveLatestSnapshot(snapshot)] } });
			},
		},
	};
}

function serveLatestSnapshot(snapshot: unknown): Plugin {
	return {
		name: 'observatory:latest-snapshot-module',
		resolveId(id) {
			if (id !== LATEST_SNAPSHOT_MODULE_ID) {
				return null;
			}

			return RESOLVED_LATEST_SNAPSHOT_MODULE_ID;
		},
		load(id) {
			if (id !== RESOLVED_LATEST_SNAPSHOT_MODULE_ID) {
				return null;
			}

			return `export default ${JSON.stringify(snapshot)};`;
		},
	};
}
