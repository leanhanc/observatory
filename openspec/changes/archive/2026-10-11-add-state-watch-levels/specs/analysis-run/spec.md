## MODIFIED Requirements

### Requirement: the snapshot holds the latest State and every Event

The snapshot SHALL hold one entry per analyzed Trading Line in `analyzedLines`. For each analyzed Trading Line that could be analyzed and is liquidity-eligible, the entry SHALL have `status: 'available'`, `instrumentId`, `tradingLineId`, and:

- `latestState`: the Instrument State of the last session of the Dollarized Series. Its `sessionDate` MAY be earlier than the Requested-Through Session when the line did not trade, or had no MEP Rate, on later sessions.
- `events`: every Event detected in the analyzed window, each as `{ sessionDate, event, coincidesWithLargeMove }`, where `event.type` is the Event kind (`regime-transition`, `structure-break` or `volatile-session`). Events SHALL be ordered by `sessionDate`; Events of the same session SHALL follow that kind order.
- `largeMoves`: the Large One-Session Moves in the analyzed window.
- `corporateActions`: the line's Corporate Actions and whether each was applied.
- `window`: the first and last session dates and the bar count of the Dollarized Series that was analyzed.
- `sessionsWithoutMepRate`: the peso-line sessions that had no MEP Rate and therefore no dollarized bar.
- `rangeRepairSessions`: the peso-line sessions whose range the adapter widened.
- `droppedBarSessions`: the peso-line sessions whose invalid bar was dropped.
- `pesoEquivalents`: the latest State's session in pesos, for a reader who trades the peso line: `{ sessionDate, mepRate, close, lastConfirmedSwingHigh, lastConfirmedSwingLow }`. `sessionDate` SHALL equal `latestState.sessionDate`, `mepRate` SHALL be that session's MEP Rate, the one that dollarized its bar, and `close` SHALL be the line's corrected peso close on that session, a market fact. Each swing SHALL be the price of the State's last confirmed swing of that kind converted with `toPesoEquivalent` at that `mepRate`, or `null` when the State's swing is `null`. Because the close and the levels share one rate, the close's distance from each level in percent is the same in pesos as in MEP dollars.

A peso equivalent describes the dollarized level at that one session's MEP Rate; it is not a peso level that price turned at, and the peso price at which a later close would cross the level depends on that later session's MEP Rate.

A State part that cannot be evaluated SHALL be `null`, as in the Instrument State contract. A liquidity-eligible line with too little history for some parts SHALL still have a `latestState`. Eligibility already requires trading on at least 90% of the last 125 market sessions, so this applies to lines with roughly 113 to 200 sessions of history, which is too short for the 200-session averages of Regime and of price relative to the long-term EMA. Missing values SHALL NOT be replaced with `0`.

#### Scenario: latest State is the final session's State

- **WHEN** a line's Dollarized Series ends on a session
- **THEN** `latestState` equals the Instrument State calculated for that session over that series

#### Scenario: Events from all three detectors

- **WHEN** the window contains a Regime Transition, a Structure Break and a Volatile Session
- **THEN** `events` contains each of them with the session date on which it was detected

#### Scenario: short history

- **WHEN** a liquidity-eligible line has 120 dollarized bars
- **THEN** its entry is available with a `latestState` whose Regime and Structure are `null`
- **AND** its RSI and price relative to EMA are numbers
- **AND** its price relative to the long-term EMA is `null`

#### Scenario: peso equivalents of the watch levels

- **WHEN** a line's last session closed at 5790 pesos with a MEP Rate of 1500, and its State's last confirmed swing high is 4 MEP dollars and it has no confirmed swing low
- **THEN** `pesoEquivalents` is `{ sessionDate, mepRate: 1500, close: 5790, lastConfirmedSwingHigh: 6000, lastConfirmedSwingLow: null }` with the State's session date

### Requirement: run-level facts are recorded

The snapshot SHALL record `schemaVersion: 7`, `priceUnit`, `ranAt` as a UTC instant, `requestedThroughSession`, `analysisConfigurationVersion` equal to `ANALYSIS_CONFIGURATION.version`, and `mepRateSource` with both MEP rate source Trading Line IDs, the date of the latest session that had a MEP Rate, `acceptedZeroOpens`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar accepted with a zero open, and `rangeRepairs`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar whose range the adapter widened.

The snapshot SHALL also record `corporateActionWatch`: either `{ status: 'available', publishedFrom, publishedThrough, candidates }`, with the candidates from the corporate-action-watch module, or `{ status: 'unavailable', publishedFrom, publishedThrough, message }`. Version 4 differed from version 3 only by this field. Version 5 differs from version 4 only in each line's `corporateActions` records, which carry `correction`, `shareFactor` for a `volume` entry and its statuses, and in `insufficient-liquidity` entries, which also carry `corporateActions`. Version 6 differs from version 5 in three ways: it adds `priceUnit`; each `latestState` adds `priceRelativeToLongTermEmaInPercent`; and the Event type `volatility-expansion` becomes `volatile-session`, with its `expansionMultiple` field renamed `atrMultiple`. Version 7 differs from version 6 in two ways: each `latestState` adds `pendingRegimeTransition`, `lastConfirmedSwingHigh` and `lastConfirmedSwingLow`, and each available line adds `pesoEquivalents`.

