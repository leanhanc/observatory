## ADDED Requirements

### Requirement: the snapshot holds each line's chart series

Each available line SHALL carry `chartSeries: { peso, mep, ccl }`, the line's Chart Series from `buildChartSeries` over its corrected peso bars, the run's MEP and CCL Rates, and `latestState.sessionDate`. Each candle SHALL be serialized as the object `{ sessionDate, open, high, low, close }`, with each price rounded to 6 significant digits. The rounding is for display: no reader compares a candle with another figure of the snapshot. An unavailable line SHALL have no `chartSeries`.

A run without CCL Rates SHALL write every `chartSeries.ccl` as an empty list. No Chart Series SHALL change any other field of the snapshot.

#### Scenario: an available line's series

- **WHEN** GGAL is available with its latest State on 2026-10-13
- **THEN** its `chartSeries.peso` and `chartSeries.mep` end with a candle for 2026-10-13
- **AND** a candle is `{ sessionDate: "2026-10-13", open: 5880, high: 6000, low: 5800, close: 5940 }` in `peso`

#### Scenario: rounding

- **WHEN** a candle's MEP close is 3.857312345
- **THEN** it is serialized as 3.85731

#### Scenario: an unavailable line

- **WHEN** a line is unavailable for insufficient liquidity
- **THEN** its entry has no `chartSeries`

### Requirement: the snapshot holds how far the close is from each watch level

Each available line SHALL carry `watchDistances: { lastConfirmedSwingHigh, lastConfirmedSwingLow, bullishCloseAbove, bearishCloseBelow }`. Each SHALL be `(level − close) / close × 100` for the latest State's close and its last confirmed swing of that kind or its Regime tipping close on that side, in MEP dollars, unrounded: the move from the close, in percent of the close, that would reach the level. It is positive for a level above the close and negative for one below. It SHALL be `null` when the level is `null`, when the close is zero, or when the result is not finite, and SHALL NOT be `0` while unavailable.

Every currency converts the close and its levels with one session's rate, so the distance is the same in pesos, MEP dollars and CCL dollars. It differs from a swing's `priceRelativeToSwingInPercent`, which is the close's distance in percent of the level: a resistance 4.6 % above the close in the swing's terms is 4.8 % away from the close in these.

#### Scenario: distances to the levels

- **WHEN** the latest close is 4 MEP dollars, the last confirmed swing high is 4.2, there is no confirmed swing low, and the tipping closes are above 4.8 and below 4.4
- **THEN** `watchDistances` is `{ lastConfirmedSwingHigh: 5, lastConfirmedSwingLow: null, bullishCloseAbove: 20, bearishCloseBelow: 10 }`, within floating-point error

#### Scenario: no tipping closes yet

- **WHEN** the State's `regimeTippingCloses` is `null`
- **THEN** `bullishCloseAbove` and `bearishCloseBelow` are `null`

## MODIFIED Requirements

### Requirement: the snapshot holds the latest State and every Event

The snapshot SHALL hold one entry per analyzed Trading Line in `analyzedLines`. For each analyzed Trading Line that could be analyzed and is liquidity-eligible, the entry SHALL have `status: 'available'`, `instrumentId`, `tradingLineId`, and:

- `latestState`: the Instrument State of the last session of the Dollarized Series. Its `sessionDate` MAY be earlier than the Requested-Through Session when the line did not trade, or had no MEP Rate, on later sessions.
- `events`: every Event detected in the analyzed window, each as `{ sessionDate, event, coincidesWithLargeMove }`, where `event.type` is the Event kind (`regime-transition`, `structure-break` or `volatile-session`). Events SHALL be ordered by `sessionDate`; Events of the same session SHALL follow that kind order. A `structure-break` Event SHALL also carry `pesoEquivalents`, its prices in pesos at its own session's MEP Rate: `{ mepRate, closePrice, definingSwingPrice }`. `mepRate` SHALL be the MEP Rate of the Event's session, the one that dollarized its bar; `closePrice` SHALL be the line's corrected peso close on that session, a market fact; and `definingSwingPrice` SHALL be the defining swing's price converted with `toPesoEquivalent` at that `mepRate`. It SHALL also carry `cclEquivalents`, the same prices in CCL dollars at its own session's CCL Rate: `{ cclRate, closePrice, definingSwingPrice }`, where `cclRate` SHALL be the CCL Rate of the Event's session, `closePrice` SHALL be the corrected peso close divided by it with `toCclEquivalent`, and `definingSwingPrice` SHALL be the peso `definingSwingPrice` divided by it; or `null` when the Event's session has no CCL Rate. The other Event kinds carry no prices, no `pesoEquivalents` and no `cclEquivalents`: a Regime Transition names Regimes and sessions, and a Volatile Session's `trueRange` and `baselineAtr` are compared only as their ratio, `atrMultiple`, which has no currency.
- `largeMoves`: the Large One-Session Moves in the analyzed window.
- `corporateActions`: the line's Corporate Actions and whether each was applied.
- `window`: the first and last session dates and the bar count of the Dollarized Series that was analyzed.
- `sessionsWithoutMepRate`: the peso-line sessions that had no MEP Rate and therefore no dollarized bar.
- `rangeRepairSessions`: the peso-line sessions whose range the adapter widened.
- `droppedBarSessions`: the peso-line sessions whose invalid bar was dropped.
- `periodReturns`: the line's period returns as of `latestState.sessionDate`, from `calculatePeriodReturns` over the Dollarized Series, one per configured window in configuration order. They are in MEP dollars.
- `pesoPeriodReturns`: the same windows in pesos, from `calculatePeriodReturns` over the corrected peso close of each session of the Dollarized Series. A peso return includes the peso's devaluation: it is what a holder of the peso line got.
- `cclPeriodReturns`: the same windows in CCL dollars, from `calculatePeriodReturns` over each session of the Dollarized Series whose close is its corrected peso close divided by that session's CCL Rate with `toCclEquivalent`, and `null` when that session has no CCL Rate.
- `pesoEquivalents`: the latest State's session in pesos, for a reader who trades the peso line: `{ sessionDate, mepRate, close, lastConfirmedSwingHigh, lastConfirmedSwingLow, regimeTippingCloses, longTermEma }`. `sessionDate` SHALL equal `latestState.sessionDate`, `mepRate` SHALL be that session's MEP Rate, the one that dollarized its bar, and `close` SHALL be the line's corrected peso close on that session, a market fact. Each swing SHALL be the price of the State's last confirmed swing of that kind converted with `toPesoEquivalent` at that `mepRate`, or `null` when the State's swing is `null`. `regimeTippingCloses` SHALL be `{ bullishCloseAbove, bearishCloseBelow }`, the State's two tipping closes converted the same way, or `null` when the State's `regimeTippingCloses` is `null`. `longTermEma` SHALL be the State's `longTermEma` converted the same way, or `null` when it is `null`. Because the close and the levels share one rate, the close's distance from each level in percent is the same in pesos as in MEP dollars.
- `cclEquivalents`: the latest State's session in CCL dollars, `{ sessionDate, cclRate, close, lastConfirmedSwingHigh, lastConfirmedSwingLow, regimeTippingCloses, longTermEma }`, or `null` when that session has no CCL Rate, including every line of a run without CCL Rates. `sessionDate` SHALL equal `latestState.sessionDate` and `cclRate` SHALL be that session's CCL Rate. `close`, every level and `longTermEma` SHALL be the matching `pesoEquivalents` value divided by `cclRate` with `toCclEquivalent`, with `null` where the peso value is `null`. One session's MEP Rate and CCL Rate convert every value, so the close's distance from each level in percent is the same in CCL dollars as in MEP dollars and pesos.

An Event is detected on a bar of the Dollarized Series, and a session has a dollarized bar only when it has both a peso bar and a MEP Rate, so an Event's session always has both. An Event's `pesoEquivalents` SHALL therefore never be `null`, and the run SHALL NOT substitute another session's rate or `0`. An Event's peso prices use its own session's rate, not the latest State's: its close is then the peso close the line actually had, and the close and the crossed swing share one rate, so a close below the swing in MEP dollars is also below it in pesos. The same swing MAY therefore have a different peso price in an Event than in the latest State's `pesoEquivalents`.

A CCL figure SHALL use only the CCL Rate of the session it describes. A session can have a dollarized bar and no CCL Rate, when the cable bond did not trade or the CCL rate source was unavailable. The run SHALL NOT substitute another session's CCL Rate, the MEP Rate or `0`: the CCL figure of such a session is `null`, an Event's `cclEquivalents` included, and a period return whose start or anchor session has none is unavailable.

