# Design

## Rendering: static generation, rebuilt daily

Pages change only when an Analysis Run writes a new snapshot, so they are rendered once per run at build time instead of once per request. The Analysis Run's cron job will later trigger a redeploy of the web service after it writes `latest.json`. A failed build leaves the previous deployment serving, which is why every way of having no snapshot to render fails the build: a stale page that shows its session is better than an empty one.

## How prerendering finds the pages

TanStack Start's `prerender` option on the `tanstackStart` Vite plugin prerenders the `pages` list. Its automatic static path discovery skips routes with path parameters such as `/lines/$tradingLineId`, and link crawling would make the page set depend on the markup of `/`. So `vite.config.ts`, during `vite build` only, reads the latest snapshot and passes the pages derived from it (`buildPrerenderPages`) as `pages`, with `crawlLinks: false`, so the set prerendered is exactly the snapshot's lines. `failOnError` stays at its default, `true`: a page that fails to render, including one whose loader throws, fails the build.

- https://tanstack.com/start/latest/docs/framework/react/guide/static-prerendering
- https://tanstack.com/start/latest/docs/framework/react/guide/server-functions

## Reading the snapshot during a build

The loaders read the snapshot through a server function. The prerender requests each page from one server process, so `readLatestAnalysisSnapshot` reads the bucket once per process and reuses that snapshot: every page of a build describes the same run, and the 2 MB snapshot is not downloaded per page. `vite.config.ts` reads it once more to list the pages, loading `.env` itself with Vite's `loadEnv`, because TanStack Start copies `.env` into `process.env` only after the config resolves; variables already set in the process, as on Railway, take precedence. A run that replaced `latest.json` between those two reads would make a listed line missing (its page renders not found and the build fails) or an unlisted line go without a page until the next build; the redeploy follows the write, so the window is small. A dev server keeps the snapshot it read first until it restarts.

## Links are plain anchors

`/` links to line pages with `<a href>`, not the router's `Link`. A `Link` navigation runs the target's loader in the browser, which calls the server function over HTTP, and a statically served site has no server to answer it. A plain anchor loads the prerendered HTML. TanStack Start's static server functions would cache those calls at build time, at the cost of a dependency nothing needs yet.

## What the line page shows

The page renders snapshot values only. Numbers are formatted for reading; `null` State parts are shown as not evaluated, never as `0`; Structure's `undefined` is shown as the reading it is. Events keep snapshot order and show their session, type, fields and whether the session is a Large One-Session Move. The validated snapshot shape grows by the fields this page reads, as the scaffold proposal planned; the index page's server function returns only the IDs and statuses it lists.
