# Move the web app to Astro

## Why

The pages have no interactivity yet, but every prerendered page ships client JavaScript it does not use: TanStack Start sends the React and Router runtime, about 344 KB, plus an inline copy of the line's data for hydration. Removing `<Scripts />` still leaves modulepreload links and a router-hydration script, and TanStack Start has no islands. Next.js static export would still ship an RSC payload and one React tree.

Astro renders pages to HTML with no client JavaScript by default. Interactivity is opt-in per component, as React islands, which fits the charts and dismissable helpers planned later. It also builds static paths from build-time data, has i18n routing for the later en/es work, and can render a single page on demand if a server feature ever arrives.

## What Changes

- The web app in `src/web` is built with Astro instead of TanStack Start, as static output with the React integration. `src/analysis` stays outside it.
- The URLs stay the same: `/` and `/lines/<tradingLineId>`, each written as a directory with an `index.html`, so live links with or without a trailing slash keep working.
- The build reads the latest snapshot once, with `.env` values available locally and process variables winning on Railway, and fails on a missing, invalid or empty snapshot, as before.
- The existing React components render statically, with no client directive. Pages ship no client JavaScript.
- A build-output guard fails the build when any published file contains a `<script` tag, a storage variable name or the bucket endpoint host.
- The server functions, the router, the generated route tree, the Vite prerender configuration and the TanStack packages are removed.
- The `web` Railway service serves Astro's `dist` and watches `astro.config.ts` instead of `vite.config.ts`.

## Capabilities

### Modified Capabilities

- `web-app`: pages are built without a server-side render path, ship no client JavaScript unless a component is an island, and the build checks the published output.

## Non-goals

Styling, wording, islands and i18n. No ADR: the web framework is not an analysis decision, so it is recorded here and in `design.md`.
