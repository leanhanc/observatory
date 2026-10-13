## MODIFIED Requirements

### Requirement: run-level facts are recorded

The snapshot SHALL record `schemaVersion: 9`, `priceUnit`, `ranAt` as a UTC instant, `requestedThroughSession`, `analysisConfigurationVersion` equal to `ANALYSIS_CONFIGURATION.version`, and `mepRateSource` with both MEP rate source Trading Line IDs, the date of the latest session that had a MEP Rate, `acceptedZeroOpens`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar accepted with a zero open, and `rangeRepairs`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar whose range the adapter widened.

The snapshot SHALL also record `corporateActionWatch`: either `{ status: 'available', publishedFrom, publishedThrough, candidates }`, with the candidates from the corporate-action-watch module, or `{ status: 'unavailable', publishedFrom, publishedThrough, message }`. Version 4 differed from version 3 only by this field. Version 5 differs from version 4 only in each line's `corporateActions` records, which carry `correction`, `shareFactor` for a `volume` entry and its statuses, and in `insufficient-liquidity` entries, which also carry `corporateActions`. Version 6 differs from version 5 in three ways: it adds `priceUnit`; each `latestState` adds `priceRelativeToLongTermEmaInPercent`; and the Event type `volatility-expansion` becomes `volatile-session`, with its `expansionMultiple` field renamed `atrMultiple`. Version 7 differs from version 6 in two ways: each `latestState` adds `pendingRegimeTransition`, `lastConfirmedSwingHigh` and `lastConfirmedSwingLow`, and each available line adds `pesoEquivalents`. Version 8 differs from version 7 in three ways: each `latestState` adds `regimeTippingCloses` and `situations`, and a `closePosition` on each last confirmed swing; each available line adds `periodReturns`; and `pesoEquivalents` adds `regimeTippingCloses`. Version 9 differs from version 8 only in each Situation of `latestState.situations`, which adds `isBeyondNoiseBand`.

`priceUnit` SHALL be `mep-dollar`: every price and every price-denominated measurement in the snapshot, such as an Event's `closePrice`, a swing's `price`, including a State's last confirmed swings and a Situation's `level`, a State's Regime tipping closes, `trueRange` and `baselineAtr`, is in MEP dollars, because the run analyzes the Dollarized Series. It is recorded once, at the top level, and not repeated per value. Ratios, percentages and ATR multiples have no unit. `medianDailyTradedValueUsd` names its own unit and is unchanged. `pesoEquivalents` is the one block in pesos: its name states its unit, its `mepRate` is in pesos per MEP dollar, and `priceUnit` does not cover it.

#### Scenario: configuration version is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `analysisConfigurationVersion` equals `ANALYSIS_CONFIGURATION.version`

#### Scenario: price unit is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `priceUnit` is `mep-dollar`
- **AND** no Event or State value carries its own unit

#### Scenario: schema version is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `schemaVersion` is `9`

#### Scenario: the watch is recorded

- **WHEN** a run completes through 2026-09-30 and the feed has a stock-split notice for an analyzed CEDEAR
- **THEN** the snapshot's `corporateActionWatch` is available from 2026-09-24 through 2026-09-30 with that line's candidate

### Requirement: snapshots are persisted as a dated object and as latest

A successful run SHALL write the snapshot as JSON to the S3-compatible bucket used for Bar History under two keys:

- dated: `analysis-snapshots/v9/<requestedThroughSession>/<ranAt>.json`
- latest: `analysis-snapshots/v9/latest.json`

The `v9` in the key prefix SHALL equal the snapshot's `schemaVersion`, so a reader of one schema never finds another schema's object under the keys it reads. Objects written under an earlier prefix SHALL be left in place.

The dated object SHALL be written first. `latest` SHALL be written only after the dated object was written. A failed write SHALL fail the run with reason `snapshot-write-failed`. Each successful run SHALL replace `latest`.

#### Scenario: dated and latest objects

- **WHEN** a run for 2026-10-02 completes at 2026-10-04T15:00:00.000Z
- **THEN** the snapshot is written to `analysis-snapshots/v9/2026-10-02/2026-10-04T15:00:00.000Z.json` and to `analysis-snapshots/v9/latest.json`

#### Scenario: dated write fails

- **WHEN** writing the dated object fails
- **THEN** `latest` is not written and the run fails with reason `snapshot-write-failed`

### Requirement: the latest snapshot can be read with validation

The bucket-backed snapshot storage SHALL expose `readLatest`, which reads `analysis-snapshots/v9/latest.json` and returns it only after validating it. Validation SHALL cover the fields a reader uses: `schemaVersion` SHALL be `9`, `priceUnit` SHALL be `mep-dollar`, `ranAt` an ISO timestamp, `requestedThroughSession` a real `YYYY-MM-DD` date, and every entry of `analyzedLines` SHALL have string `instrumentId` and `tradingLineId` and one of these shapes:

- `status` `available`, with:
    - a `latestState` whose `regime`, `pendingRegimeTransition`, `regimeTippingCloses`, `structure`, `lastConfirmedSwingHigh`, `lastConfirmedSwingLow`, `rsi`, `priceRelativeToEmaInAtr` and `priceRelativeToLongTermEmaInPercent` are each `null` or a valid value, and whose `situations` is a list. A valid pending transition has a readable Regime `candidate`, `confirmations` of `1` or `2` and `requiredConfirmations` of `3`. Valid tipping closes have a numeric `bullish.closeAbove` and `bearish.closeBelow` and a boolean `isFastEmaAligned` on each side. A valid last confirmed swing has the kind its part names, a numeric `price`, real occurrence and confirmation session dates, a numeric or `null` `priceRelativeToSwingInPercent`, and a `closePosition` of `at-or-above` or `below` for the low and `at-or-below` or `above` for the high. A valid Situation has a known `type`, a real `activeSinceSession`, a `level` of the kind its type names and an `isBeyondNoiseBand` that is a boolean or `null`, and it SHALL agree with the State: `below-last-confirmed-low-in-bearish-regime` only with Regime `bearish` and a low whose `closePosition` is `below` and whose price and session dates equal the `level`, and the mirror for `above-last-confirmed-high-in-bullish-regime`;
    - `periodReturns`, each with a positive integer `windowMarketSessions` and a `fromSessionDate` and `percentChange` that are both `null` or both valid;
    - `pesoEquivalents` with a `sessionDate` equal to `latestState.sessionDate`, a positive numeric `mepRate`, a numeric `close`, a `lastConfirmedSwingHigh` and `lastConfirmedSwingLow` that are numbers exactly when the State's swing of that kind exists and `null` otherwise, and `regimeTippingCloses` with numeric `bullishCloseAbove` and `bearishCloseBelow` exactly when the State's tipping closes exist and `null` otherwise;
    - `events` whose entries each have a session date, a `coincidesWithLargeMove` boolean and an `event` that is a regime transition, structure break or volatile session with that type's fields;
- `status` `unavailable` with reason `insufficient-liquidity`, a `message`, and `liquidity` with a numeric `participation` and a numeric or `null` `medianDailyTradedValueUsd`;
- `status` `unavailable` with reason `fetch-failed`, `invalid-bars`, `no-provider-bars` or `no-dollarized-bars`, and a `message`.

Other fields SHALL be allowed and not returned.

`readLatest` SHALL NOT throw. It SHALL return a failure with reason `not-found` when the object does not exist, `read-failed` when the bucket read fails otherwise, and `invalid-snapshot` when the object is not JSON or fails validation.

#### Scenario: a v9 snapshot

- **WHEN** `latest.json` holds a v9 snapshot with one available and one unavailable line
- **THEN** `readLatest` returns its `ranAt`, `requestedThroughSession`, `priceUnit`, both lines' IDs and statuses, the available line's State, period returns and Events and the unavailable line's reason, message and liquidity

#### Scenario: a v8 snapshot

- **WHEN** `latest.json` holds a v8 snapshot, whose Situations have no `isBeyondNoiseBand`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: a v7 snapshot

- **WHEN** `latest.json` holds a v7 snapshot, whose States have no tipping closes or Situations
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: a v6 snapshot

- **WHEN** `latest.json` holds a v6 snapshot, whose States have no pending transition or last confirmed swings
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: a v5 snapshot

- **WHEN** `latest.json` holds a snapshot with `schemaVersion` `5`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: another schema version

- **WHEN** `latest.json` holds a snapshot with `schemaVersion` `10`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: malformed data

- **WHEN** `latest.json` is not JSON, or a line has status `pending`, or `requestedThroughSession` is `2026-02-30`, or an available line has no `latestState`, or a `latestState` has no `pendingRegimeTransition`, or a pending transition has `confirmations` `3`, or a `lastConfirmedSwingHigh` has kind `low`, or an available line has no `pesoEquivalents`, or its `pesoEquivalents` describe another session, a swing the State does not have, or a non-positive `mepRate`, or a `latestState` has no `situations`, or a last confirmed swing has no `closePosition`, or a Situation has an `isBeyondNoiseBand` that is neither a boolean nor `null`, or a Situation of type `below-last-confirmed-low-in-bearish-regime` is listed while Regime is `mixed` or while the low's `closePosition` is `at-or-above`, or an available line has no `periodReturns`, or a period return has a `fromSessionDate` but a `null` `percentChange`, or an Event has an unknown type
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: no latest snapshot

- **WHEN** the bucket has no `latest.json`
- **THEN** `readLatest` fails with reason `not-found`
