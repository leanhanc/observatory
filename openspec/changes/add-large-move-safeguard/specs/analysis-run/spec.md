## ADDED Requirements

### Requirement: confirmed Corporate Actions are corrected before analysis

After a line's bars are validated and found non-empty, the run SHALL apply that line's entries from the committed Corporate Action list with `applyCorporateActions`, before liquidity eligibility, dollarization, State and Events. Every later step SHALL read the corrected peso bars. The MEP rate source lines SHALL NOT be corrected. The list SHALL be replaceable through the runner options, defaulting to the committed list.

Each available line SHALL record `corporateActions`: one `{ exDate, kind, priceFactor, sourceUrl, status, observedCloseRatio }` for each of its Corporate Actions, with the status `applied`, `already-adjusted` or `outside-window` from the corporate-actions module. A line with no Corporate Action SHALL record an empty list.

#### Scenario: an unadjusted share distribution is corrected

- **WHEN** the provider serves a line whose prices before an ex-date are twice the corrected level, with half the volume, and the list has a factor-0.5 entry for it
- **THEN** the line's `corporateActions` lists the entry as `applied`
- **AND** its Events, Large One-Session Moves and latest State equal those of the same line served already adjusted
- **AND** no Structure Break, Volatility Expansion or Large One-Session Move is recorded on the ex-date

#### Scenario: the provider already adjusted the history

- **WHEN** the list has a factor-0.5 entry for a line whose fetched prices show no step at the ex-date
- **THEN** the line's `corporateActions` lists the entry as `already-adjusted`
- **AND** its analysis equals the analysis without the entry

#### Scenario: the correction is in pesos, before dollarization

- **WHEN** a corrected line is dollarized
- **THEN** each corrected session's dollarized close is the corrected peso close divided by that session's own MEP Rate
- **AND** the MEP Rates equal those of a run without the entry

### Requirement: Large One-Session Moves are flagged on available lines

Each available line SHALL record `largeMoves`: the Large One-Session Moves of its Dollarized Series, after corrections, from `detectLargeOneSessionMoves`, each as `{ sessionDate, closeRatio }` in session order. Every Event SHALL carry `coincidesWithLargeMove`, `true` when its `sessionDate` is a flagged session and `false` otherwise. The flag SHALL NOT make a line unavailable and SHALL NOT remove or change any Event.

#### Scenario: an Event on a flagged session

- **WHEN** a line's dollarized close doubles on one session and a Volatility Expansion is detected on it
- **THEN** `largeMoves` lists that session with `closeRatio` 2
- **AND** that Event has `coincidesWithLargeMove: true`, and every Event on another session has `false`
- **AND** the line is available

#### Scenario: the flag uses each session's own MEP Rate

- **WHEN** a peso close is unchanged across two sessions while the MEP Rate halves
- **THEN** the dollarized close doubles and the session is flagged with `closeRatio` 2

## MODIFIED Requirements

### Requirement: analysis reuses dollarization and the existing calculations

Each fetched line SHALL be validated as a chronological Daily Bar history before use. Each analyzed line SHALL be corrected for its confirmed Corporate Actions and then dollarized with the MEP rates calculated from the run's MEP rate source lines, and the resulting Dollarized Series SHALL be analyzed with `calculateInstrumentStates`, `detectRegimeTransitionEvents`, `detectStructureBreakEvents`, `detectVolatilityExpansionEvents` and `detectLargeOneSessionMoves`. The only other measurement the run SHALL calculate is each line's liquidity eligibility, with the liquidity-eligibility module.

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

The snapshot SHALL hold one entry per analyzed Trading Line in `analyzedLines`. For each analyzed Trading Line that could be analyzed and is liquidity-eligible, the entry SHALL have `status: 'available'`, `instrumentId`, `tradingLineId`, and:

- `latestState`: the Instrument State of the last session of the Dollarized Series. Its `sessionDate` MAY be earlier than the Requested-Through Session when the line did not trade, or had no MEP Rate, on later sessions.
- `events`: every Event detected in the analyzed window, each as `{ sessionDate, event, coincidesWithLargeMove }`, where `event.type` is the Event kind (`regime-transition`, `structure-break` or `volatility-expansion`). Events SHALL be ordered by `sessionDate`; Events of the same session SHALL follow that kind order.
- `largeMoves`: the Large One-Session Moves in the analyzed window.
- `corporateActions`: the line's Corporate Actions and whether each was applied.
- `window`: the first and last session dates and the bar count of the Dollarized Series that was analyzed.
- `sessionsWithoutMepRate`: the peso-line sessions that had no MEP Rate and therefore no dollarized bar.
- `rangeRepairSessions`: the peso-line sessions whose range the adapter widened.

A State part that cannot be evaluated SHALL be `null`, as in the Instrument State contract. A liquidity-eligible line with too little history for some parts SHALL still have a `latestState`. Eligibility already requires trading on at least 90% of the last 125 market sessions, so this applies to lines with roughly 113 to 200 sessions of history, which is too short for Regime's 200-session average. Missing values SHALL NOT be replaced with `0`.

#### Scenario: latest State is the final session's State

- **WHEN** a line's Dollarized Series ends on 2026-10-02
- **THEN** `latestState` equals the Instrument State calculated for 2026-10-02 over that series

#### Scenario: Events from all three detectors

- **WHEN** the window contains a Regime Transition, a Structure Break and a Volatility Expansion
- **THEN** `events` contains each of them with the session date on which it was detected