All three return lists share the sessions of the Dollarized Series, so a window starts and ends on the same sessions in every currency and the returns differ only by the currency's own movement. The CCL Rate never enters the Dollarized Series, the Instrument State, the Events, `periodReturns` or `watchDistances`: with or without CCL Rates, every other field of the snapshot is the same.

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

- **WHEN** a line's last session closed at 5790 pesos with a MEP Rate of 1500, its State's last confirmed swing high is 4 MEP dollars, it has no confirmed swing low, and its Regime tipping closes are above 4.2 and below 3.8 MEP dollars
- **AND** its State's `longTermEma` is 4 MEP dollars
- **THEN** `pesoEquivalents` is `{ sessionDate, mepRate: 1500, close: 5790, lastConfirmedSwingHigh: 6000, lastConfirmedSwingLow: null, regimeTippingCloses: { bullishCloseAbove: 6300, bearishCloseBelow: 5700 }, longTermEma: 6000 }` with the State's session date

#### Scenario: a Structure Break's prices at its own session's rate

- **WHEN** a line closed at 5215 pesos on 2026-09-18 with a MEP Rate of 1500, which dollarizes to 3.4766…, below its last confirmed swing low of 3.5 MEP dollars, so a downward Structure Break is detected on 2026-09-18, and the line's last session, 2026-10-13, has a MEP Rate of 1600
- **THEN** the Structure Break's `pesoEquivalents` is `{ mepRate: 1500, closePrice: 5215, definingSwingPrice: 5250 }`
- **AND** not the swing at the last session's rate, 5600, nor the close at it, 5562.6…
- **AND** the line's `pesoEquivalents` keeps the last session's rate, 1600

#### Scenario: Events without prices

- **WHEN** a line has a Regime Transition and a Volatile Session
- **THEN** neither Event has `pesoEquivalents` or `cclEquivalents`

#### Scenario: CCL equivalents of the watch levels

- **WHEN** a line's last session closed at 5790 pesos with a MEP Rate of 1500 and a CCL Rate of 1600, and its State's last confirmed swing high is 4 MEP dollars, with no confirmed swing low and tipping closes above 4.2 and below 3.8 MEP dollars
- **AND** its State's `longTermEma` is 4 MEP dollars
- **THEN** `cclEquivalents` is `{ sessionDate, cclRate: 1600, close: 3.61875, lastConfirmedSwingHigh: 3.75, lastConfirmedSwingLow: null, regimeTippingCloses: { bullishCloseAbove: 3.9375, bearishCloseBelow: 3.5625 }, longTermEma: 3.75 }` with the State's session date

#### Scenario: the latest session has no CCL Rate

- **WHEN** a line's last session has a MEP Rate, AL30C did not trade that session, and the session before has a CCL Rate
- **THEN** the line's `cclEquivalents` is `null`
- **AND** the previous session's CCL Rate is not used

#### Scenario: a Structure Break's CCL prices at its own session's rate

- **WHEN** the downward Structure Break of 2026-09-18 closed at 5215 pesos with a MEP Rate of 1500 and a CCL Rate of 1560, against a swing low of 3.5 MEP dollars, and the line's last session has a CCL Rate of 1650
- **THEN** the Structure Break's `cclEquivalents` is `{ cclRate: 1560, closePrice: 5215 / 1560, definingSwingPrice: 5250 / 1560 }`

#### Scenario: a Structure Break on a session without a CCL Rate

- **WHEN** a Structure Break's session has a MEP Rate and no CCL Rate, and the sessions before and after it have CCL Rates
- **THEN** its `cclEquivalents` is `null` and its `pesoEquivalents` are unchanged

#### Scenario: period returns in three currencies

- **WHEN** a line closed at 1000 pesos on 2026-09-09, with a MEP Rate of 1000 and a CCL Rate of 1050, and at 1210 pesos on 2026-10-09, with a MEP Rate of 1100 and a CCL Rate of 1160
- **THEN** the one-month `pesoPeriodReturns` change is 21 %, `periodReturns` 10 % and `cclPeriodReturns` (1210 / 1160 − 1000 / 1050) / (1000 / 1050) × 100, about 9.5 %
- **AND** all three start from 2026-09-09

