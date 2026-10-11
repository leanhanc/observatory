import react from '@astrojs/react';

import type { AstroIntegration } from 'astro';

type ConfigSetupHook = NonNullable<AstroIntegration['hooks']['astro:config:setup']>;

/**
 * The React integration, rendering components to HTML only. Astro bundles every renderer's client
 * entrypoint, the React runtime that hydrates islands, into the output even when no page has an
 * island, so this registers the renderer without it. The first island replaces this with `react()`.
 */
export function renderReactStatically(): AstroIntegration {
	const reactIntegration = react();
	const setUpReact = reactIntegration.hooks['astro:config:setup'];

	if (!setUpReact) {
		throw new Error('The React integration no longer registers its renderer at config setup.');
	}

	const setUpServerRenderer: ConfigSetupHook = (options) =>
		setUpReact({
			...options,
			addRenderer: ({ clientEntrypoint: _clientEntrypoint, ...serverRenderer }) =>
				options.addRenderer(serverRenderer),
		});

	return {
		...reactIntegration,
		hooks: { ...reactIntegration.hooks, 'astro:config:setup': setUpServerRenderer },
	};
}