#### Scenario: short history

- **WHEN** a liquidity-eligible line has 120 dollarized bars
- **THEN** its entry is available with a `latestState` whose Regime and Structure are `null`
- **AND** its RSI and price relative to EMA are numbers

### Requirement: run-level facts are recorded

The snapshot SHALL record `schemaVersion: 3`, `ranAt` as a UTC instant, `requestedThroughSession`, `analysisConfigurationVersion` equal to `ANALYSIS_CONFIGURATION.version`, and `mepRateSource` with both MEP rate source Trading Line IDs, the date of the latest session that had a MEP Rate, `acceptedZeroOpens`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar accepted with a zero open, and `rangeRepairs`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar whose range the adapter widened.

#### Scenario: configuration version is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `analysisConfigurationVersion` equals `ANALYSIS_CONFIGURATION.version`

#### Scenario: schema version is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `schemaVersion` is `3`

### Requirement: snapshots are persisted as a dated object and as latest

A successful run SHALL write the snapshot as JSON to the S3-compatible bucket used for Bar History under two keys:

- dated: `analysis-snapshots/v3/<requestedThroughSession>/<ranAt>.json`
- latest: `analysis-snapshots/v3/latest.json`

The `v3` in the key prefix SHALL equal the snapshot's `schemaVersion`, so a reader of one schema never finds another schema's object under the keys it reads. Objects written under an earlier prefix SHALL be left in place.

The dated object SHALL be written first. `latest` SHALL be written only after the dated object was written. A failed write SHALL fail the run with reason `snapshot-write-failed`. Each successful run SHALL replace `latest`.

#### Scenario: dated and latest objects

- **WHEN** a run for 2026-10-02 completes at 2026-10-04T15:00:00.000Z
- **THEN** the snapshot is written to `analysis-snapshots/v3/2026-10-02/2026-10-04T15:00:00.000Z.json` and to `analysis-snapshots/v3/latest.json`

#### Scenario: dated write fails

- **WHEN** writing the dated object fails
- **THEN** `latest` is not written and the run fails with reason `snapshot-write-failed`

### Requirement: the command logs progress and exits with the run's outcome

The `analyze` command SHALL log each progress report as it arrives through the Observatory logger: structured JSON in production, readable lines locally. Each analyzed line SHALL be logged exactly once with its position, its Trading Line ID and its outcome: `available` with its last session, Event count and number of Large One-Session Moves, or `unavailable` with its reason. An available line with Corporate Actions SHALL also show each one's ex-date and status; when any of them is `already-adjusted`, the entry SHALL be a warning, because the list holds an entry the provider no longer needs. An `insufficient-liquidity` line SHALL also show its participation and median daily traded value; other unavailable reasons SHALL show the line's message and log as warnings. When the latest MEP Rate session is before the Requested-Through Session, which happens on a holiday or when the provider has not yet published the session, the command SHALL log a warning naming both dates. A successful run SHALL end with one entry giving the available and unavailable counts, how many available lines end before the latest MEP Rate session, the snapshot locations and the run's duration.

Every failure, whether an invalid invocation, a run failure or an unexpected error, SHALL be logged as one error entry whose message starts with `Analysis Run failed:`; for a run failure it SHALL contain the failure reason. Logs SHALL NOT contain the storage configuration's credentials.

The command SHALL exit with status `0` after a snapshot is written and with a non-zero status otherwise. The process SHALL NOT stay alive after the run ends, so that a scheduler that waits for it to exit can start the next run.

The run SHALL have a deadline, 30 minutes by default. A run still unfinished at the deadline SHALL be logged as a failure with reason `deadline-exceeded` and the process SHALL exit non-zero, even if a request is still pending. Railway skips a cron run while the previous one is still running, so a hung request would otherwise block every later run.

#### Scenario: line outcomes

- **WHEN** a run analyzes an available line, a line excluded by the liquidity gate and a line that fails to fetch
- **THEN** the log has, in order, `[1/3] <id>: available (last session ..., N events, M large moves)`, `[2/3] <id>: unavailable: insufficient-liquidity (participation ..., median ...)` and a warning `[3/3] <id>: unavailable: fetch-failed (...)`

#### Scenario: a Corporate Action the provider already adjusted

- **WHEN** an available line's Corporate Action is `already-adjusted`
- **THEN** its entry is a warning that names the ex-date and `already-adjusted`

#### Scenario: failed run

- **WHEN** the run fails with reason `mep-rate-source-unavailable`
- **THEN** the command logs one error entry `Analysis Run failed: mep-rate-source-unavailable: ...` and exits non-zero

#### Scenario: credentials stay out of the log

- **WHEN** the storage credentials contain a sentinel value and the bucket write fails
- **THEN** no log entry contains the sentinel

#### Scenario: requested session has no MEP Rate

- **WHEN** the Requested-Through Session is 2026-10-01 and the latest MEP Rate session is 2026-09-30
- **THEN** the command logs a warning `No MEP Rate session on 2026-10-01; analyzing through 2026-09-30.`

#### Scenario: lines ending before the latest session are counted

- **WHEN** one available line's window ends one session before the latest MEP Rate session
- **THEN** the completion entry counts one line ending before that session

#### Scenario: hung run

- **WHEN** a provider request never answers and the deadline passes
- **THEN** the command logs `Analysis Run failed: deadline-exceeded: ...` and exits non-zero