#### Scenario: a return endpoint without a CCL Rate

- **WHEN** the one-month window starts on 2026-09-09, which has a dollarized bar and no CCL Rate, and 2026-09-08 has both
- **THEN** the one-month `cclPeriodReturns` entry has `fromSessionDate` and `percentChange` `null`
- **AND** the one-month `periodReturns` and `pesoPeriodReturns` entries start from 2026-09-09

#### Scenario: a run without CCL Rates

- **WHEN** AL30C fails to fetch
- **THEN** every available line's `cclEquivalents` is `null`, every Structure Break's `cclEquivalents` is `null` and every `cclPeriodReturns` entry is unavailable

#### Scenario: CCL Rates leave the MEP analysis unchanged

- **WHEN** the same provider data is analyzed once with AL30C failing and once with it trading
- **THEN** the two snapshots are equal once `cclRateSource`, `cclEquivalents` (the lines' and the Events'), `cclPeriodReturns` and each line's `chartSeries.ccl` are removed

#### Scenario: period returns are anchored at the latest State

- **WHEN** a line's last dollarized bar is on 2026-10-08 and the run's Requested-Through Session is 2026-10-09
- **THEN** its `periodReturns` are measured as of 2026-10-08, counting calendar months back from 2026-10-08

### Requirement: snapshots are persisted as a dated object and as latest

A successful run SHALL write the snapshot as JSON to the S3-compatible bucket used for Bar History under two keys:

- dated: `analysis-snapshots/v13/<requestedThroughSession>/<ranAt>.json`
- latest: `analysis-snapshots/v13/latest.json`

The `v13` in the key prefix SHALL equal the snapshot's `schemaVersion`, so a reader of one schema never finds another schema's object under the keys it reads. Objects written under an earlier prefix SHALL be left in place.

The dated object SHALL be written first. `latest` SHALL be written only after the dated object was written. A failed write SHALL fail the run with reason `snapshot-write-failed`. Each successful run SHALL replace `latest`.

#### Scenario: dated and latest objects

- **WHEN** a run for 2026-10-02 completes at 2026-10-04T15:00:00.000Z
- **THEN** the snapshot is written to `analysis-snapshots/v13/2026-10-02/2026-10-04T15:00:00.000Z.json` and to `analysis-snapshots/v13/latest.json`

#### Scenario: dated write fails

- **WHEN** writing the dated object fails
- **THEN** `latest` is not written and the run fails with reason `snapshot-write-failed`

### Requirement: the latest snapshot can be read with validation

The bucket-backed snapshot storage SHALL expose `readLatest`, which reads `analysis-snapshots/v13/latest.json` and returns it only after validating it. Validation SHALL cover the fields a reader uses: `schemaVersion` SHALL be `13`, `priceUnit` SHALL be `mep-dollar`, `ranAt` an ISO timestamp, `requestedThroughSession` a real `YYYY-MM-DD` date, `cclRateSource` either `null` or string `pesoBondTradingLineId` and `cableBondTradingLineId` with a real `latestRateSessionDate`, and every entry of `analyzedLines` SHALL have string `instrumentId` and `tradingLineId` and one of these shapes:

- `status` `available`, with:
    - a `latestState` whose `regime`, `pendingRegimeTransition`, `regimeTippingCloses`, `structure`, `lastConfirmedSwingHigh`, `lastConfirmedSwingLow`, `rsi`, `priceRelativeToEmaInAtr`, `priceRelativeToLongTermEmaInPercent` and `longTermEma` are each `null` or a valid value, with `longTermEma` `null` exactly when `priceRelativeToLongTermEmaInPercent` is,, and whose `situations` is a list. A valid pending transition has a readable Regime `candidate`, `confirmations` of `1` or `2` and `requiredConfirmations` of `3`. Valid tipping closes have a numeric `bullish.closeAbove` and `bearish.closeBelow` and a boolean `isFastEmaAligned` on each side. A valid last confirmed swing has the kind its part names, a numeric `price`, real occurrence and confirmation session dates, a numeric or `null` `priceRelativeToSwingInPercent`, and a `closePosition` of `at-or-above` or `below` for the low and `at-or-below` or `above` for the high. A valid Situation has a known `type`, a real `activeSinceSession`, a `level` of the kind its type names and an `isBeyondNoiseBand` that is a boolean or `null`, and it SHALL agree with the State: `below-last-confirmed-low-in-bearish-regime` only with Regime `bearish` and a low whose `closePosition` is `below` and whose price and session dates equal the `level`, and the mirror for `above-last-confirmed-high-in-bullish-regime`;
    - `periodReturns`, `pesoPeriodReturns` and `cclPeriodReturns`, each entry with a positive integer `windowMonths` and a `fromSessionDate` and `percentChange` that are both `null` or both valid. The three lists SHALL share their sessions, as the run counts every currency's windows over the sessions of the Dollarized Series: the same `windowMonths` in the same order, a `pesoPeriodReturns` `fromSessionDate` equal to the `periodReturns` one, and a `cclPeriodReturns` `fromSessionDate` equal to it or `null`, for a start or anchor session without a CCL Rate;
    - `pesoEquivalents` with a `sessionDate` equal to `latestState.sessionDate`, a positive numeric `mepRate`, a numeric `close`, a `lastConfirmedSwingHigh` and `lastConfirmedSwingLow` that are numbers exactly when the State's swing of that kind exists and `null` otherwise, `regimeTippingCloses` with numeric `bullishCloseAbove` and `bearishCloseBelow` exactly when the State's tipping closes exist and `null` otherwise, and a `longTermEma` that is a number exactly when the State's is;
    - `cclEquivalents` that is `null` or has the shape of `pesoEquivalents` with a positive numeric `cclRate` in place of `mepRate`, under the same rules: its session is `latestState.sessionDate`, and each level is a number exactly when the State has it;
    - `latestClose` whose `sessionDate` equals `latestState.sessionDate`, whose `previousSessionDate` is a real date before it or `null`, whose `peso` and `mep` parts and whose `ccl` part, `null` exactly when `cclEquivalents` is `null`, each have a numeric `close` and a `previousClose`, `change` and `percentChange` that are all numbers or all `null`. The `peso` close SHALL equal `pesoEquivalents.close`, and the `ccl` close, when present, `cclEquivalents.close`: each is the same session's close in the same currency;
    - `watchDistances` with `lastConfirmedSwingHigh`, `lastConfirmedSwingLow`, `bullishCloseAbove` and `bearishCloseBelow`, each a number exactly when the State has that swing or its tipping closes, and `null` otherwise;
    - `chartSeries` with `peso`, `mep` and `ccl` lists of candles `{ sessionDate, open, high, low, close }`, each with a real `sessionDate` and positive numeric prices, and no other field, whose high is at least its open, close and low and whose low is at most its open and close. Each list SHALL be in strictly ascending session order. `peso` and `mep` SHALL end on `latestState.sessionDate`, and `ccl` SHALL end on it exactly when `cclEquivalents` is not `null` and SHALL NOT go past it. Every `mep` session SHALL be a `peso` session;
    - `events` whose entries each have a session date, a `coincidesWithLargeMove` boolean and an `event` that is a regime transition, structure break or volatile session with that type's fields; a structure break's fields include `pesoEquivalents` with a positive numeric `mepRate` and a numeric `closePrice` and `definingSwingPrice`, none of them `null`, and `cclEquivalents` that is `null` or has a positive numeric `cclRate` and a numeric `closePrice` and `definingSwingPrice`;
- `status` `unavailable` with reason `insufficient-liquidity`, a `message`, and `liquidity` with a numeric `participation` and a numeric or `null` `medianDailyTradedValueUsd`;
- `status` `unavailable` with reason `fetch-failed`, `invalid-bars`, `no-provider-bars` or `no-dollarized-bars`, and a `message`.

When `cclRateSource` is `null`, the run had no CCL Rate, so every CCL figure SHALL be `null`: each available line's `cclEquivalents` and `latestClose.ccl`, every `cclPeriodReturns` entry's `fromSessionDate` and `percentChange`, every Structure Break's `cclEquivalents`, and each line's `chartSeries.ccl`, which SHALL be empty.

These checks compare figures the run writes from one computation, so a snapshot that fails one was not written by a run. Schema 13 adds `longTermEma`, `watchDistances` and `chartSeries`, so a v12 snapshot fails the read.

