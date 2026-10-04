## ADDED Requirements

### Requirement: one run analyzes the supported universe from a fresh fetch

The analysis-run module SHALL expose an Analysis Run that, for one Requested-Through Session, analyzes every analyzed Trading Line and produces one Analysis Snapshot. The analyzed Trading Lines SHALL be the `BYMA` lines quoted in `ARS` of every Catalog Instrument of type `stock` or `cedear`, in Catalog order. Lines on other exchanges or in other currencies SHALL NOT be analyzed.

The run SHALL fetch the provider's full available window through the Requested-Through Session for both MEP rate source Trading Lines first and, only when they yield MEP Rates, for each analyzed Trading Line, using the existing Open BYMADATA adapter and acquirer with their request pacing. Bars after the Requested-Through Session SHALL NOT be analyzed. The run SHALL NOT read or write stored Bar Histories.

The Requested-Through Session SHALL be a completed session. A Requested-Through Session that is not a real `YYYY-MM-DD` date, or that is not before the run's start date in `America/Argentina/Buenos_Aires`, SHALL fail the run as an invalid request before any fetch. The current market date is rejected as a whole because its session may still be trading, and the run does not know the closing time.

#### Scenario: peso lines of stocks and CEDEARs are analyzed

- **WHEN** the Catalog contains a stock and a CEDEAR with BYMA `ARS` lines, a NASDAQ stock and a bond
- **THEN** the snapshot has one entry for each BYMA `ARS` stock or CEDEAR line
- **AND** no entry for the NASDAQ line or the bond

#### Scenario: stored history is not used

- **WHEN** a run completes
- **THEN** every bar it analyzed came from that run's provider fetch

#### Scenario: invalid Requested-Through Session

- **WHEN** the Requested-Through Session is `2026-02-30`
- **THEN** the run fails as an invalid request without fetching or writing

#### Scenario: current market date is not completed

- **WHEN** the run starts at 2026-10-01T15:00:00Z and the Requested-Through Session is 2026-10-01
- **THEN** the run fails as an invalid request without fetching or writing

#### Scenario: future session

- **WHEN** the Requested-Through Session is after the run's start date
- **THEN** the run fails as an invalid request without fetching or writing

#### Scenario: provider bar after the Requested-Through Session

- **WHEN** the provider also serves a bar for the session after the Requested-Through Session
- **THEN** that bar is absent from every entry's window, Events and latest State

#### Scenario: MEP rate source is fetched first

- **WHEN** the MEP rate source fails
- **THEN** no analyzed Trading Line is fetched

### Requirement: analysis reuses dollarization and the existing calculations

Each fetched line SHALL be validated as a chronological Daily Bar history before use. Each analyzed line SHALL be dollarized with the MEP rates calculated from the run's MEP rate source lines, and the resulting Dollarized Series SHALL be analyzed with `calculateInstrumentStates`, `detectRegimeTransitionEvents`, `detectStructureBreakEvents` and `detectVolatilityExpansionEvents`. The run SHALL NOT calculate any other measurement.

The MEP rate source lines SHALL be validated the same way with one exception: a bar whose open is `0` SHALL be accepted when the open is its only invalid field. The MEP Rate reads only each leg's close and volume, and the provider has served traded sessions with a zero open on both AL30 lines. The close SHALL still be positive and within the bar's high–low range. Every accepted zero open SHALL be recorded in the snapshot. Analyzed lines SHALL get no such exception.

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
- **THEN** that line's entry is unavailable with reason `invalid-bars`

#### Scenario: analysis uses dollarized prices

- **WHEN** a peso line closes at 1500 on a session whose MEP Rate is 1000
- **THEN** that session's analysis uses a close of 1.5

### Requirement: the snapshot holds the latest State and every Event

The snapshot SHALL hold one entry per analyzed Trading Line in `analyzedLines`. For each analyzed Trading Line that could be analyzed, the entry SHALL have `status: 'available'`, `instrumentId`, `tradingLineId`, and:

- `latestState`: the Instrument State of the last session of the Dollarized Series. Its `sessionDate` MAY be earlier than the Requested-Through Session when the line did not trade, or had no MEP Rate, on later sessions.
- `events`: every Event detected in the analyzed window, each as `{ sessionDate, event }`, where `event.type` is the Event kind (`regime-transition`, `structure-break` or `volatility-expansion`). Events SHALL be ordered by `sessionDate`; Events of the same session SHALL follow that kind order.
- `window`: the first and last session dates and the bar count of the Dollarized Series that was analyzed.
- `sessionsWithoutMepRate`: the peso-line sessions that had no MEP Rate and therefore no dollarized bar.
- `rangeRepairSessions`: the peso-line sessions whose range the adapter widened.

