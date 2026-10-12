# web-app Specification

## Purpose

The public web app: statically generated pages that render the latest Analysis Snapshot.

## Requirements

### Requirement: the home page lists every analyzed line

The web app SHALL render `/` from the latest Analysis Snapshot, read at build time with `readLatest`. Storage credentials and bucket reads SHALL stay in the build; the browser SHALL NOT call the bucket or the market-data provider. The page SHALL render the snapshot's `ranAt` and `requestedThroughSession` and, for each analyzed line in snapshot order, its Trading Line ID, whether it is available or unavailable, and a link to its line page.

#### Scenario: a snapshot exists

- **WHEN** the latest snapshot was written at 2026-10-04T15:00:00.000Z for 2026-10-02 with `ggal-stock-byma-ars` available
- **THEN** `/` shows both dates and `ggal-stock-byma-ars` as available, linked to `/lines/ggal-stock-byma-ars`

#### Scenario: credentials stay on the server

- **WHEN** the app is built
- **THEN** the published output contains no storage configuration or bucket client

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

### Requirement: a line page renders what the snapshot says about the line

A line page SHALL render the line's Trading Line ID and status from the snapshot and SHALL NOT compute domain values.

For an available line it SHALL render the latest State, its session date, Regime, the pending Regime transition, Structure, the last confirmed swing high and low, RSI, price relative to the EMA in ATRs, and price relative to the long-term EMA as a percentage, showing a `null` part as not evaluated, never as a number. A pending Regime transition SHALL show its candidate and its confirmations out of the required ones, and `null` as none, since a missing candidate is a reading rather than a gap. A last confirmed swing SHALL show its price, its occurrence and confirmation session dates and the close's distance from it as a percentage, and `null` as none confirmed yet. For a reader who trades the peso line, the page SHALL also show values from `pesoEquivalents` in pesos, and SHALL NOT convert any value itself. The peso close SHALL be shown with its session as a market fact, not as a conversion. Each last confirmed swing SHALL be shown as an approximate equivalent, with the session and the MEP Rate in pesos per MEP dollar it was converted at, or as none confirmed yet. The page SHALL say that swing levels are found on prices in MEP dollars, and that their peso equivalents move with the MEP Rate and are not prices at which the line turned in pesos. A swing whose distance from the close is `null` SHALL say that the distance was not evaluated. It SHALL render the line's Events in snapshot order, each with its session date, its type, its fields, and whether its session coincides with a Large One-Session Move. An available line without Events SHALL say it has none.

Every price and ATR the page shows, such as a Structure Break's close and swing price, a last confirmed swing's price, or a Volatile Session's True Range and baseline ATR, SHALL be labeled with the snapshot's `priceUnit`; `mep-dollar` SHALL be labeled `MEP dollars`. The page SHALL take the unit from the snapshot and SHALL NOT assume one. Ratios, percentages and ATR multiples SHALL NOT be labeled with a price unit.

For an unavailable line it SHALL render the reason and message. For reason `insufficient-liquidity` it SHALL also render the participation and median daily traded value in USD, showing a `null` median as no trades in the window.

#### Scenario: an available line

- **WHEN** a line's State has Regime `bearish`, Structure `downtrend`, RSI `null` and price relative to the long-term EMA `-4.2`, and it has a Volatile Session
- **THEN** its page shows `bearish`, `downtrend`, RSI as not evaluated, `-4.2%`, and the Volatile Session with its session date, True Range, baseline ATR and multiple

#### Scenario: long-term EMA not yet readable

- **WHEN** a line's State has price relative to the long-term EMA `null`
- **THEN** its page shows it as not evaluated

#### Scenario: prices carry the snapshot's unit

- **WHEN** the snapshot's `priceUnit` is `mep-dollar` and a line has a Structure Break with close 7.12
- **THEN** the page shows the close as `7.12 MEP dollars`
- **AND** the Event's multiples and the State's ratios carry no price unit

