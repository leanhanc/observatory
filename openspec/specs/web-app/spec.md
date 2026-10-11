# web-app Specification

## Purpose

The public web app: statically generated pages that render the latest Analysis Snapshot.

## Requirements

### Requirement: the home page renders the latest snapshot from the server

The web app SHALL serve `/` by reading the latest Analysis Snapshot on the server with `readLatest`. Storage credentials and bucket reads SHALL stay on the server; the browser SHALL NOT call the bucket or the market-data provider. The page SHALL render the snapshot's `ranAt` and `requestedThroughSession` and, for each analyzed line in snapshot order, its Trading Line ID and whether it is available or unavailable.

When `readLatest` fails for any reason, the page SHALL render "No snapshot available." instead.

#### Scenario: a snapshot exists

- **WHEN** the latest snapshot was written at 2026-10-04T15:00:00.000Z for 2026-10-02 with `ggal-stock-byma-ars` available
- **THEN** `/` shows both dates and `ggal-stock-byma-ars` as available

#### Scenario: no readable snapshot

- **WHEN** `readLatest` fails
- **THEN** `/` shows "No snapshot available."

#### Scenario: credentials stay on the server

- **WHEN** the app is built
- **THEN** the client bundle contains no storage configuration or bucket client
