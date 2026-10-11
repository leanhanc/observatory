# Scaffold the web app

## Why

The Analysis Run writes an Analysis Snapshot to the bucket and exits; nothing reads it yet. Public pages are the product's surface, so the first web slice proves the path from the bucket to a server-rendered page, with credentials kept on the server, before any page design or rendering strategy is chosen.

## What Changes

- The source splits into three top-level folders in one package: `src/analysis` holds the analysis engine (the former `src/modules` and `src/lib`), `src/server` the server commands (the former `scripts/`, including the Analysis Run cron job) and `src/web` the TanStack Start app. The `#modules/*` and `#lib/*` aliases point into `src/analysis`, and `#server/*` and `#web/*` are added. An oxlint rule stops `src/analysis` from importing `src/server`, `src/web`, React or TanStack.
- A TanStack Start app on Bun under `src/web`, with `dev` and `build` scripts.
- The bucket-backed snapshot storage gains `readLatest`, which reads `analysis-snapshots/v5/latest.json` and validates it before returning it.
- One page, `/`, reads the latest snapshot in a server function and renders the run's `ranAt` and `requestedThroughSession` and each analyzed line's Trading Line ID with its status. A missing or unreadable snapshot renders "No snapshot available."
- The storage configuration resolver lives in `src/server`, and the web app's server code imports it from there.
- The Railway cron job's start command becomes `bun src/server/analysis-run/analysis-run.ts`. The `corporate-actions` and `corporate-action-watch` specs name their data files under `src/analysis/modules`.

`readLatest` validates only the fields the web reads: the schema version, the run metadata and each line's IDs and status. The page reads nothing else, and a full schema of States, Events and Corporate Actions would duplicate the snapshot types for no current reader. Fields are added to the schema as pages start reading them.

## Non-goals

Prerendering, caching, page design and deployment. The rendering strategy for ADR 0003 is decided separately.