`priceUnit` SHALL be `mep-dollar`: every price and every price-denominated measurement in the snapshot, such as an Event's `closePrice`, a swing's `price`, including a State's last confirmed swings, `trueRange` and `baselineAtr`, is in MEP dollars, because the run analyzes the Dollarized Series. It is recorded once, at the top level, and not repeated per value. Ratios, percentages and ATR multiples have no unit. `medianDailyTradedValueUsd` names its own unit and is unchanged. `pesoEquivalents` is the one block in pesos: its name states its unit, its `mepRate` is in pesos per MEP dollar, and `priceUnit` does not cover it.

#### Scenario: configuration version is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `analysisConfigurationVersion` equals `ANALYSIS_CONFIGURATION.version`

#### Scenario: price unit is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `priceUnit` is `mep-dollar`
- **AND** no Event or State value carries its own unit

#### Scenario: schema version is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `schemaVersion` is `7`

#### Scenario: the watch is recorded

- **WHEN** a run completes through 2026-09-30 and the feed has a stock-split notice for an analyzed CEDEAR
- **THEN** the snapshot's `corporateActionWatch` is available from 2026-09-24 through 2026-09-30 with that line's candidate

### Requirement: snapshots are persisted as a dated object and as latest

A successful run SHALL write the snapshot as JSON to the S3-compatible bucket used for Bar History under two keys:

- dated: `analysis-snapshots/v7/<requestedThroughSession>/<ranAt>.json`
- latest: `analysis-snapshots/v7/latest.json`

The `v7` in the key prefix SHALL equal the snapshot's `schemaVersion`, so a reader of one schema never finds another schema's object under the keys it reads. Objects written under an earlier prefix SHALL be left in place.

The dated object SHALL be written first. `latest` SHALL be written only after the dated object was written. A failed write SHALL fail the run with reason `snapshot-write-failed`. Each successful run SHALL replace `latest`.

#### Scenario: dated and latest objects

- **WHEN** a run for 2026-10-02 completes at 2026-10-04T15:00:00.000Z
- **THEN** the snapshot is written to `analysis-snapshots/v7/2026-10-02/2026-10-04T15:00:00.000Z.json` and to `analysis-snapshots/v7/latest.json`

#### Scenario: dated write fails

- **WHEN** writing the dated object fails
- **THEN** `latest` is not written and the run fails with reason `snapshot-write-failed`

### Requirement: the latest snapshot can be read with validation

The bucket-backed snapshot storage SHALL expose `readLatest`, which reads `analysis-snapshots/v7/latest.json` and returns it only after validating it. Validation SHALL cover the fields a reader uses: `schemaVersion` SHALL be `7`, `priceUnit` SHALL be `mep-dollar`, `ranAt` an ISO timestamp, `requestedThroughSession` a real `YYYY-MM-DD` date, and every entry of `analyzedLines` SHALL have string `instrumentId` and `tradingLineId` and one of these shapes:

- `status` `available`, with a `latestState` whose `regime`, `pendingRegimeTransition`, `structure`, `lastConfirmedSwingHigh`, `lastConfirmedSwingLow`, `rsi`, `priceRelativeToEmaInAtr` and `priceRelativeToLongTermEmaInPercent` are each `null` or a valid value, where a valid pending transition has a readable Regime `candidate`, `confirmations` of `1` or `2` and `requiredConfirmations` of `3`, and a valid last confirmed swing has the kind its part names, a numeric `price`, real occurrence and confirmation session dates and a numeric or `null` `priceRelativeToSwingInPercent`, `pesoEquivalents` with a `sessionDate` equal to `latestState.sessionDate`, a positive numeric `mepRate`, a numeric `close`, and a `lastConfirmedSwingHigh` and `lastConfirmedSwingLow` that are numbers exactly when the State's swing of that kind exists and `null` otherwise, and `events` whose entries each have a session date, a `coincidesWithLargeMove` boolean and an `event` that is a regime transition, structure break or volatile session with that type's fields;
- `status` `unavailable` with reason `insufficient-liquidity`, a `message`, and `liquidity` with a numeric `participation` and a numeric or `null` `medianDailyTradedValueUsd`;
- `status` `unavailable` with reason `fetch-failed`, `invalid-bars`, `no-provider-bars` or `no-dollarized-bars`, and a `message`.

Other fields SHALL be allowed and not returned.

`readLatest` SHALL NOT throw. It SHALL return a failure with reason `not-found` when the object does not exist, `read-failed` when the bucket read fails otherwise, and `invalid-snapshot` when the object is not JSON or fails validation.

#### Scenario: a v7 snapshot

- **WHEN** `latest.json` holds a v7 snapshot with one available and one unavailable line
- **THEN** `readLatest` returns its `ranAt`, `requestedThroughSession`, `priceUnit`, both lines' IDs and statuses, the available line's State and Events and the unavailable line's reason, message and liquidity

#### Scenario: a v6 snapshot

- **WHEN** `latest.json` holds a v6 snapshot, whose States have no pending transition or last confirmed swings
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: a v5 snapshot

- **WHEN** `latest.json` holds a snapshot with `schemaVersion` `5`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: another schema version

- **WHEN** `latest.json` holds a snapshot with `schemaVersion` `8`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: malformed data

- **WHEN** `latest.json` is not JSON, or a line has status `pending`, or `requestedThroughSession` is `2026-02-30`, or an available line has no `latestState`, or a `latestState` has no `pendingRegimeTransition`, or a pending transition has `confirmations` `3`, or a `lastConfirmedSwingHigh` has kind `low`, or an available line has no `pesoEquivalents`, or its `pesoEquivalents` describe another session, a swing the State does not have, or a non-positive `mepRate`, or an Event has an unknown type
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: no latest snapshot

- **WHEN** the bucket has no `latest.json`
- **THEN** `readLatest` fails with reason `not-found`
