## MODIFIED Requirements

### Requirement: analysis reuses dollarization and the existing calculations

Each fetched line SHALL be validated before use: an analyzed line by dropping its invalid bars and validating the rest as a chronological Daily Bar history, and a MEP rate source line as a whole. Each analyzed line SHALL be corrected for its confirmed Corporate Actions and then dollarized with the MEP rates calculated from the run's MEP rate source lines, and the resulting Dollarized Series SHALL be analyzed with `calculateInstrumentStates`, `detectRegimeTransitionEvents`, `detectStructureBreakEvents`, `detectVolatileSessionEvents` and `detectLargeOneSessionMoves`, and its period returns SHALL be measured with `calculatePeriodReturns` over that series. The run SHALL also measure the line's period returns in pesos and in CCL dollars with `calculatePeriodReturns`, over the sessions of the Dollarized Series expressed in each currency, as the snapshot requirement describes; the analysis never reads them. The only other measurement the run SHALL calculate is each line's liquidity eligibility, with the liquidity-eligibility module.

The MEP rate source lines SHALL be validated as a chronological Daily Bar history with one exception: a bar whose open is `0` SHALL be accepted when the open is its only invalid field. The MEP Rate reads only each leg's close and volume, and the provider has served traded sessions with a zero open on both AL30 lines. The close SHALL still be positive and within the bar's high–low range. Every accepted zero open SHALL be recorded in the snapshot. Analyzed lines SHALL get no such exception.

The adapter widens a bar's range when its open or close sits slightly outside it. Every session it repaired SHALL be recorded in the snapshot: per analyzed line, and for the MEP rate source lines next to the accepted zero opens.

#### Scenario: zero open on a MEP rate source bar

- **WHEN** an AL30 bar on a traded session has open `0` and a valid high, low and close
- **THEN** the session's MEP Rate is calculated from its close
- **AND** the snapshot records that AL30 bar's session as an accepted zero open

#### Scenario: zero open on the dollar leg

- **WHEN** an AL30D bar on a traded session has open `0` and a valid high, low and close
- **THEN** the accepted zero open is recorded with AL30D's Trading Line ID

#### Scenario: other invalid MEP rate source bars still fail

- **WHEN** an AL30D bar has open `0` and also a close above its high beyond the repair tolerance, or a low above its high
- **THEN** the run fails with reason `mep-rate-source-unavailable`

#### Scenario: analyzed lines get no zero-open exception

- **WHEN** an analyzed line has a bar with open `0` on a traded session
- **THEN** that bar is dropped and listed in the line's `droppedBarSessions`, not accepted with a zero open

#### Scenario: analysis uses dollarized prices

- **WHEN** a peso line closes at 1500 on a session whose MEP Rate is 1000
- **THEN** that session's analysis uses a close of 1.5

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
- `pesoEquivalents`: the latest State's session in pesos, for a reader who trades the peso line: `{ sessionDate, mepRate, close, lastConfirmedSwingHigh, lastConfirmedSwingLow, regimeTippingCloses }`. `sessionDate` SHALL equal `latestState.sessionDate`, `mepRate` SHALL be that session's MEP Rate, the one that dollarized its bar, and `close` SHALL be the line's corrected peso close on that session, a market fact. Each swing SHALL be the price of the State's last confirmed swing of that kind converted with `toPesoEquivalent` at that `mepRate`, or `null` when the State's swing is `null`. `regimeTippingCloses` SHALL be `{ bullishCloseAbove, bearishCloseBelow }`, the State's two tipping closes converted the same way, or `null` when the State's `regimeTippingCloses` is `null`. Because the close and the levels share one rate, the close's distance from each level in percent is the same in pesos as in MEP dollars.
- `cclEquivalents`: the latest State's session in CCL dollars, `{ sessionDate, cclRate, close, lastConfirmedSwingHigh, lastConfirmedSwingLow, regimeTippingCloses }`, or `null` when that session has no CCL Rate, including every line of a run without CCL Rates. `sessionDate` SHALL equal `latestState.sessionDate` and `cclRate` SHALL be that session's CCL Rate. `close` and every level SHALL be the matching `pesoEquivalents` value divided by `cclRate` with `toCclEquivalent`, with `null` where the peso value is `null`. One session's MEP Rate and CCL Rate convert every value, so the close's distance from each level in percent is the same in CCL dollars as in MEP dollars and pesos.

