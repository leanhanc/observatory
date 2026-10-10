## MODIFIED Requirements

### Requirement: run-level facts are recorded

The snapshot SHALL record `schemaVersion: 5`, `ranAt` as a UTC instant, `requestedThroughSession`, `analysisConfigurationVersion` equal to `ANALYSIS_CONFIGURATION.version`, and `mepRateSource` with both MEP rate source Trading Line IDs, the date of the latest session that had a MEP Rate, `acceptedZeroOpens`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar accepted with a zero open, and `rangeRepairs`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar whose range the adapter widened.

The snapshot SHALL also record `corporateActionWatch`: either `{ status: 'available', publishedFrom, publishedThrough, candidates }`, with the candidates from the corporate-action-watch module, or `{ status: 'unavailable', publishedFrom, publishedThrough, message }`. Version 4 differed from version 3 only by this field. Version 5 differs from version 4 only in each line's `corporateActions` records, which carry `correction`, `shareFactor` for a `volume` entry and its statuses, and in `insufficient-liquidity` entries, which also carry `corporateActions`.

#### Scenario: configuration version is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `analysisConfigurationVersion` equals `ANALYSIS_CONFIGURATION.version`

#### Scenario: schema version is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `schemaVersion` is `5`

#### Scenario: the watch is recorded

- **WHEN** a run completes through 2026-09-30 and the feed has a stock-split notice for an analyzed CEDEAR
- **THEN** the snapshot's `corporateActionWatch` is available from 2026-09-24 through 2026-09-30 with that line's candidate

### Requirement: an analyzed line can fail without failing the run

When an analyzed Trading Line cannot be fetched, has no valid Daily Bar history after its invalid bars are dropped, has no provider bars, has no dollarized bar, or is not liquidity-eligible, its entry SHALL have `status: 'unavailable'`, `instrumentId`, `tradingLineId`, a `reason` of `fetch-failed`, `invalid-bars`, `no-provider-bars`, `no-dollarized-bars` or `insufficient-liquidity`, and a `message`. A `no-dollarized-bars` or `insufficient-liquidity` entry SHALL also carry `droppedBarSessions` and `rangeRepairSessions`. `invalid-bars` means the kept bars are not a chronological history, or every bar was dropped; `no-provider-bars` means the provider answered with no bars; `no-dollarized-bars` means the line had valid bars but none on a session with a MEP Rate; `insufficient-liquidity` means the line failed the liquidity-eligibility gate, and only that entry also carries `liquidity` and `corporateActions`, as an available entry records them: a volume-only correction exists to change the gate's result, so whether it was applied matters most on a line the gate excludes. It SHALL NOT have a State or Events. The other lines SHALL still be analyzed.

#### Scenario: one line fails to fetch

- **WHEN** the provider returns an error for one analyzed line and succeeds for the others
- **THEN** that line's entry is unavailable with reason `fetch-failed`
- **AND** the other lines are available

#### Scenario: provider has no bars for a line

- **WHEN** the provider answers `no_data` for an analyzed line
- **THEN** that line's entry is unavailable with reason `no-provider-bars`

#### Scenario: invalid bars

- **WHEN** a fetched line contains two bars for the same session
- **THEN** that line's entry is unavailable with reason `invalid-bars`

### Requirement: the command logs progress and exits with the run's outcome

The `analyze` command SHALL log each progress report as it arrives through the Observatory logger: structured JSON in production, readable lines locally. Each analyzed line SHALL be logged exactly once with its position, its Trading Line ID and its outcome: `available` with its last session, Event count and number of Large One-Session Moves, or `unavailable` with its reason. An available line with Large One-Session Moves SHALL also show each one's session and close ratio, and the entry SHALL be a warning, because an unlisted Corporate Action surfaces this way. An available or `insufficient-liquidity` line with Corporate Actions SHALL also show each one's ex-date and status, and the entry SHALL be a warning when any of them is skipped for a reason other than `outside-window`:

- `step-not-observed` SHALL also show its observed close ratio and tell the reader to check the history before removing the entry: the provider may no longer need the entry, or a real move may have hidden the step.
- `price-step-observed` SHALL also show its observed close ratio and tell the reader to check whether the provider adjusted the price: if it did not, the entry needs `prices-and-volume`; a real move on the ex-date gives the same status.
- `volume-rescale-suspected` SHALL also show the share factor and say that every earlier volume read is a multiple of it, so the provider may already have rescaled the volume, and tell the reader to check the history before removing the entry.

A line whose Corporate Actions are all `applied` or `outside-window`, with no other reason to warn, SHALL log at info. An `insufficient-liquidity` line SHALL also show its participation and median daily traded value; other unavailable reasons SHALL show the line's message and log as warnings. When the latest MEP Rate session is before the Requested-Through Session, which happens on a holiday or when the provider has not yet published the session, the command SHALL log a warning naming both dates. A successful run SHALL end with one entry giving the available and unavailable counts, how many available lines end before the latest MEP Rate session, the snapshot locations and the run's duration.

Every failure, whether an invalid invocation, a run failure or an unexpected error, SHALL be logged as one error entry whose message starts with `Analysis Run failed:`; for a run failure it SHALL contain the failure reason. Logs SHALL NOT contain the storage configuration's credentials.

