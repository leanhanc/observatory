## MODIFIED Requirements

### Requirement: analysis reuses dollarization and the existing calculations

Each fetched line SHALL be validated before use: an analyzed line by dropping its invalid bars and validating the rest as a chronological Daily Bar history, and a MEP rate source line as a whole. Each analyzed line SHALL be corrected for its confirmed Corporate Actions and then dollarized with the MEP rates calculated from the run's MEP rate source lines, and the resulting Dollarized Series SHALL be analyzed with `calculateInstrumentStates`, `detectRegimeTransitionEvents`, `detectStructureBreakEvents`, `detectVolatileSessionEvents` and `detectLargeOneSessionMoves`. The only other measurement the run SHALL calculate is each line's liquidity eligibility, with the liquidity-eligibility module.

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
- `events`: every Event detected in the analyzed window, each as `{ sessionDate, event, coincidesWithLargeMove }`, where `event.type` is the Event kind (`regime-transition`, `structure-break` or `volatile-session`). Events SHALL be ordered by `sessionDate`; Events of the same session SHALL follow that kind order.
- `largeMoves`: the Large One-Session Moves in the analyzed window.
- `corporateActions`: the line's Corporate Actions and whether each was applied.
- `window`: the first and last session dates and the bar count of the Dollarized Series that was analyzed.
- `sessionsWithoutMepRate`: the peso-line sessions that had no MEP Rate and therefore no dollarized bar.
- `rangeRepairSessions`: the peso-line sessions whose range the adapter widened.
- `droppedBarSessions`: the peso-line sessions whose invalid bar was dropped.

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

### Requirement: run-level facts are recorded

The snapshot SHALL record `schemaVersion: 6`, `priceUnit`, `ranAt` as a UTC instant, `requestedThroughSession`, `analysisConfigurationVersion` equal to `ANALYSIS_CONFIGURATION.version`, and `mepRateSource` with both MEP rate source Trading Line IDs, the date of the latest session that had a MEP Rate, `acceptedZeroOpens`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar accepted with a zero open, and `rangeRepairs`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar whose range the adapter widened.

The snapshot SHALL also record `corporateActionWatch`: either `{ status: 'available', publishedFrom, publishedThrough, candidates }`, with the candidates from the corporate-action-watch module, or `{ status: 'unavailable', publishedFrom, publishedThrough, message }`. Version 4 differed from version 3 only by this field. Version 5 differs from version 4 only in each line's `corporateActions` records, which carry `correction`, `shareFactor` for a `volume` entry and its statuses, and in `insufficient-liquidity` entries, which also carry `corporateActions`. Version 6 differs from version 5 in three ways: it adds `priceUnit`; each `latestState` adds `priceRelativeToLongTermEmaInPercent`; and the Event type `volatility-expansion` becomes `volatile-session`, with its `expansionMultiple` field renamed `atrMultiple`.

`priceUnit` SHALL be `mep-dollar`: every price and every price-denominated measurement in the snapshot, such as an Event's `closePrice`, a swing's `price`, `trueRange` and `baselineAtr`, is in MEP dollars, because the run analyzes the Dollarized Series. It is recorded once, at the top level, and not repeated per value. Ratios, percentages and ATR multiples have no unit. `medianDailyTradedValueUsd` names its own unit and is unchanged.

#### Scenario: configuration version is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `analysisConfigurationVersion` equals `ANALYSIS_CONFIGURATION.version`

#### Scenario: price unit is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `priceUnit` is `mep-dollar`
- **AND** no Event or State value carries its own unit

#### Scenario: schema version is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `schemaVersion` is `6`

#### Scenario: the watch is recorded

- **WHEN** a run completes through 2026-09-30 and the feed has a stock-split notice for an analyzed CEDEAR
- **THEN** the snapshot's `corporateActionWatch` is available from 2026-09-24 through 2026-09-30 with that line's candidate

### Requirement: snapshots are persisted as a dated object and as latest

A successful run SHALL write the snapshot as JSON to the S3-compatible bucket used for Bar History under two keys:

- dated: `analysis-snapshots/v6/<requestedThroughSession>/<ranAt>.json`
- latest: `analysis-snapshots/v6/latest.json`