An Event is detected on a bar of the Dollarized Series, and a session has a dollarized bar only when it has both a peso bar and a MEP Rate, so an Event's session always has both. An Event's `pesoEquivalents` SHALL therefore never be `null`, and the run SHALL NOT substitute another session's rate or `0`. An Event's peso prices use its own session's rate, not the latest State's: its close is then the peso close the line actually had, and the close and the crossed swing share one rate, so a close below the swing in MEP dollars is also below it in pesos. The same swing MAY therefore have a different peso price in an Event than in the latest State's `pesoEquivalents`.

A CCL figure SHALL use only the CCL Rate of the session it describes. A session can have a dollarized bar and no CCL Rate, when the cable bond did not trade or the CCL rate source was unavailable. The run SHALL NOT substitute another session's CCL Rate, the MEP Rate or `0`: the CCL figure of such a session is `null`, an Event's `cclEquivalents` included, and a period return whose start or anchor session has none is unavailable.

All three return lists share the sessions of the Dollarized Series, so a window starts and ends on the same sessions in every currency and the returns differ only by the currency's own movement. The CCL Rate never enters the Dollarized Series, the Instrument State, the Events or `periodReturns`: with or without CCL Rates, every other field of the snapshot is the same.

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
- **THEN** `pesoEquivalents` is `{ sessionDate, mepRate: 1500, close: 5790, lastConfirmedSwingHigh: 6000, lastConfirmedSwingLow: null, regimeTippingCloses: { bullishCloseAbove: 6300, bearishCloseBelow: 5700 } }` with the State's session date

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
- **THEN** `cclEquivalents` is `{ sessionDate, cclRate: 1600, close: 3.61875, lastConfirmedSwingHigh: 3.75, lastConfirmedSwingLow: null, regimeTippingCloses: { bullishCloseAbove: 3.9375, bearishCloseBelow: 3.5625 } }` with the State's session date

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
- **THEN** the two snapshots are equal once `cclRateSource`, `cclEquivalents` (the lines' and the Events') and `cclPeriodReturns` are removed

#### Scenario: period returns are anchored at the latest State

- **WHEN** a line's last dollarized bar is on 2026-10-08 and the run's Requested-Through Session is 2026-10-09
- **THEN** its `periodReturns` are measured as of 2026-10-08, counting calendar months back from 2026-10-08

### Requirement: run-level facts are recorded

The snapshot SHALL record `schemaVersion: 11`, `priceUnit`, `ranAt` as a UTC instant, `requestedThroughSession`, `analysisConfigurationVersion` equal to `ANALYSIS_CONFIGURATION.version`, and `mepRateSource` with both MEP rate source Trading Line IDs, the date of the latest session that had a MEP Rate, `acceptedZeroOpens`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar accepted with a zero open, and `rangeRepairs`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar whose range the adapter widened.

It SHALL record `cclRateSource`, the provenance of every CCL figure: `{ pesoBondTradingLineId, cableBondTradingLineId, latestRateSessionDate }` with `CCL_RATE_SOURCE`'s two Trading Line IDs and the date of the latest session that had a CCL Rate, or `null` when the run had no CCL Rate.

The snapshot SHALL also record `corporateActionWatch`: either `{ status: 'available', publishedFrom, publishedThrough, candidates }`, with the candidates from the corporate-action-watch module, or `{ status: 'unavailable', publishedFrom, publishedThrough, message }`. Version 4 differed from version 3 only by this field. Version 5 differs from version 4 only in each line's `corporateActions` records, which carry `correction`, `shareFactor` for a `volume` entry and its statuses, and in `insufficient-liquidity` entries, which also carry `corporateActions`. Version 6 differs from version 5 in three ways: it adds `priceUnit`; each `latestState` adds `priceRelativeToLongTermEmaInPercent`; and the Event type `volatility-expansion` becomes `volatile-session`, with its `expansionMultiple` field renamed `atrMultiple`. Version 7 differs from version 6 in two ways: each `latestState` adds `pendingRegimeTransition`, `lastConfirmedSwingHigh` and `lastConfirmedSwingLow`, and each available line adds `pesoEquivalents`. Version 8 differs from version 7 in three ways: each `latestState` adds `regimeTippingCloses` and `situations`, and a `closePosition` on each last confirmed swing; each available line adds `periodReturns`; and `pesoEquivalents` adds `regimeTippingCloses`. Version 9 differs from version 8 in two ways: each Situation of `latestState.situations` adds `isBeyondNoiseBand`, and each period return's `windowMarketSessions` becomes `windowMonths`, since windows count calendar months. Version 10 differs from version 9 only in each `structure-break` Event, which adds `pesoEquivalents`. Version 11 differs from version 10 only by CCL and peso figures for display: it adds `cclRateSource`; each available line adds `pesoPeriodReturns`, `cclPeriodReturns` and `cclEquivalents`; and each `structure-break` Event adds `cclEquivalents`.