The command SHALL exit with status `0` after a snapshot is written and with a non-zero status otherwise. The process SHALL NOT stay alive after the run ends, so that a scheduler that waits for it to exit can start the next run.

The run SHALL have a deadline, 30 minutes by default. A run still unfinished at the deadline SHALL be logged as a failure with reason `deadline-exceeded` and the process SHALL exit non-zero, even if a request is still pending. Railway skips a cron run while the previous one is still running, so a hung request would otherwise block every later run.

#### Scenario: line outcomes

- **WHEN** a run analyzes an available line, a line excluded by the liquidity gate and a line that fails to fetch
- **THEN** the log has, in order, `[1/3] <id>: available (last session ..., N events, M large moves)`, `[2/3] <id>: unavailable: insufficient-liquidity (participation ..., median ...)` and a warning `[3/3] <id>: unavailable: fetch-failed (...)`

#### Scenario: a Corporate Action whose step is not observed

- **WHEN** an available line's Corporate Action is `step-not-observed`
- **THEN** its entry is a warning that names the ex-date, `step-not-observed` and the observed close ratio, and asks for the history to be checked before the entry is removed

#### Scenario: a volume-only Corporate Action whose price shows a step

- **WHEN** an available or `insufficient-liquidity` line's Corporate Action is `price-step-observed`
- **THEN** its entry is a warning that names the ex-date, `price-step-observed` and the observed close ratio, and asks whether the provider adjusted the price

#### Scenario: a volume-only Corporate Action whose volume may be rescaled

- **WHEN** a line's Corporate Action is `volume-rescale-suspected`
- **THEN** its entry is a warning that names the ex-date, `volume-rescale-suspected` and the share factor, and says the provider may already have rescaled the volume

#### Scenario: an applied Corporate Action

- **WHEN** an available line's only Corporate Action is `applied` and the line has no Large One-Session Move or dropped bar
- **THEN** its entry logs at info and names the ex-date and `applied`

#### Scenario: a Large One-Session Move

- **WHEN** an available line has a Large One-Session Move on 2025-06-02
- **THEN** its entry is a warning that names 2025-06-02 and the move's close ratio

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

### Requirement: confirmed Corporate Actions are corrected before analysis

After a line's bars are validated and found non-empty, the run SHALL apply that line's entries from the committed Corporate Action list with `applyCorporateActions`, before liquidity eligibility, dollarization, State and Events. Every later step SHALL read the corrected peso bars. The MEP rate source lines SHALL NOT be corrected. The list SHALL be replaceable through the runner options, defaulting to the committed list. Creating the runner SHALL fail when any action, from the committed or an injected list, names a Trading Line the run does not analyze, such as a dollar line, a MEP rate source line or a line missing from the catalog: such an action would never be applied or reported.

Each available or `insufficient-liquidity` line SHALL record `corporateActions`: one outcome for each of its Corporate Actions, from the corporate-actions module: `{ tradingLineId, exDate, correction: 'prices-and-volume', kind, priceFactor, sourceUrl, status, observedCloseRatio }` with the status `applied`, `step-not-observed` or `outside-window`, or `{ tradingLineId, exDate, correction: 'volume', kind, shareFactor, sourceUrl, status, observedCloseRatio }` with the status `applied`, `price-step-observed`, `volume-rescale-suspected` or `outside-window`. A line with no Corporate Action SHALL record an empty list.

A `volume` correction changes only volume, which only the liquidity gate reads, so it can change whether a line is eligible and nothing else. Liquidity eligibility SHALL read the corrected volume.

#### Scenario: an unadjusted share distribution is corrected

- **WHEN** the provider serves a line whose prices before an ex-date are twice the corrected level, with half the volume, and the list has a factor-0.5 entry for it
- **THEN** the line's `corporateActions` lists the entry as `applied`
- **AND** its Events, Large One-Session Moves and latest State equal those of the same line served already adjusted
- **AND** no Structure Break, Volatility Expansion or Large One-Session Move is recorded on the ex-date

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

### Requirement: snapshots are persisted as a dated object and as latest

A successful run SHALL write the snapshot as JSON to the S3-compatible bucket used for Bar History under two keys:

- dated: `analysis-snapshots/v5/<requestedThroughSession>/<ranAt>.json`
- latest: `analysis-snapshots/v5/latest.json`

The `v5` in the key prefix SHALL equal the snapshot's `schemaVersion`, so a reader of one schema never finds another schema's object under the keys it reads. Objects written under an earlier prefix SHALL be left in place.

The dated object SHALL be written first. `latest` SHALL be written only after the dated object was written. A failed write SHALL fail the run with reason `snapshot-write-failed`. Each successful run SHALL replace `latest`.

#### Scenario: dated and latest objects

- **WHEN** a run for 2026-10-02 completes at 2026-10-04T15:00:00.000Z
- **THEN** the snapshot is written to `analysis-snapshots/v5/2026-10-02/2026-10-04T15:00:00.000Z.json` and to `analysis-snapshots/v5/latest.json`

#### Scenario: dated write fails

- **WHEN** writing the dated object fails
- **THEN** `latest` is not written and the run fails with reason `snapshot-write-failed`
