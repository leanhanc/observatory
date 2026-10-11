import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { readRenderableSnapshot } from './src/web/lib/utils/latest-analysis-snapshot.server.ts';
import { buildPrerenderPages } from './src/web/lib/utils/snapshot-pages.ts';

import type { PrerenderPage } from './src/web/lib/utils/snapshot-pages.ts';

export default defineConfig(async ({ command, isPreview, mode }) => {
	// The prerender step reloads this config for its preview server, with `command: 'serve'`, so
	// only the build itself reads the snapshot. A missing or invalid snapshot throws and fails it.
	const isBuild = command === 'build' && !isPreview;
	const prerenderPages: PrerenderPage[] = isBuild ? await listPrerenderPages(mode) : [];

	return {
		server: { port: 3000 },
		// Resolves the `#lib/*` and `#modules/*` aliases from tsconfig.json.
		resolve: { tsconfigPaths: true },
		plugins: [
			// The app lives in `src/web` so that the analysis engine in `src/analysis` stays outside it.
			tanstackStart({
				srcDirectory: 'src/web',
				// Automatic discovery skips `/lines/$tradingLineId`, so the snapshot lists the pages.
				// Crawling links is off so that the pages prerendered are exactly the listed ones.
				pages: prerenderPages,
				prerender: { enabled: isBuild, crawlLinks: false },
			}),
			// Must come after `tanstackStart`.
			viteReact(),
		],
	};
});

// TanStack Start loads `.env` into `process.env` only once this config has resolved, so the build
// loads it here. Variables already set in the process, as on Railway, take precedence.
async function listPrerenderPages(mode: string): Promise<PrerenderPage[]> {
	const environment = loadEnv(mode, process.cwd(), '');
	const snapshot = await readRenderableSnapshot(environment);
	return buildPrerenderPages(snapshot);
}