`priceUnit` SHALL be `mep-dollar`: every price and every price-denominated measurement in the snapshot, such as an Event's `closePrice`, a swing's `price`, including a State's last confirmed swings and a Situation's `level`, a State's Regime tipping closes, `trueRange` and `baselineAtr`, is in MEP dollars, because the run analyzes the Dollarized Series. It is recorded once, at the top level, and not repeated per value. Ratios, percentages and ATR multiples have no unit. `medianDailyTradedValueUsd` names its own unit and is unchanged. `priceUnit` does not cover the display figures, whose names state their unit: the `pesoEquivalents` blocks, the line's and each Structure Break's, are in pesos and their `mepRate` in pesos per MEP dollar; the `cclEquivalents` blocks are in CCL dollars and their `cclRate` in pesos per CCL dollar; `pesoPeriodReturns` and `cclPeriodReturns` are percentages measured in pesos and in CCL dollars.

#### Scenario: configuration version is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `analysisConfigurationVersion` equals `ANALYSIS_CONFIGURATION.version`

#### Scenario: price unit is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `priceUnit` is `mep-dollar`
- **AND** no Event or State value carries its own unit

#### Scenario: schema version is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `schemaVersion` is `11`

#### Scenario: the CCL rate source is recorded

- **WHEN** a run derives CCL Rates whose latest session is 2026-10-14
- **THEN** the snapshot's `cclRateSource` is `{ pesoBondTradingLineId: 'al30-bond-byma-ars', cableBondTradingLineId: 'al30-bond-byma-usd-ccl', latestRateSessionDate: '2026-10-14' }`
- **AND** it is `null` when AL30C fails to fetch

#### Scenario: the watch is recorded

- **WHEN** a run completes through 2026-09-30 and the feed has a stock-split notice for an analyzed CEDEAR
- **THEN** the snapshot's `corporateActionWatch` is available from 2026-09-24 through 2026-09-30 with that line's candidate

### Requirement: snapshots are persisted as a dated object and as latest

A successful run SHALL write the snapshot as JSON to the S3-compatible bucket used for Bar History under two keys:

- dated: `analysis-snapshots/v11/<requestedThroughSession>/<ranAt>.json`
- latest: `analysis-snapshots/v11/latest.json`

The `v11` in the key prefix SHALL equal the snapshot's `schemaVersion`, so a reader of one schema never finds another schema's object under the keys it reads. Objects written under an earlier prefix SHALL be left in place.

The dated object SHALL be written first. `latest` SHALL be written only after the dated object was written. A failed write SHALL fail the run with reason `snapshot-write-failed`. Each successful run SHALL replace `latest`.

#### Scenario: dated and latest objects

- **WHEN** a run for 2026-10-02 completes at 2026-10-04T15:00:00.000Z
- **THEN** the snapshot is written to `analysis-snapshots/v11/2026-10-02/2026-10-04T15:00:00.000Z.json` and to `analysis-snapshots/v11/latest.json`

#### Scenario: dated write fails

- **WHEN** writing the dated object fails
- **THEN** `latest` is not written and the run fails with reason `snapshot-write-failed`

### Requirement: the run reports its progress

The Analysis Run SHALL accept an optional progress callback and SHALL call it, in order, with:

- `run-started` once the request is valid, before any fetch, with the Requested-Through Session, the number of analyzed Trading Lines and the Analysis Configuration version;
- `fetch-retry-started` before the cool-down of each MEP rate source retry, with scope `mep-rate-source`, the retry number, the number of retries allowed, the cool-down and each retried line's Trading Line ID and failure message;
- `mep-rate-source-fetched` once the MEP rate source yielded MEP Rates, with the Requested-Through Session and the latest MEP Rate session;
- `ccl-rate-derived` once the cable leg yielded CCL Rates, with the latest CCL Rate session, that rate and the latest MEP Rate session, or `ccl-rate-unavailable` with a message saying why there is none;
- `line-analyzed` once for each analyzed Trading Line that did not fail transiently, in Catalog order, as soon as that line is analyzed and before the next line is fetched, with its 1-based position, the number of analyzed Trading Lines and its snapshot entry;
- `fetch-retry-started` before the cool-down of the analyzed lines' retry pass, with scope `analyzed-lines` and the same fields;
- `line-analyzed` once for each line of the retry pass, in Catalog order, as soon as it is analyzed, with its Catalog position;
- `fetch-retry-stopped`, when the retry cut-off leaves lines unretried, with their Trading Line IDs, after the lines already retried and before the unretried lines, which are then reported as `line-analyzed` with their main-pass failure, in Catalog order;
- `corporate-action-watch-checked` once the relevant-facts feed was fetched and matched, after every `line-analyzed`, with the snapshot's `corporateActionWatch`.

Each analyzed Trading Line SHALL be reported exactly once, with its final outcome. Run-level failures SHALL NOT be reported through the callback; they are the run's result. An invalid request SHALL report nothing. Without a callback the run SHALL behave the same.

So that each line can be reported as soon as it is analyzed, each analyzed Trading Line SHALL be fetched in its own acquisition. The run SHALL keep the historical request pause before each of them in the main pass, so the provider sees the same pace as one acquisition of every line.

#### Scenario: each line is reported once, in order, with its outcome

- **WHEN** a run analyzes three lines and the second fails to fetch with a final failure
- **THEN** the callback receives `run-started`, `mep-rate-source-fetched`, `ccl-rate-derived`, then `line-analyzed` for positions 1, 2 and 3 in Catalog order, then `corporate-action-watch-checked`
- **AND** position 2 carries an unavailable entry with reason `fetch-failed`
- **AND** each line is reported before the next line is requested from the provider
- **AND** the feed is requested after the last line, with the historical request pause before it

#### Scenario: a retried line is reported after the main pass

- **WHEN** a run analyzes three lines and the second fails transiently in the main pass and again on retry
- **THEN** the callback receives `line-analyzed` for positions 1 and 3, then `fetch-retry-started` for one analyzed line, then `line-analyzed` for position 2 with reason `fetch-failed`
- **AND** position 2 is reported once

#### Scenario: MEP rate source failure

- **WHEN** the MEP rate source fails on every attempt
- **THEN** the callback receives only `run-started` and one `fetch-retry-started`

### Requirement: the latest snapshot can be read with validation

The bucket-backed snapshot storage SHALL expose `readLatest`, which reads `analysis-snapshots/v11/latest.json` and returns it only after validating it. Validation SHALL cover the fields a reader uses: `schemaVersion` SHALL be `11`, `priceUnit` SHALL be `mep-dollar`, `ranAt` an ISO timestamp, `requestedThroughSession` a real `YYYY-MM-DD` date, and every entry of `analyzedLines` SHALL have string `instrumentId` and `tradingLineId` and one of these shapes:

- `status` `available`, with:
    - a `latestState` whose `regime`, `pendingRegimeTransition`, `regimeTippingCloses`, `structure`, `lastConfirmedSwingHigh`, `lastConfirmedSwingLow`, `rsi`, `priceRelativeToEmaInAtr` and `priceRelativeToLongTermEmaInPercent` are each `null` or a valid value, and whose `situations` is a list. A valid pending transition has a readable Regime `candidate`, `confirmations` of `1` or `2` and `requiredConfirmations` of `3`. Valid tipping closes have a numeric `bullish.closeAbove` and `bearish.closeBelow` and a boolean `isFastEmaAligned` on each side. A valid last confirmed swing has the kind its part names, a numeric `price`, real occurrence and confirmation session dates, a numeric or `null` `priceRelativeToSwingInPercent`, and a `closePosition` of `at-or-above` or `below` for the low and `at-or-below` or `above` for the high. A valid Situation has a known `type`, a real `activeSinceSession`, a `level` of the kind its type names and an `isBeyondNoiseBand` that is a boolean or `null`, and it SHALL agree with the State: `below-last-confirmed-low-in-bearish-regime` only with Regime `bearish` and a low whose `closePosition` is `below` and whose price and session dates equal the `level`, and the mirror for `above-last-confirmed-high-in-bullish-regime`;
    - `periodReturns`, `pesoPeriodReturns` and `cclPeriodReturns`, each entry with a positive integer `windowMonths` and a `fromSessionDate` and `percentChange` that are both `null` or both valid;
    - `pesoEquivalents` with a `sessionDate` equal to `latestState.sessionDate`, a positive numeric `mepRate`, a numeric `close`, a `lastConfirmedSwingHigh` and `lastConfirmedSwingLow` that are numbers exactly when the State's swing of that kind exists and `null` otherwise, and `regimeTippingCloses` with numeric `bullishCloseAbove` and `bearishCloseBelow` exactly when the State's tipping closes exist and `null` otherwise;
    - `cclEquivalents` that is `null` or has the shape of `pesoEquivalents` with a positive numeric `cclRate` in place of `mepRate`, under the same rules: its session is `latestState.sessionDate`, and each level is a number exactly when the State has it;
    - `events` whose entries each have a session date, a `coincidesWithLargeMove` boolean and an `event` that is a regime transition, structure break or volatile session with that type's fields; a structure break's fields include `pesoEquivalents` with a positive numeric `mepRate` and a numeric `closePrice` and `definingSwingPrice`, none of them `null`, and `cclEquivalents` that is `null` or has a positive numeric `cclRate` and a numeric `closePrice` and `definingSwingPrice`;
- `status` `unavailable` with reason `insufficient-liquidity`, a `message`, and `liquidity` with a numeric `participation` and a numeric or `null` `medianDailyTradedValueUsd`;
- `status` `unavailable` with reason `fetch-failed`, `invalid-bars`, `no-provider-bars` or `no-dollarized-bars`, and a `message`.

Other fields SHALL be allowed and not returned.

`readLatest` SHALL NOT throw. It SHALL return a failure with reason `not-found` when the object does not exist, `read-failed` when the bucket read fails otherwise, and `invalid-snapshot` when the object is not JSON or fails validation.

#### Scenario: a v11 snapshot

- **WHEN** `latest.json` holds a v11 snapshot with one available and one unavailable line
- **THEN** `readLatest` returns its `ranAt`, `requestedThroughSession`, `priceUnit`, both lines' IDs and statuses, the available line's State, period returns in the three currencies, peso and CCL equivalents and Events, and the unavailable line's reason, message and liquidity

#### Scenario: a v11 snapshot without CCL Rates

- **WHEN** `latest.json` holds a v11 snapshot whose lines' and Structure Breaks' `cclEquivalents` are `null`
- **THEN** `readLatest` returns it with those `null` values

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

- **WHEN** `latest.json` holds a snapshot with `schemaVersion` `12`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: malformed data

- **WHEN** `latest.json` is not JSON, or a line has status `pending`, or `requestedThroughSession` is `2026-02-30`, or an available line has no `latestState`, or a `latestState` has no `pendingRegimeTransition`, or a pending transition has `confirmations` `3`, or a `lastConfirmedSwingHigh` has kind `low`, or an available line has no `pesoEquivalents`, or its `pesoEquivalents` describe another session, a swing the State does not have, or a non-positive `mepRate`, or a `latestState` has no `situations`, or a last confirmed swing has no `closePosition`, or a Situation has an `isBeyondNoiseBand` that is neither a boolean nor `null`, or a Situation of type `below-last-confirmed-low-in-bearish-regime` is listed while Regime is `mixed` or while the low's `closePosition` is `at-or-above`, or an available line has no `periodReturns`, or a period return has a `fromSessionDate` but a `null` `percentChange`, or an Event has an unknown type, or a Structure Break has no `pesoEquivalents` or a `null` or non-positive `mepRate`, or an available line has no `cclEquivalents` field, or its `cclEquivalents` describe another session, a swing the State does not have, or a non-positive `cclRate`, or a Structure Break has no `cclEquivalents` field or a non-positive `cclRate`, or an available line has no `pesoPeriodReturns` or `cclPeriodReturns`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: no latest snapshot

- **WHEN** the bucket has no `latest.json`
- **THEN** `readLatest` fails with reason `not-found`

