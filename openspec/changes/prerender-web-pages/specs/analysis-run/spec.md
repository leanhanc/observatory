## MODIFIED Requirements

### Requirement: the latest snapshot can be read with validation

The bucket-backed snapshot storage SHALL expose `readLatest`, which reads `analysis-snapshots/v5/latest.json` and returns it only after validating it. Validation SHALL cover the fields a reader uses: `schemaVersion` SHALL be `5`, `ranAt` an ISO timestamp, `requestedThroughSession` a real `YYYY-MM-DD` date, and every entry of `analyzedLines` SHALL have string `instrumentId` and `tradingLineId` and one of these shapes:

- `status` `available`, with a `latestState` whose `regime`, `structure`, `rsi` and `priceRelativeToEmaInAtr` are each `null` or a valid value, and `events` whose entries each have a session date, a `coincidesWithLargeMove` boolean and an `event` that is a regime transition, structure break or volatility expansion with that type's fields;
- `status` `unavailable` with reason `insufficient-liquidity`, a `message`, and `liquidity` with a numeric `participation` and a numeric or `null` `medianDailyTradedValueUsd`;
- `status` `unavailable` with reason `fetch-failed`, `invalid-bars`, `no-provider-bars` or `no-dollarized-bars`, and a `message`.

Other fields SHALL be allowed and not returned.

`readLatest` SHALL NOT throw. It SHALL return a failure with reason `not-found` when the object does not exist, `read-failed` when the bucket read fails otherwise, and `invalid-snapshot` when the object is not JSON or fails validation.

#### Scenario: a v5 snapshot

- **WHEN** `latest.json` holds a v5 snapshot with one available and one unavailable line
- **THEN** `readLatest` returns its `ranAt`, `requestedThroughSession`, both lines' IDs and statuses, the available line's State and Events and the unavailable line's reason, message and liquidity

#### Scenario: another schema version

- **WHEN** `latest.json` holds a snapshot with `schemaVersion` `4`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: malformed data

- **WHEN** `latest.json` is not JSON, or a line has status `pending`, or `requestedThroughSession` is `2026-02-30`, or an available line has no `latestState`, or an Event has an unknown type
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: no latest snapshot

- **WHEN** the bucket has no `latest.json`
- **THEN** `readLatest` fails with reason `not-found`
