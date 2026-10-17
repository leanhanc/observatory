## MODIFIED Requirements

### Requirement: the latest snapshot can be read with validation

The bucket-backed snapshot storage SHALL expose `readLatest`, which reads `analysis-snapshots/v12/latest.json` and returns it only after validating it. Validation SHALL cover the fields a reader uses: `schemaVersion` SHALL be `12`, `priceUnit` SHALL be `mep-dollar`, `ranAt` an ISO timestamp, `requestedThroughSession` a real `YYYY-MM-DD` date, `cclRateSource` either `null` or string `pesoBondTradingLineId` and `cableBondTradingLineId` with a real `latestRateSessionDate`, and every entry of `analyzedLines` SHALL have string `instrumentId` and `tradingLineId` and one of these shapes:

- `status` `available`, with:
    - a `latestState` whose `regime`, `pendingRegimeTransition`, `regimeTippingCloses`, `structure`, `lastConfirmedSwingHigh`, `lastConfirmedSwingLow`, `rsi`, `priceRelativeToEmaInAtr` and `priceRelativeToLongTermEmaInPercent` are each `null` or a valid value, and whose `situations` is a list. A valid pending transition has a readable Regime `candidate`, `confirmations` of `1` or `2` and `requiredConfirmations` of `3`. Valid tipping closes have a numeric `bullish.closeAbove` and `bearish.closeBelow` and a boolean `isFastEmaAligned` on each side. A valid last confirmed swing has the kind its part names, a numeric `price`, real occurrence and confirmation session dates, a numeric or `null` `priceRelativeToSwingInPercent`, and a `closePosition` of `at-or-above` or `below` for the low and `at-or-below` or `above` for the high. A valid Situation has a known `type`, a real `activeSinceSession`, a `level` of the kind its type names and an `isBeyondNoiseBand` that is a boolean or `null`, and it SHALL agree with the State: `below-last-confirmed-low-in-bearish-regime` only with Regime `bearish` and a low whose `closePosition` is `below` and whose price and session dates equal the `level`, and the mirror for `above-last-confirmed-high-in-bullish-regime`;
    - `periodReturns`, `pesoPeriodReturns` and `cclPeriodReturns`, each entry with a positive integer `windowMonths` and a `fromSessionDate` and `percentChange` that are both `null` or both valid. The three lists SHALL share their sessions, as the run counts every currency's windows over the sessions of the Dollarized Series: the same `windowMonths` in the same order, a `pesoPeriodReturns` `fromSessionDate` equal to the `periodReturns` one, and a `cclPeriodReturns` `fromSessionDate` equal to it or `null`, for a start or anchor session without a CCL Rate;
    - `pesoEquivalents` with a `sessionDate` equal to `latestState.sessionDate`, a positive numeric `mepRate`, a numeric `close`, a `lastConfirmedSwingHigh` and `lastConfirmedSwingLow` that are numbers exactly when the State's swing of that kind exists and `null` otherwise, and `regimeTippingCloses` with numeric `bullishCloseAbove` and `bearishCloseBelow` exactly when the State's tipping closes exist and `null` otherwise;
    - `cclEquivalents` that is `null` or has the shape of `pesoEquivalents` with a positive numeric `cclRate` in place of `mepRate`, under the same rules: its session is `latestState.sessionDate`, and each level is a number exactly when the State has it;
    - `latestClose` whose `sessionDate` equals `latestState.sessionDate`, whose `previousSessionDate` is a real date before it or `null`, whose `peso` and `mep` parts and whose `ccl` part, `null` exactly when `cclEquivalents` is `null`, each have a numeric `close` and a `previousClose`, `change` and `percentChange` that are all numbers or all `null`. The `peso` close SHALL equal `pesoEquivalents.close`, and the `ccl` close, when present, `cclEquivalents.close`: each is the same session's close in the same currency;
    - `events` whose entries each have a session date, a `coincidesWithLargeMove` boolean and an `event` that is a regime transition, structure break or volatile session with that type's fields; a structure break's fields include `pesoEquivalents` with a positive numeric `mepRate` and a numeric `closePrice` and `definingSwingPrice`, none of them `null`, and `cclEquivalents` that is `null` or has a positive numeric `cclRate` and a numeric `closePrice` and `definingSwingPrice`;
- `status` `unavailable` with reason `insufficient-liquidity`, a `message`, and `liquidity` with a numeric `participation` and a numeric or `null` `medianDailyTradedValueUsd`;
- `status` `unavailable` with reason `fetch-failed`, `invalid-bars`, `no-provider-bars` or `no-dollarized-bars`, and a `message`.

