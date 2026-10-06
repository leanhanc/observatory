## ADDED Requirements

### Requirement: the command defaults to the previous market date

The `analyze` command SHALL accept an optional `--through-session YYYY-MM-DD`. When it is given, it SHALL be the Requested-Through Session. When it is omitted, the Requested-Through Session SHALL be the calendar date immediately before the current date in `America/Argentina/Buenos_Aires`, with the current date taken from the command's clock.

The default is a calendar date, not a known trading session. When no session traded on it, the run SHALL proceed as for any other Requested-Through Session: it analyzes through the latest bar on or before that date, `requestedThroughSession` records the requested date, and a successful run replaces `latest`.

#### Scenario: weekday morning

- **WHEN** the command runs without `--through-session` at 2026-10-07T09:00:00Z, a Wednesday
- **THEN** the Requested-Through Session is 2026-10-06

#### Scenario: Saturday morning

- **WHEN** the command runs without `--through-session` at 2026-10-10T09:00:00Z, a Saturday
- **THEN** the Requested-Through Session is 2026-10-09, the Friday

#### Scenario: UTC midnight is still the previous market day

- **WHEN** the command runs without `--through-session` at 2026-10-08T02:00:00Z, which is 2026-10-07T23:00 in Buenos Aires
- **THEN** the Requested-Through Session is 2026-10-06

#### Scenario: explicit session wins

- **WHEN** the command runs with `--through-session 2026-10-01` at 2026-10-07T09:00:00Z
- **THEN** the Requested-Through Session is 2026-10-01

#### Scenario: requested date was not a trading session

- **WHEN** the Requested-Through Session is a holiday and the last provider bar on or before it is from the previous day
- **THEN** the snapshot's `requestedThroughSession` is the holiday
- **AND** `latestState.sessionDate` and `mepRateSource.latestRateSessionDate` are the previous day
- **AND** the snapshot replaces `latest`

### Requirement: the run reports its progress

The Analysis Run SHALL accept an optional progress callback and SHALL call it, in order, with:

- `run-started` once the request is valid, before any fetch, with the Requested-Through Session, the number of analyzed Trading Lines and the Analysis Configuration version;
- `mep-rate-source-fetched` once the MEP rate source yielded MEP Rates, with the latest MEP Rate session;
- `line-analyzed` once for each analyzed Trading Line, in Catalog order, as soon as that line is analyzed and before the next line is fetched, with its 1-based position, the number of analyzed Trading Lines and its snapshot entry.

Run-level failures SHALL NOT be reported through the callback; they are the run's result. An invalid request SHALL report nothing. Without a callback the run SHALL behave the same.

So that each line can be reported as soon as it is analyzed, each analyzed Trading Line SHALL be fetched in its own acquisition. The run SHALL keep the historical request pause before each of them, so the provider sees the same pace as one acquisition of every line.

#### Scenario: each line is reported once, in order, with its outcome

- **WHEN** a run analyzes three lines and the second fails to fetch
- **THEN** the callback receives `run-started`, `mep-rate-source-fetched`, then `line-analyzed` for positions 1, 2 and 3 in Catalog order
- **AND** position 2 carries an unavailable entry with reason `fetch-failed`
- **AND** each line is reported before the next line is requested from the provider

#### Scenario: MEP rate source failure

- **WHEN** the MEP rate source fails
- **THEN** the callback receives only `run-started`

### Requirement: the command logs progress and exits with the run's outcome

The `analyze` command SHALL log each progress report as it arrives through the Observatory logger: structured JSON in production, readable lines locally. Each analyzed line SHALL be logged exactly once with its position, its Trading Line ID and its outcome: `available` with its last session and Event count, or `unavailable` with its reason. An `insufficient-liquidity` line SHALL also show its participation and median daily traded value; other unavailable reasons SHALL show the line's message and log as warnings. A successful run SHALL end with one entry giving the available and unavailable counts, the snapshot locations and the run's duration.

Every failure, whether an invalid invocation, a run failure or an unexpected error, SHALL be logged as one error entry whose message starts with `Analysis Run failed:`; for a run failure it SHALL contain the failure reason. Logs SHALL NOT contain the storage configuration's credentials.

The command SHALL exit with status `0` after a snapshot is written and with a non-zero status otherwise. The process SHALL NOT stay alive after the run ends, so that a scheduler that waits for it to exit can start the next run.

#### Scenario: line outcomes

- **WHEN** a run analyzes an available line, a line excluded by the liquidity gate and a line that fails to fetch
- **THEN** the log has, in order, `[1/3] <id>: available (last session ..., N events)`, `[2/3] <id>: unavailable: insufficient-liquidity (participation ..., median ...)` and a warning `[3/3] <id>: unavailable: fetch-failed (...)`

#### Scenario: failed run

- **WHEN** the run fails with reason `mep-rate-source-unavailable`
- **THEN** the command logs one error entry `Analysis Run failed: mep-rate-source-unavailable: ...` and exits non-zero

#### Scenario: credentials stay out of the log

- **WHEN** the storage credentials contain a sentinel value and the bucket write fails
- **THEN** no log entry contains the sentinel
