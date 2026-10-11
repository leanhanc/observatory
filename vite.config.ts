import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	server: { port: 3000 },
	// Resolves the `#lib/*` and `#modules/*` aliases from tsconfig.json.
	resolve: { tsconfigPaths: true },
	plugins: [
		// The app lives in `src/web` so that the analysis engine in `src/analysis` stays outside it.
		tanstackStart({ srcDirectory: 'src/web' }),
		// Must come after `tanstackStart`.
		viteReact(),
	],
});
