## MODIFIED Requirements

### Requirement: the build prerenders a page per analyzed line

The web app SHALL be statically generated. The build SHALL read the latest snapshot once and prerender exactly `/`, `/lines/<tradingLineId>` for each analyzed line in it, available or not, and the not-found page. Each page except the not-found page SHALL be written as `index.html` in a directory named after its path, so that it is served with or without a trailing slash. The page list SHALL be derived from the snapshot; no Trading Line ID SHALL be written in code or configuration.

#### Scenario: two analyzed lines

- **WHEN** the latest snapshot has `ggal-stock-byma-ars` available and `meli-cedear-byma-ars` unavailable
- **THEN** the build writes `index.html`, `lines/ggal-stock-byma-ars/index.html`, `lines/meli-cedear-byma-ars/index.html` and `404.html`, and no other page

#### Scenario: a line not in the snapshot

- **WHEN** the snapshot does not have a Trading Line ID
- **THEN** the build writes no page for it

### Requirement: every page shows the session it describes

Every page that renders the snapshot SHALL show the snapshot's `requestedThroughSession`, so a reader can tell that a page describes an older session when a later run has not replaced it. The not-found page renders no snapshot.

#### Scenario: a line page

- **WHEN** the snapshot's `requestedThroughSession` is 2026-10-10
- **THEN** `/` and every line page show 2026-10-10

## ADDED Requirements

### Requirement: a path without a page shows the not-found page

A request for a path the build wrote no page for SHALL answer with status 404 and the not-found page, which SHALL say that the page does not exist and link to `/`. It SHALL NOT answer with another page or with status 200.

#### Scenario: a line no longer in the snapshot

- **WHEN** a request asks for `/lines/<tradingLineId>` for an ID the latest build did not prerender
- **THEN** the site answers 404 with the not-found page and its link to `/`

#### Scenario: a prerendered page

- **WHEN** a request asks for `/lines/ggal-stock-byma-ars` and the build prerendered it
- **THEN** the site answers 200 with that line page