#### Scenario: watch levels and a pending Regime transition

- **WHEN** a line's State has a pending transition to `bearish` with 2 of 3 confirmations, a last confirmed swing high at 7.5 that occurred 2026-09-01 and was confirmed 2026-09-04 with the close 5% below it, and no confirmed swing low
- **THEN** its page shows the candidate `bearish` with 2 of 3 confirmations
- **AND** the swing high as `7.5 MEP dollars`, its two session dates and `-5%`
- **AND** the swing low as none confirmed yet

#### Scenario: watch levels in pesos

- **WHEN** a line's `pesoEquivalents` has session 2026-10-09, MEP Rate 1500, close 5790 and last confirmed swing high 6000
- **THEN** its page shows the close on 2026-10-09 as 5,790 pesos, without a conversion
- **AND** the swing high as about 6,000 pesos, its equivalent at the 2026-10-09 MEP Rate of 1,500 pesos per MEP dollar
- **AND** that peso equivalents move with the MEP Rate and are not prices at which the line turned in pesos

#### Scenario: no pending Regime transition

- **WHEN** a line's State has `pendingRegimeTransition` `null`
- **THEN** its page shows no pending transition, not a missing value

#### Scenario: an insufficiently liquid line

- **WHEN** a line is unavailable with reason `insufficient-liquidity`, participation 1 and median daily traded value 43,290 USD
- **THEN** its page shows the reason, the message and both measures

#### Scenario: a line without provider bars

- **WHEN** a line is unavailable with reason `no-provider-bars`
- **THEN** its page shows the reason and message

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

### Requirement: the deployed site serves only prerendered files

The web service SHALL serve the build's prerendered output as static files, with no server process rendering pages. The build SHALL read the bucket with the storage variables available at build time. A path SHALL serve the prerendered HTML file for it, and a path without one SHALL answer 404 rather than another page.

#### Scenario: a line page

- **WHEN** the build prerendered `/lines/ggal-stock-byma-ars` as `lines/ggal-stock-byma-ars/index.html`
- **THEN** a request for `/lines/ggal-stock-byma-ars` returns that file

#### Scenario: a line without a page

- **WHEN** a request asks for `/lines/<tradingLineId>` for an ID the latest build did not prerender
- **THEN** the site answers 404, not the home page

#### Scenario: a failed build

- **WHEN** a deployment's build fails
- **THEN** the previous deployment keeps serving its pages

### Requirement: a commit deploys only the services it can change

Each Railway service SHALL watch the paths its build or start reads, so that a commit changing none of them does not deploy it. The web service SHALL watch the web app, the analysis engine and the storage configuration its build reads; the Analysis Run service SHALL watch the analysis engine and the server commands. Both SHALL watch the package manifest, lockfile and TypeScript configuration, and neither SHALL watch test files.

#### Scenario: a web-only change

- **WHEN** a commit changes only files under `src/web`
- **THEN** the web service deploys and the Analysis Run service does not

#### Scenario: a server-only change

- **WHEN** a commit changes only files under `src/server/analysis-run`
- **THEN** the Analysis Run service deploys and the web service does not

#### Scenario: a snapshot schema change

- **WHEN** a commit changes files under `src/analysis`
- **THEN** both services deploy

### Requirement: a path without a page shows the not-found page

A request for a path the build wrote no page for SHALL answer with status 404 and the not-found page, which SHALL say that the page does not exist and link to `/`. It SHALL NOT answer with another page or with status 200.

#### Scenario: a line no longer in the snapshot

- **WHEN** a request asks for `/lines/<tradingLineId>` for an ID the latest build did not prerender
- **THEN** the site answers 404 with the not-found page and its link to `/`

#### Scenario: a prerendered page

- **WHEN** a request asks for `/lines/ggal-stock-byma-ars` and the build prerendered it
- **THEN** the site answers 200 with that line page