Other fields SHALL be allowed and not returned.

`readLatest` SHALL NOT throw. It SHALL return a failure with reason `not-found` when the object does not exist, `read-failed` when the bucket read fails otherwise, and `invalid-snapshot` when the object is not JSON or fails validation.

#### Scenario: a v13 snapshot

- **WHEN** `latest.json` holds a v13 snapshot with one available and one unavailable line
- **THEN** `readLatest` returns its `ranAt`, `cclRateSource`, `requestedThroughSession`, `priceUnit`, both lines' IDs and statuses, the available line's State, latest close, period returns in the three currencies, peso and CCL equivalents, watch distances, chart series and Events, and the unavailable line's reason, message and liquidity

#### Scenario: a v12 snapshot

- **WHEN** `latest.json` holds a v12 snapshot, whose lines have no `chartSeries` or `watchDistances` and whose States have no `longTermEma`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: a snapshot a run writes

- **WHEN** `latest.json` holds the snapshot an Analysis Run writes, with CCL Rates or without them
- **THEN** `readLatest` returns it

#### Scenario: a v11 snapshot without CCL Rates

- **WHEN** `latest.json` holds a v13 snapshot whose `cclRateSource` is `null`, whose lines' and Structure Breaks' `cclEquivalents` are `null`, whose lines' `latestClose.ccl` is `null`, and whose lines' `chartSeries.ccl` is empty
- **THEN** `readLatest` returns it with those `null` values and empty lists

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

- **WHEN** `latest.json` holds a snapshot with `schemaVersion` `14`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: malformed data

- **WHEN** `latest.json` is not JSON, or a line has status `pending`, or `requestedThroughSession` is `2026-02-30`, or an available line has no `latestState`, or a `latestState` has no `pendingRegimeTransition`, or a pending transition has `confirmations` `3`, or a `lastConfirmedSwingHigh` has kind `low`, or an available line has no `pesoEquivalents`, or its `pesoEquivalents` describe another session, a swing the State does not have, or a non-positive `mepRate`, or a `latestState` has no `situations`, or a last confirmed swing has no `closePosition`, or a Situation has an `isBeyondNoiseBand` that is neither a boolean nor `null`, or a Situation of type `below-last-confirmed-low-in-bearish-regime` is listed while Regime is `mixed` or while the low's `closePosition` is `at-or-above`, or an available line has no `periodReturns`, or a period return has a `fromSessionDate` but a `null` `percentChange`, or an Event has an unknown type, or a Structure Break has no `pesoEquivalents` or a `null` or non-positive `mepRate`, or an available line has no `cclEquivalents` field, or its `cclEquivalents` describe another session, a swing the State does not have, or a non-positive `cclRate`, or a Structure Break has no `cclEquivalents` field or a non-positive `cclRate`, or an available line has no `pesoPeriodReturns` or `cclPeriodReturns`, or an available line has no `latestClose`, or its `latestClose` describes another session, or has a `ccl` part while `cclEquivalents` is `null` or none while it is not, or a part with a `previousClose` but a `null` `change`, or its `latestClose` has a previous session that is not before its session, or a `peso` close other than `pesoEquivalents.close`, or a `ccl` close other than `cclEquivalents.close`, or a `pesoPeriodReturns` or `cclPeriodReturns` entry starts on another session than the `periodReturns` entry of its window, or `cclRateSource` is neither `null` nor a valid source
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: a chart series that cannot be drawn as the page describes

- **WHEN** an available line's `chartSeries.mep` ends before `latestState.sessionDate`, or a `peso` list repeats a session or goes back in time, or a candle's high is below its close, or a candle has a non-positive price, or `ccl` ends on the State's session while `cclEquivalents` is `null`, or a `mep` session is missing from `peso`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: CCL figures without a CCL Rate

- **WHEN** `latest.json` holds a snapshot whose `cclRateSource` is `null` and one of whose lines has `cclEquivalents`, a `latestClose.ccl`, a `cclPeriodReturns` entry with a start session, a Structure Break with `cclEquivalents`, or a non-empty `chartSeries.ccl`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: no latest snapshot

- **WHEN** the bucket has no `latest.json`
- **THEN** `readLatest` fails with reason `not-found`