### Requirement: the run derives the CCL Rate for display

Once the MEP Rates yielded the liquidity window, and before any analyzed Trading Line is fetched, the run SHALL fetch the provider's full available window through the Requested-Through Session for `CCL_RATE_SOURCE`'s cable-bond line, AL30C, in one acquisition after the historical request pause. The peso-bond leg, AL30, SHALL NOT be fetched again: the run SHALL derive the CCL Rates with `calculateCclRates` from the AL30 bars its MEP rate source fetch already validated and the AL30C bars. A CCL Rate SHALL therefore come from the same session's AL30 and AL30C closes, and a session where either leg did not trade SHALL have none.

AL30C SHALL be validated like a MEP rate source line: a chronological Daily Bar history whose only accepted defect is a zero open, because the CCL Rate reads only the close and volume.

The CCL Rate is for display only. When AL30C fails to fetch, fails validation, answers with no bars, or the two legs yield no CCL Rate, the run SHALL report the CCL Rate as unavailable and continue with no CCL Rate: the analysis SHALL NOT depend on it, and the snapshot records its CCL figures as `null`. AL30C SHALL NOT be retried. A MEP rate source failure SHALL still fail the run, and the run SHALL NOT fetch AL30C when it does.

The run SHALL use the CCL Rates only for the snapshot's CCL figures: `cclRateSource`, `cclEquivalents` and `cclPeriodReturns`. They SHALL NOT be used to dollarize or analyze any line. The snapshot SHALL NOT record the CCL Rate series itself, only each figure's own session's rate.

#### Scenario: the cable leg is fetched after the MEP rate source

- **WHEN** a run succeeds
- **THEN** the provider is asked for AL30, then AL30D, then AL30C, with the historical request pause before AL30C, and only then for the analyzed lines
- **AND** AL30 is requested once

#### Scenario: the CCL Rate comes from the same session

- **WHEN** AL30 closes at 86260 and AL30C at 53.3 on the Requested-Through Session, and both closed differently the session before
- **THEN** the latest CCL Rate is 86260 / 53.3 on the Requested-Through Session

#### Scenario: a session without a cable trade has no CCL Rate

- **WHEN** AL30C has volume 0 on the Requested-Through Session
- **THEN** the latest CCL Rate is the previous session's, reported with that previous session's date

#### Scenario: the cable leg fails

- **WHEN** the provider answers HTTP 503 or `no_data` for AL30C
- **THEN** AL30C is requested once, the CCL Rate is reported as unavailable, and the run writes its snapshot with `cclRateSource` `null`

#### Scenario: the snapshot is unchanged

- **WHEN** a run succeeds with CCL Rates
- **THEN** every analyzed line is dollarized with MEP Rates only
- **AND** its State, Events and `periodReturns` equal those of a run without CCL Rates

#### Scenario: a MEP rate source failure still fails the run

- **WHEN** the provider answers HTTP 503 for AL30D on every request
- **THEN** the run fails with reason `mep-rate-source-unavailable` and AL30C is not requested

### Requirement: the command logs the CCL Rate

The `analyze` command SHALL log `ccl-rate-derived` at info with the latest CCL Rate session and the rate, and `ccl-rate-unavailable` as a warning with its message, saying that the run continues without it.

When the latest CCL Rate session is earlier than the latest MEP Rate session, the command SHALL log `ccl-rate-derived` as a warning instead, naming both sessions: every line whose latest State is on a later session then has no CCL figures, and its page offers no CCL view.

#### Scenario: the CCL Rate is logged

- **WHEN** the latest CCL Rate is 1618.39 on 2026-10-14
- **THEN** the command logs at info `CCL Rate 1618.39 on 2026-10-14.`

#### Scenario: a stale CCL Rate is a warning

- **WHEN** the latest MEP Rate is on 2026-10-14 and the latest CCL Rate on 2026-10-13, because AL30C did not trade on 2026-10-14
- **THEN** the command logs a warning `CCL Rate 1618.39 on 2026-10-13, before the latest MEP Rate session 2026-10-14; lines analyzed through 2026-10-14 have no CCL figures.`

#### Scenario: an unavailable CCL Rate is a warning

- **WHEN** AL30C fails to fetch
- **THEN** the command logs a warning that starts with `CCL Rate unavailable:` and names the failure, and the run goes on to write its snapshot
