# Prerender the web pages

## Why

The scaffold renders `/` on every request by reading the bucket. The snapshot changes once per Analysis Run, so every visitor between two runs sees the same pages. The web app is true static generation, rebuilt daily. A later slice has the Analysis Run's cron job redeploy the web service after it writes `latest.json`; the build reads the bucket and prerenders every page. When a build fails, the previous deployment keeps serving, so a missing or broken snapshot must fail the build rather than publish empty pages.

## What Changes

- `vite build` reads the latest Analysis Snapshot once, derives the page list from it, `/` plus `/lines/<tradingLineId>` for each analyzed line in snapshot order, and prerenders exactly those pages. No Trading Line ID is written in code or configuration.
- A new page per analyzed line renders what the snapshot says about it: for an available line its latest State and its Events; for an unavailable line its reason and message, and for `insufficient-liquidity` its liquidity measures. The page computes no domain value.
- `/` links to each line page.
- Every page shows the snapshot's `requestedThroughSession`, so a reader can tell when a page has gone stale.
- The build fails when the snapshot is missing, unreadable, invalid or has no analyzed lines. `/` no longer renders "No snapshot available."
- `readLatest` validates the State, Event and unavailable-line fields the line page reads.

## Non-goals

The cron redeploy trigger, Railway service configuration, deployment, CDN, styling and page design. No ADR: rendering is a web decision, recorded here and in `design.md`.