When `cclRateSource` is `null`, the run had no CCL Rate, so every CCL figure SHALL be `null`: each available line's `cclEquivalents` and `latestClose.ccl`, every `cclPeriodReturns` entry's `fromSessionDate` and `percentChange`, and every Structure Break's `cclEquivalents`.

These checks compare figures the run writes from one computation, so a snapshot that fails one was not written by a run. They tighten the read without changing the shape, so `schemaVersion` stays `12`.

Other fields SHALL be allowed and not returned.

`readLatest` SHALL NOT throw. It SHALL return a failure with reason `not-found` when the object does not exist, `read-failed` when the bucket read fails otherwise, and `invalid-snapshot` when the object is not JSON or fails validation.

#### Scenario: a v12 snapshot

- **WHEN** `latest.json` holds a v12 snapshot with one available and one unavailable line
- **THEN** `readLatest` returns its `ranAt`, `cclRateSource`, `requestedThroughSession`, `priceUnit`, both lines' IDs and statuses, the available line's State, latest close, period returns in the three currencies, peso and CCL equivalents and Events, and the unavailable line's reason, message and liquidity

#### Scenario: a snapshot a run writes

- **WHEN** `latest.json` holds the snapshot an Analysis Run writes, with CCL Rates or without them
- **THEN** `readLatest` returns it

#### Scenario: a v11 snapshot without CCL Rates

- **WHEN** `latest.json` holds a v12 snapshot whose `cclRateSource` is `null`, whose lines' and Structure Breaks' `cclEquivalents` are `null`, and whose lines' `latestClose.ccl` is `null`
- **THEN** `readLatest` returns it with those `null` values

#### Scenario: a v11 snapshot

- **WHEN** `latest.json` holds a v11 snapshot, whose lines have no `latestClose`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: a v10 snapshot

- **WHEN** `latest.json` holds a v10 snapshot, whose lines have no `pesoPeriodReturns`, `cclPeriodReturns` or `cclEquivalents`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: a v9 snapshot

- **WHEN** `latest.json` holds a v9 snapshot, whose Structure Breaks have no `pesoEquivalents`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: a v8 snapshot

- **WHEN** `latest.json` holds a v8 snapshot, whose Situations have no `isBeyondNoiseBand` and whose period returns have `windowMarketSessions`
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

- **WHEN** `latest.json` holds a snapshot with `schemaVersion` `13`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: malformed data

- **WHEN** `latest.json` is not JSON, or a line has status `pending`, or `requestedThroughSession` is `2026-02-30`, or an available line has no `latestState`, or a `latestState` has no `pendingRegimeTransition`, or a pending transition has `confirmations` `3`, or a `lastConfirmedSwingHigh` has kind `low`, or an available line has no `pesoEquivalents`, or its `pesoEquivalents` describe another session, a swing the State does not have, or a non-positive `mepRate`, or a `latestState` has no `situations`, or a last confirmed swing has no `closePosition`, or a Situation has an `isBeyondNoiseBand` that is neither a boolean nor `null`, or a Situation of type `below-last-confirmed-low-in-bearish-regime` is listed while Regime is `mixed` or while the low's `closePosition` is `at-or-above`, or an available line has no `periodReturns`, or a period return has a `fromSessionDate` but a `null` `percentChange`, or an Event has an unknown type, or a Structure Break has no `pesoEquivalents` or a `null` or non-positive `mepRate`, or an available line has no `cclEquivalents` field, or its `cclEquivalents` describe another session, a swing the State does not have, or a non-positive `cclRate`, or a Structure Break has no `cclEquivalents` field or a non-positive `cclRate`, or an available line has no `pesoPeriodReturns` or `cclPeriodReturns`, or an available line has no `latestClose`, or its `latestClose` describes another session, or has a `ccl` part while `cclEquivalents` is `null` or none while it is not, or a part with a `previousClose` but a `null` `change`, or its `latestClose` has a previous session that is not before its session, or a `peso` close other than `pesoEquivalents.close`, or a `ccl` close other than `cclEquivalents.close`, or a `pesoPeriodReturns` or `cclPeriodReturns` entry starts on another session than the `periodReturns` entry of its window, or `cclRateSource` is neither `null` nor a valid source
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: CCL figures without a CCL Rate

- **WHEN** `latest.json` holds a snapshot whose `cclRateSource` is `null` and one of whose lines has `cclEquivalents`, a `latestClose.ccl`, a `cclPeriodReturns` entry with a start session, or a Structure Break with `cclEquivalents`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: no latest snapshot

