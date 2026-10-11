# Deploy the web service

## Why

The Astro build prerenders every page from the latest Analysis Snapshot, but nothing builds or serves those pages on Railway, and a new snapshot does not reach the site until someone redeploys it. The web app is true static generation, rebuilt daily, and a failed build keeps the previous deployment serving.

## What Changes

- A `web` service in `.railway/railway.ts` builds with Railpack and `bun run build`, reading the bucket at build time, and serves the prerendered `dist` as static files. No server process renders pages.
- A path without a prerendered page answers 404 instead of falling back to `/`.
- Watch paths for `web` and `analysis-run`, so that a commit redeploys only the services whose build it can change.
- After writing the snapshot to the bucket, the Analysis Run asks Railway to deploy the `web` service. A failed or unconfigured request logs a warning and does not fail the run.
- The logger redacts the Railway token's variable name.

## Non-goals

A custom domain, a CDN, caching headers, page design and retries of the deploy request. No ADR: deployment is not an analysis decision, so it is recorded here and in `design.md`.