The `v6` in the key prefix SHALL equal the snapshot's `schemaVersion`, so a reader of one schema never finds another schema's object under the keys it reads. Objects written under an earlier prefix SHALL be left in place.

The dated object SHALL be written first. `latest` SHALL be written only after the dated object was written. A failed write SHALL fail the run with reason `snapshot-write-failed`. Each successful run SHALL replace `latest`.

#### Scenario: dated and latest objects

- **WHEN** a run for 2026-10-02 completes at 2026-10-04T15:00:00.000Z
- **THEN** the snapshot is written to `analysis-snapshots/v6/2026-10-02/2026-10-04T15:00:00.000Z.json` and to `analysis-snapshots/v6/latest.json`

#### Scenario: dated write fails

- **WHEN** writing the dated object fails
- **THEN** `latest` is not written and the run fails with reason `snapshot-write-failed`

### Requirement: confirmed Corporate Actions are corrected before analysis

After a line's bars are validated and found non-empty, the run SHALL apply that line's entries from the committed Corporate Action list with `applyCorporateActions`, before liquidity eligibility, dollarization, State and Events. Every later step SHALL read the corrected peso bars. The MEP rate source lines SHALL NOT be corrected. The list SHALL be replaceable through the runner options, defaulting to the committed list. Creating the runner SHALL fail when any action, from the committed or an injected list, names a Trading Line the run does not analyze, such as a dollar line, a MEP rate source line or a line missing from the catalog: such an action would never be applied or reported.

Each available or `insufficient-liquidity` line SHALL record `corporateActions`: one outcome for each of its Corporate Actions, from the corporate-actions module: `{ tradingLineId, exDate, correction: 'prices-and-volume', kind, priceFactor, sourceUrl, status, observedCloseRatio }` with the status `applied`, `step-not-observed` or `outside-window`, or `{ tradingLineId, exDate, correction: 'volume', kind, shareFactor, sourceUrl, status, observedCloseRatio }` with the status `applied`, `price-step-observed`, `volume-rescale-suspected` or `outside-window`. A line with no Corporate Action SHALL record an empty list.

A `volume` correction changes only volume, which only the liquidity gate reads, so it can change whether a line is eligible and nothing else. Liquidity eligibility SHALL read the corrected volume.

#### Scenario: an unadjusted share distribution is corrected

- **WHEN** the provider serves a line whose prices before an ex-date are twice the corrected level, with half the volume, and the list has a factor-0.5 entry for it
- **THEN** the line's `corporateActions` lists the entry as `applied`
- **AND** its Events, Large One-Session Moves and latest State equal those of the same line served already adjusted
- **AND** no Structure Break, Volatile Session or Large One-Session Move is recorded on the ex-date

#### Scenario: the provider already adjusted the history

- **WHEN** the list has a factor-0.5 entry for a line whose fetched prices show no step at the ex-date
- **THEN** the line's `corporateActions` lists the entry as `step-not-observed`
- **AND** its analysis equals the analysis without the entry

#### Scenario: a volume-only correction reaches the liquidity gate

- **WHEN** the provider serves a line whose prices are adjusted for a share factor of 3 but whose volume before the ex-date is still in the old unit, and the list has a `volume` entry for it
- **THEN** the line's `corporateActions` lists the entry as `applied`
- **AND** its `liquidity` measures, or its eligibility, are those of the same line served with volume on the new unit
- **AND** its Events, Large One-Session Moves and latest State equal those of a run without the entry

#### Scenario: a volume-only correction can make a line eligible

- **WHEN** a line's median traded value is below USD 50,000 only because its volume before an in-window ex-date is in the old unit, and the list has a `volume` entry for it
- **THEN** the line is available
- **AND** without the entry it is `insufficient-liquidity` with an empty `corporateActions`

#### Scenario: a skipped volume-only correction on an excluded line is recorded

- **WHEN** a `volume` entry's line shows a price step at the ex-date and the line fails the liquidity gate
- **THEN** its `insufficient-liquidity` entry lists the entry as `price-step-observed`

#### Scenario: an action for a line the run does not analyze

