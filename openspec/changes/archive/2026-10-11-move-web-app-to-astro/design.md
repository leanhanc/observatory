# Design

## Why Astro

The pages are static and have no interactivity yet. TanStack Start still ships the React and Router runtime, about 344 KB, plus an inline copy of each line's data for hydration. Removing `<Scripts />` leaves modulepreload links and a router-hydration script, and TanStack Start has no islands. Next.js static export ships an RSC payload and one React tree.

Astro renders pages to HTML with zero client JavaScript by default. A component becomes interactive only with a `client:*` directive, as an island that hydrates on its own, which fits the charts and dismissable helpers planned later. `getStaticPaths` builds pages from build-time data, Astro has i18n routing for the later en/es work, and a single page can opt into on-demand rendering if a server feature arrives.

- https://docs.astro.build/en/concepts/islands/
- https://docs.astro.build/en/reference/routing-reference/
- https://docs.astro.build/en/guides/internationalization/
- https://docs.astro.build/en/recipes/bun/

## Layout

`astro.config.ts` sets `srcDir: './src/web'`, so `src/analysis` stays outside the app. Pages live in `src/web/pages`, the existing React components in `src/web/components`, and `line-formatting.ts` moves to `src/web/lib/utils`, since a `.ts` file under `pages` would become an endpoint. The `.astro` pages only wire data into React components, which keeps the markup type-checked by `tsc`.

`build.format: 'directory'` writes `lines/<tradingLineId>/index.html`, as TanStack Start did, and Railpack's Caddyfile answers `/lines/<tradingLineId>` and `/lines/<tradingLineId>/` with it, so live links keep working.

## Reading the snapshot once

The `provideLatestSnapshot` integration reads the snapshot in `astro:config:setup`, for `build` and `dev` only, and serves it to pages as the virtual module `virtual:observatory/latest-snapshot`. Both pages import that module, so the bucket is read once per build, and no page bundle imports the storage client or its configuration. A missing, invalid or empty snapshot throws in the hook and fails the build before any page is written, through the existing `readRenderableSnapshot` and `requireRenderableSnapshot`.

Astro does not load `.env` into the config's process, so the integration loads it with Vite's `loadEnv`, as the Astro docs recommend. With an empty prefix, variables already set in the process, as on Railway, win over `.env`.

- https://docs.astro.build/en/guides/environment-variables/
- https://docs.astro.build/en/reference/integrations-reference/

## No client JavaScript: the React renderer without its client entrypoint

Astro bundles every renderer's client entrypoint into the output, whether or not a page has an island (`getClientInput` in Astro's static build). With `@astrojs/react` that publishes a 220 KB React DOM bundle that no page references. `renderReactStatically` wraps the React integration and registers its renderer without `clientEntrypoint`, so React components render to HTML and nothing hydrates. The first island replaces it with `react()`.

## Build-output guard

`guardPublishedOutput` runs in `astro:build:done`, reads every file in the output and fails the build, naming each file, when one contains `<script`, `OBSERVATORY_STORAGE` or `storageapi`, ignoring case. A hook that throws fails `astro build` with exit code 1. The `<script` rule holds while no page has an island; the first island relaxes it deliberately, for that island's scripts only.

## Bun

`bun --bun astro build` and `bun --bun astro dev` work; the build of 174 pages takes about two seconds. Node is not needed.

## Railway

Railpack detects a static Astro site when `astro.config.ts` exists, the build script contains `astro build`, the config has no `output: 'server'` and no adapter is installed, and serves `outDir` (read from the config, `dist` by default) with Caddy. `RAILPACK_SPA_OUTPUT_DIR` is no longer needed. The `Staticfile` with `index_fallback: false` is still needed: Railpack's SPA Caddyfile falls back to `/index.html` unless it is set, which would answer an unknown line with the home page.

The `web` service watches `/astro.config.ts` instead of `/vite.config.ts`; `/src/web/**` covers the integrations.

- https://railpack.com/languages/node
- https://github.com/railwayapp/railpack/blob/main/core/providers/node/astro.go
- https://github.com/railwayapp/railpack/blob/main/core/providers/node/spa.go
- https://github.com/railwayapp/railpack/blob/main/core/providers/node/Caddyfile.template
