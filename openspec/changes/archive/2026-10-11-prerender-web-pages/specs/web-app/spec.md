## REMOVED Requirements

### Requirement: the home page renders the latest snapshot from the server

**Reason**: Pages are prerendered at build time, and a build without a snapshot fails instead of rendering "No snapshot available."
**Migration**: Replaced by "the home page lists every analyzed line" and "the build fails without a snapshot to render".

## ADDED Requirements

### Requirement: the home page lists every analyzed line

The web app SHALL render `/` from the latest Analysis Snapshot, read on the server with `readLatest`. Storage credentials and bucket reads SHALL stay on the server; the browser SHALL NOT call the bucket or the market-data provider. The page SHALL render the snapshot's `ranAt` and `requestedThroughSession` and, for each analyzed line in snapshot order, its Trading Line ID, whether it is available or unavailable, and a link to its line page.

#### Scenario: a snapshot exists

- **WHEN** the latest snapshot was written at 2026-10-04T15:00:00.000Z for 2026-10-02 with `ggal-stock-byma-ars` available
- **THEN** `/` shows both dates and `ggal-stock-byma-ars` as available, linked to `/lines/ggal-stock-byma-ars`

#### Scenario: credentials stay on the server

- **WHEN** the app is built
- **THEN** the client bundle contains no storage configuration or bucket client

### Requirement: the build prerenders a page per analyzed line

The web app SHALL be statically generated. `vite build` SHALL read the latest snapshot once and prerender exactly `/` and `/lines/<tradingLineId>` for each analyzed line in it, available or not. The page list SHALL be derived from the snapshot; no Trading Line ID SHALL be written in code or configuration.

#### Scenario: two analyzed lines

- **WHEN** the latest snapshot has `ggal-stock-byma-ars` available and `meli-cedear-byma-ars` unavailable
- **THEN** the build prerenders `/`, `/lines/ggal-stock-byma-ars` and `/lines/meli-cedear-byma-ars`, and no other page

#### Scenario: a line not in the snapshot

- **WHEN** `/lines/<tradingLineId>` is rendered for an ID the snapshot does not have
- **THEN** it renders not found

### Requirement: every page shows the session it describes

Every page SHALL show the snapshot's `requestedThroughSession`, so a reader can tell that a page describes an older session when a later run has not replaced it.

#### Scenario: a line page

- **WHEN** the snapshot's `requestedThroughSession` is 2026-10-10
- **THEN** `/` and every line page show 2026-10-10

### Requirement: a line page renders what the snapshot says about the line

A line page SHALL render the line's Trading Line ID and status from the snapshot and SHALL NOT compute domain values.

For an available line it SHALL render the latest State, its session date, Regime, Structure, RSI and price relative to the EMA in ATRs, showing a `null` part as not evaluated, never as a number. It SHALL render the line's Events in snapshot order, each with its session date, its type, its fields, and whether its session coincides with a Large One-Session Move. An available line without Events SHALL say it has none.

For an unavailable line it SHALL render the reason and message. For reason `insufficient-liquidity` it SHALL also render the participation and median daily traded value in USD, showing a `null` median as no trades in the window.

#### Scenario: an available line

- **WHEN** a line's State has Regime `bearish`, Structure `downtrend` and RSI `null`, and it has a volatility expansion on 2024-11-06
- **THEN** its page shows `bearish`, `downtrend`, RSI as not evaluated, and the 2024-11-06 volatility expansion with its True Range, baseline ATR and multiple

#### Scenario: an insufficiently liquid line

- **WHEN** a line is unavailable with reason `insufficient-liquidity`, participation 1 and median daily traded value 43,290 USD
- **THEN** its page shows the reason, the message and both measures

#### Scenario: a line without provider bars

- **WHEN** a line is unavailable with reason `no-provider-bars`
- **THEN** its page shows the reason and message

### Requirement: the build fails without a snapshot to render

The build SHALL fail, and SHALL NOT emit pages, when the latest snapshot is missing, unreadable or invalid, or has no analyzed lines. A page whose loader fails during prerendering SHALL fail the build.

#### Scenario: no latest snapshot

- **WHEN** the bucket has no `latest.json`
- **THEN** `vite build` fails with the read failure's message

#### Scenario: an invalid snapshot

- **WHEN** `latest.json` fails validation
- **THEN** `vite build` fails with the validation message

#### Scenario: a snapshot without analyzed lines

- **WHEN** `latest.json` has an empty `analyzedLines`
- **THEN** `vite build` fails
