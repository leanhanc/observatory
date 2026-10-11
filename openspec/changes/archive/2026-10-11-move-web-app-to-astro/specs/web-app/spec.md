## MODIFIED Requirements

### Requirement: the home page lists every analyzed line

The web app SHALL render `/` from the latest Analysis Snapshot, read at build time with `readLatest`. Storage credentials and bucket reads SHALL stay in the build; the browser SHALL NOT call the bucket or the market-data provider. The page SHALL render the snapshot's `ranAt` and `requestedThroughSession` and, for each analyzed line in snapshot order, its Trading Line ID, whether it is available or unavailable, and a link to its line page.

#### Scenario: a snapshot exists

- **WHEN** the latest snapshot was written at 2026-10-04T15:00:00.000Z for 2026-10-02 with `ggal-stock-byma-ars` available
- **THEN** `/` shows both dates and `ggal-stock-byma-ars` as available, linked to `/lines/ggal-stock-byma-ars`

#### Scenario: credentials stay on the server

- **WHEN** the app is built
- **THEN** the published output contains no storage configuration or bucket client

### Requirement: the build prerenders a page per analyzed line

The web app SHALL be statically generated. The build SHALL read the latest snapshot once and prerender exactly `/` and `/lines/<tradingLineId>` for each analyzed line in it, available or not. Each page SHALL be written as `index.html` in a directory named after its path, so that it is served with or without a trailing slash. The page list SHALL be derived from the snapshot; no Trading Line ID SHALL be written in code or configuration.

#### Scenario: two analyzed lines

- **WHEN** the latest snapshot has `ggal-stock-byma-ars` available and `meli-cedear-byma-ars` unavailable
- **THEN** the build writes `index.html`, `lines/ggal-stock-byma-ars/index.html` and `lines/meli-cedear-byma-ars/index.html`, and no other page

#### Scenario: a line not in the snapshot

- **WHEN** the snapshot does not have a Trading Line ID
- **THEN** the build writes no page for it

### Requirement: the build fails without a snapshot to render

The build SHALL fail, and SHALL NOT emit pages, when the latest snapshot is missing, unreadable or invalid, or has no analyzed lines. A page that fails to render SHALL fail the build.

#### Scenario: no latest snapshot

- **WHEN** the bucket has no `latest.json`
- **THEN** the build fails with the read failure's message

#### Scenario: an invalid snapshot

- **WHEN** `latest.json` fails validation
- **THEN** the build fails with the validation message

#### Scenario: a snapshot without analyzed lines

- **WHEN** `latest.json` has an empty `analyzedLines`
- **THEN** the build fails

## ADDED Requirements

### Requirement: pages ship no client JavaScript unless a component is an island

A page SHALL be plain HTML and CSS. It SHALL ship client JavaScript only for a component explicitly declared as an island, which hydrates on its own; no page has one yet. A page SHALL NOT embed a copy of its data for client-side rendering.

#### Scenario: a line page

- **WHEN** the build writes a line page
- **THEN** the page has no `<script` tag, no modulepreload link and no serialized copy of the snapshot

### Requirement: the build fails when the published output could leak or run code

After writing the pages, the build SHALL check every published file and fail, naming the file, when one contains a `<script` tag, a storage variable name (`OBSERVATORY_STORAGE`) or the bucket endpoint host (`storageapi`). The `<script` rule holds while no page has an island; adding the first island SHALL relax it deliberately, for that island's scripts only.

#### Scenario: a clean build

- **WHEN** the published files contain no script tag, storage variable name or bucket host
- **THEN** the build succeeds

#### Scenario: a script reaches the output

- **WHEN** a published page contains `<script`
- **THEN** the build fails and names the page

#### Scenario: server configuration reaches the output

- **WHEN** a published file contains `OBSERVATORY_STORAGE` or `storageapi`
- **THEN** the build fails and names the file
