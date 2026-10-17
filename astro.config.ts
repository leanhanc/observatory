import { defineConfig, fontProviders } from 'astro/config';

import { provideLatestSnapshot } from './src/web/integrations/latest-snapshot.ts';
import { guardPublishedOutput } from './src/web/integrations/published-output-guard.ts';
import { renderReactStatically } from './src/web/integrations/static-react.ts';

export default defineConfig({
	// The app lives in `src/web` so that the analysis engine in `src/analysis` stays outside it.
	srcDir: './src/web',
	// Railpack detects a static Astro build and serves `dist`; see `.railway/railway.ts`.
	output: 'static',
	outDir: './dist',
	// Each page is `<path>/index.html`, which the server answers with or without a trailing slash.
	build: { format: 'directory' },
	server: { port: 3000 },
	integrations: [renderReactStatically(), provideLatestSnapshot(), guardPublishedOutput()],
	// Downloaded from Fontsource at build time and served from the output, so a page makes no
	// request to a font host.
	fonts: [
		{
			provider: fontProviders.fontsource(),
			name: 'Newsreader',
			cssVariable: '--font-newsreader',
			weights: [400, 500],
			styles: ['normal'],
			subsets: ['latin'],
		},
		{
			provider: fontProviders.fontsource(),
			name: 'Geist',
			cssVariable: '--font-geist',
			weights: [400, 500, 600],
			styles: ['normal'],
			subsets: ['latin'],
		},
		{
			provider: fontProviders.fontsource(),
			name: 'Geist Mono',
			cssVariable: '--font-geist-mono',
			weights: [400, 500],
			styles: ['normal'],
			subsets: ['latin'],
		},
	],
});