A State part that cannot be evaluated SHALL be `null`, as in the Instrument State contract. A line with too little history for some parts SHALL still have a `latestState`. Missing values SHALL NOT be replaced with `0`.

#### Scenario: latest State is the final session's State

- **WHEN** a line's Dollarized Series ends on 2026-10-02
- **THEN** `latestState` equals the Instrument State calculated for 2026-10-02 over that series

#### Scenario: Events from all three detectors

- **WHEN** the window contains a Regime Transition, a Structure Break and a Volatility Expansion
- **THEN** `events` contains each of them with the session date on which it was detected

#### Scenario: short history

- **WHEN** a line has 30 dollarized bars
- **THEN** its entry is available with a `latestState` whose Regime and Structure are `null`
- **AND** its RSI and price relative to EMA are numbers

### Requirement: run-level facts are recorded

The snapshot SHALL record `schemaVersion: 1`, `ranAt` as a UTC instant, `requestedThroughSession`, `analysisConfigurationVersion` equal to `ANALYSIS_CONFIGURATION.version`, and `mepRateSource` with both MEP rate source Trading Line IDs, the date of the latest session that had a MEP Rate, `acceptedZeroOpens`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar accepted with a zero open, and `rangeRepairs`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar whose range the adapter widened.

#### Scenario: configuration version is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `analysisConfigurationVersion` equals `ANALYSIS_CONFIGURATION.version`

### Requirement: an analyzed line can fail without failing the run

When an analyzed Trading Line cannot be fetched, fails Daily Bar validation, has no provider bars, or has no dollarized bar, its entry SHALL have `status: 'unavailable'`, `instrumentId`, `tradingLineId`, a `reason` of `fetch-failed`, `invalid-bars`, `no-provider-bars` or `no-dollarized-bars`, and a `message`. `no-provider-bars` means the provider answered with no bars; `no-dollarized-bars` means the line had bars but none on a session with a MEP Rate. It SHALL NOT have a State or Events. The other lines SHALL still be analyzed.

#### Scenario: one line fails to fetch

- **WHEN** the provider returns an error for one analyzed line and succeeds for the others
- **THEN** that line's entry is unavailable with reason `fetch-failed`
- **AND** the other lines are available

#### Scenario: provider has no bars for a line

- **WHEN** the provider answers `no_data` for an analyzed line
- **THEN** that line's entry is unavailable with reason `no-provider-bars`

#### Scenario: invalid bars

- **WHEN** a fetched line contains a bar whose close is above its high beyond the repair tolerance
- **THEN** that line's entry is unavailable with reason `invalid-bars`

### Requirement: the run fails without the MEP rate source or without any analyzed line

The run SHALL fail and write nothing when either MEP rate source line cannot be fetched or fails validation, or when the two lines yield no MEP Rate. No analyzed line can be dollarized without them. The run SHALL also fail and write nothing when no analyzed line is available, so that a snapshot made only of failures is never published.

#### Scenario: MEP source fetch fails

- **WHEN** the provider returns an error for AL30D
- **THEN** the run fails with reason `mep-rate-source-unavailable`
- **AND** no snapshot is written

#### Scenario: every analyzed line fails

- **WHEN** the MEP rate source succeeds and every analyzed line fails
- **THEN** the run fails with reason `no-analyzed-lines`
- **AND** no snapshot is written

### Requirement: snapshots are persisted as a dated object and as latest

A successful run SHALL write the snapshot as JSON to the S3-compatible bucket used for Bar History under two keys:

- dated: `analysis-snapshots/v1/<requestedThroughSession>/<ranAt>.json`
- latest: `analysis-snapshots/v1/latest.json`

The dated object SHALL be written first. `latest` SHALL be written only after the dated object was written. A failed write SHALL fail the run with reason `snapshot-write-failed`. Each successful run SHALL replace `latest`.

#### Scenario: dated and latest objects

- **WHEN** a run for 2026-10-02 completes at 2026-10-04T15:00:00.000Z
- **THEN** the snapshot is written to `analysis-snapshots/v1/2026-10-02/2026-10-04T15:00:00.000Z.json` and to `analysis-snapshots/v1/latest.json`

#### Scenario: dated write fails

- **WHEN** writing the dated object fails
- **THEN** `latest` is not written and the run fails with reason `snapshot-write-failed`