- **WHEN** the runner is created with an action for `al30-bond-byma-ars`, for a dollar line, or for a Trading Line missing from the catalog
- **THEN** creating the runner fails with an error naming that Trading Line

#### Scenario: the committed list names analyzed lines

- **WHEN** the runner is created with the committed list and the committed catalog
- **THEN** it is created

#### Scenario: the correction is in pesos, before dollarization

- **WHEN** a corrected line is dollarized
- **THEN** each corrected session's dollarized close is the corrected peso close divided by that session's own MEP Rate
- **AND** the MEP Rates equal those of a run without the entry

### Requirement: Large One-Session Moves are flagged on available lines

Each available line SHALL record `largeMoves`: the Large One-Session Moves of its Dollarized Series, after corrections, from `detectLargeOneSessionMoves`, each as `{ sessionDate, closeRatio }` in session order. Every Event SHALL carry `coincidesWithLargeMove`, `true` when its `sessionDate` is a flagged session and `false` otherwise. Only Events on the flagged session are marked: a later Event that the same step causes, such as a Regime Transition once the averages catch up or a swing confirmed afterwards, is not. The flag SHALL NOT make a line unavailable and SHALL NOT remove or change any Event.

#### Scenario: an Event on a flagged session

- **WHEN** a line's dollarized close doubles on one session and a Volatile Session is detected on it
- **THEN** `largeMoves` lists that session with `closeRatio` 2
- **AND** that Event has `coincidesWithLargeMove: true`, and every Event on another session has `false`
- **AND** the line is available

#### Scenario: the flag uses each session's own MEP Rate

- **WHEN** a peso close is unchanged across two sessions while the MEP Rate halves
- **THEN** the dollarized close doubles and the session is flagged with `closeRatio` 2

### Requirement: the latest snapshot can be read with validation

The bucket-backed snapshot storage SHALL expose `readLatest`, which reads `analysis-snapshots/v6/latest.json` and returns it only after validating it. Validation SHALL cover the fields a reader uses: `schemaVersion` SHALL be `6`, `priceUnit` SHALL be `mep-dollar`, `ranAt` an ISO timestamp, `requestedThroughSession` a real `YYYY-MM-DD` date, and every entry of `analyzedLines` SHALL have string `instrumentId` and `tradingLineId` and one of these shapes:

- `status` `available`, with a `latestState` whose `regime`, `structure`, `rsi`, `priceRelativeToEmaInAtr` and `priceRelativeToLongTermEmaInPercent` are each `null` or a valid value, and `events` whose entries each have a session date, a `coincidesWithLargeMove` boolean and an `event` that is a regime transition, structure break or volatile session with that type's fields;
- `status` `unavailable` with reason `insufficient-liquidity`, a `message`, and `liquidity` with a numeric `participation` and a numeric or `null` `medianDailyTradedValueUsd`;
- `status` `unavailable` with reason `fetch-failed`, `invalid-bars`, `no-provider-bars` or `no-dollarized-bars`, and a `message`.

Other fields SHALL be allowed and not returned.

`readLatest` SHALL NOT throw. It SHALL return a failure with reason `not-found` when the object does not exist, `read-failed` when the bucket read fails otherwise, and `invalid-snapshot` when the object is not JSON or fails validation.

#### Scenario: a v6 snapshot

- **WHEN** `latest.json` holds a v6 snapshot with one available and one unavailable line
- **THEN** `readLatest` returns its `ranAt`, `requestedThroughSession`, `priceUnit`, both lines' IDs and statuses, the available line's State and Events and the unavailable line's reason, message and liquidity

#### Scenario: a v5 snapshot

- **WHEN** `latest.json` holds a snapshot with `schemaVersion` `5`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: another schema version

- **WHEN** `latest.json` holds a snapshot with `schemaVersion` `7`
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: malformed data

- **WHEN** `latest.json` is not JSON, or a line has status `pending`, or `requestedThroughSession` is `2026-02-30`, or an available line has no `latestState`, or an Event has an unknown type
- **THEN** `readLatest` fails with reason `invalid-snapshot`

#### Scenario: no latest snapshot

- **WHEN** the bucket has no `latest.json`
- **THEN** `readLatest` fails with reason `not-found`
