# Add a not-found page

## Why

A line leaves the snapshot when it is delisted or stops being liquid, and its page disappears with the next daily build. A bookmarked or shared link to it then answers 404 with an empty body, so the reader sees the browser's default error and no way back to the site.

## What Changes

- The build writes a not-found page, `404.html`, that says the page does not exist and links to `/`.
- A path without a page answers 404 with that page. Real pages are unchanged.
- The repository has its own `Caddyfile`, based on Railpack's template, that serves `404.html` for 404s. The `Staticfile` goes away: it only turned off the template's fallback to `/index.html`, and this `Caddyfile` has none.
- The `web` service watches `/Caddyfile` instead of `/Staticfile`.

## Capabilities

### Modified Capabilities

- `web-app`: the build also writes the not-found page, and a path without a page answers with it.

## Non-goals

The page's wording and styling, which belong to the wording pass. No ADR: serving is not an analysis decision, so it is recorded here and in `design.md`.