- **WHEN** the bucket has no `latest.json`
- **THEN** `readLatest` fails with reason `not-found`

### Requirement: the snapshot holds the latest close and its day change in each currency

Each available line SHALL carry `latestClose`, the latest State's close in pesos, MEP dollars and CCL dollars and its change since the line's previous session in each: `{ sessionDate, previousSessionDate, peso, mep, ccl }`.

- `sessionDate` SHALL equal `latestState.sessionDate`.
- `previousSessionDate` SHALL be the session of the line's last corrected peso bar before `sessionDate`, or `null` when there is none. It is the line's previous trading session, whether or not it had a MEP or CCL Rate: the day change compares with the close the reader saw before, so no session is skipped to find a rate. When the provider's bar for the session before was dropped as invalid, and is listed in `droppedBarSessions`, the previous corrected peso bar is an earlier one, and the day change spans two sessions; `previousSessionDate` records which.
- Each part SHALL be `{ close, previousClose, change, percentChange }`. `change` SHALL be `close − previousClose` and `percentChange` SHALL be `change / previousClose × 100`, both unrounded.
- `peso`: `close` SHALL be the corrected peso close of `sessionDate`, and `previousClose` that of `previousSessionDate`. Both are market facts.
- `mep`: `close` SHALL be the dollarized close of `sessionDate`, and `previousClose` the corrected peso close of `previousSessionDate` divided by that session's own MEP Rate with `dollarizePrice`.
- `ccl`: `close` SHALL be the corrected peso close of `sessionDate` divided by its CCL Rate with `toCclEquivalent`, and `previousClose` the previous peso close divided by `previousSessionDate`'s own CCL Rate. The whole part SHALL be `null` when `sessionDate` has no CCL Rate, as `cclEquivalents` is.

Each previous close SHALL use only its own session's rate. When `previousSessionDate` is `null`, or has no rate in a part's currency, that part's `previousClose`, `change` and `percentChange` SHALL be `null`, and its `close` SHALL remain. The run SHALL NOT convert the previous peso close with `sessionDate`'s rate, carry an earlier session's rate into it, or substitute `0`.

A peso day change includes the peso's move against the dollar between the two sessions; a MEP-dollar or CCL-dollar day change removes it with each session's own rate.

#### Scenario: a day change in three currencies

- **WHEN** a line closed at 5880 pesos on 2026-10-13, with a MEP Rate of 1470 and a CCL Rate of 1540, and at 5940 pesos on 2026-10-14, with a MEP Rate of 1485 and a CCL Rate of 1560
- **THEN** `latestClose.peso` is `{ close: 5940, previousClose: 5880, change: 60, percentChange: 1.0204… }`
- **AND** `latestClose.mep` is `{ close: 4, previousClose: 4, change: 0, percentChange: 0 }`
- **AND** `latestClose.ccl` is `{ close: 5940 / 1560, previousClose: 5880 / 1540, … }`, a fall of about 0.29 %
- **AND** neither previous close is converted with 2026-10-14's rate, which would make the MEP change 1.02 %

#### Scenario: the previous session has no MEP Rate

- **WHEN** the line traded on 2026-10-13, a session without a MEP Rate, and on 2026-10-14, and 2026-10-10 has a MEP Rate
- **THEN** `previousSessionDate` is 2026-10-13, `latestClose.peso` has its change, and `latestClose.mep` has `close` and `null` `previousClose`, `change` and `percentChange`
- **AND** 2026-10-10's close and rate are not used

#### Scenario: the previous session has no CCL Rate

- **WHEN** AL30C did not trade on the line's previous session, and did on its latest session
- **THEN** `latestClose.ccl` has its `close` and `null` `previousClose`, `change` and `percentChange`
- **AND** the CCL Rate of an earlier session is not used

#### Scenario: the latest session has no CCL Rate

- **WHEN** the latest State's session has no CCL Rate
- **THEN** `latestClose.ccl` is `null`, as `cclEquivalents` is

#### Scenario: the provider's previous bar was dropped

- **WHEN** a line's provider bar for 2026-10-13 was dropped as invalid, and the line has bars on 2026-10-10 and 2026-10-14
- **THEN** `previousSessionDate` is 2026-10-10, and each part's change is since 2026-10-10's close at 2026-10-10's rates

#### Scenario: a first session

- **WHEN** a line has no corrected peso bar before the latest State's session
- **THEN** `previousSessionDate` is `null` and every part has `null` `previousClose`, `change` and `percentChange`
