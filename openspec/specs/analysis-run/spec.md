# analysis-run Specification

## Purpose

Run the canonical analysis once for every analyzed Trading Line through a completed Requested-Through Session and persist the result as an Analysis Snapshot that public pages read. This capability fetches fresh provider history, drops invalid bars of analyzed lines, corrects confirmed Corporate Actions, dollarizes it, analyzes only liquidity-eligible lines, reuses the existing State and Event calculations and flags Large One-Session Moves. Its only measurement of its own is each line's liquidity eligibility, from the liquidity-eligibility capability. It does not use stored Bar Histories. The `analyze` command defaults to the previous Buenos Aires date and is run by a Railway cron job declared in `.railway/railway.ts`.

## Requirements

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

Each fetched line SHALL be validated before use: an analyzed line by dropping its invalid bars and validating the rest as a chronological Daily Bar history, and a MEP rate source line as a whole. Each analyzed line SHALL be corrected for its confirmed Corporate Actions and then dollarized with the MEP rates calculated from the run's MEP rate source lines, and the resulting Dollarized Series SHALL be analyzed with `calculateInstrumentStates`, `detectRegimeTransitionEvents`, `detectStructureBreakEvents`, `detectVolatilityExpansionEvents` and `detectLargeOneSessionMoves`. The only other measurement the run SHALL calculate is each line's liquidity eligibility, with the liquidity-eligibility module.

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
- `events`: every Event detected in the analyzed window, each as `{ sessionDate, event, coincidesWithLargeMove }`, where `event.type` is the Event kind (`regime-transition`, `structure-break` or `volatility-expansion`). Events SHALL be ordered by `sessionDate`; Events of the same session SHALL follow that kind order.
- `largeMoves`: the Large One-Session Moves in the analyzed window.
- `corporateActions`: the line's Corporate Actions and whether each was applied.
- `window`: the first and last session dates and the bar count of the Dollarized Series that was analyzed.
- `sessionsWithoutMepRate`: the peso-line sessions that had no MEP Rate and therefore no dollarized bar.
- `rangeRepairSessions`: the peso-line sessions whose range the adapter widened.
- `droppedBarSessions`: the peso-line sessions whose invalid bar was dropped.

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

### Requirement: an analyzed line can fail without failing the run

When an analyzed Trading Line cannot be fetched, has no valid Daily Bar history after its invalid bars are dropped, has no provider bars, has no dollarized bar, or is not liquidity-eligible, its entry SHALL have `status: 'unavailable'`, `instrumentId`, `tradingLineId`, a `reason` of `fetch-failed`, `invalid-bars`, `no-provider-bars`, `no-dollarized-bars` or `insufficient-liquidity`, and a `message`. A `no-dollarized-bars` or `insufficient-liquidity` entry SHALL also carry `droppedBarSessions` and `rangeRepairSessions`. `invalid-bars` means the kept bars are not a chronological history, or every bar was dropped; `no-provider-bars` means the provider answered with no bars; `no-dollarized-bars` means the line had valid bars but none on a session with a MEP Rate; `insufficient-liquidity` means the line failed the liquidity-eligibility gate, and only that entry also carries `liquidity`. It SHALL NOT have a State or Events. The other lines SHALL still be analyzed.

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

### Requirement: the run fails without usable MEP rates or without any analyzed line

The run SHALL fail and write nothing when either MEP rate source line cannot be fetched or fails validation, or when the two lines yield no MEP Rate. No analyzed line can be dollarized without them.

The run SHALL also fail with reason `insufficient-market-sessions` and write nothing when the MEP Rates on or before the Requested-Through Session are fewer than the liquidity window's 125 sessions. Every line shares that window, so no line's eligibility could be measured. In both cases no analyzed line SHALL be fetched. The run SHALL also fail and write nothing when no analyzed line is available, so that a snapshot made only of failures is never published.

#### Scenario: MEP source fetch fails

- **WHEN** the provider returns an error for AL30D
- **THEN** the run fails with reason `mep-rate-source-unavailable`
- **AND** no snapshot is written

#### Scenario: every analyzed line fails

- **WHEN** the MEP rate source succeeds and every analyzed line fails
- **THEN** the run fails with reason `no-analyzed-lines`
- **AND** no snapshot is written

#### Scenario: too few market sessions

- **WHEN** the MEP rate source yields MEP Rates for only 124 sessions through the Requested-Through Session
- **THEN** the run fails with reason `insufficient-market-sessions`
- **AND** no analyzed line is fetched and no snapshot is written

### Requirement: only liquidity-eligible lines are analyzed

After a line passes the existing checks (fetched, valid bars, provider bars, at least one dollarized bar), the run SHALL measure its liquidity eligibility with the liquidity-eligibility module, at the run's last market session: the latest session with a MEP Rate on or before the Requested-Through Session, which is `mepRateSource.latestRateSessionDate`. The window SHALL be selected once from the run's MEP Rates and shared by every line. Eligibility SHALL be evaluated only at that session; the run SHALL NOT record eligibility for earlier sessions. Because that one judgement selects which lines publish their whole Event history, a snapshot's Events are not a causal sample: an Event from a session when the line was not yet eligible appears, and the Events of lines that later became ineligible do not. Snapshot Events SHALL NOT be used as a sample for evidence without per-session eligibility.

An eligible line SHALL be analyzed as before, over its whole Dollarized Series. An ineligible line SHALL be recorded as unavailable with reason `insufficient-liquidity`, a `message`, and `liquidity: { participation, medianDailyTradedValueUsd }` holding both measured values. A median of `null` SHALL be recorded as `null`. An ineligible line SHALL have no State or Events.

A line that fails an earlier check SHALL keep that earlier, more specific reason and SHALL NOT be measured.

#### Scenario: an illiquid line is recorded with its measures

- **WHEN** a line trades on every window session with a median daily traded value of USD 20,000
- **THEN** its entry is unavailable with reason `insufficient-liquidity` and `liquidity` `{ participation: 1, medianDailyTradedValueUsd: 20000 }`
- **AND** the other lines are still analyzed

#### Scenario: a recently listed line is not analyzed

- **WHEN** a line has traded on every session of the last 30 market sessions only
- **THEN** its entry is unavailable with reason `insufficient-liquidity` and participation 30/125

#### Scenario: eligibility uses the run's last market session

- **WHEN** the provider serves bars and MEP Rates after the Requested-Through Session on which an otherwise ineligible line trades heavily
- **THEN** that line is still unavailable with reason `insufficient-liquidity`

#### Scenario: a line without provider bars keeps its reason

- **WHEN** the provider answers `no_data` for an analyzed line
- **THEN** its entry is unavailable with reason `no-provider-bars`, not `insufficient-liquidity`

### Requirement: the command defaults to the previous market date

The `analyze` command SHALL accept an optional `--through-session YYYY-MM-DD`. When it is given, it SHALL be the Requested-Through Session. When it is omitted, the Requested-Through Session SHALL be the calendar date immediately before the current date in `America/Argentina/Buenos_Aires`, with the current date taken from the command's clock.

The default is a calendar date, not a known trading session. When no session traded on it, the run SHALL proceed as for any other Requested-Through Session: it analyzes through the latest bar on or before that date, `requestedThroughSession` records the requested date, and a successful run replaces `latest`.

#### Scenario: weekday morning

- **WHEN** the command runs without `--through-session` at 2026-10-07T09:00:00Z, a Wednesday
- **THEN** the Requested-Through Session is 2026-10-06

#### Scenario: Saturday morning

- **WHEN** the command runs without `--through-session` at 2026-10-10T09:00:00Z, a Saturday
- **THEN** the Requested-Through Session is 2026-10-09, the Friday

#### Scenario: 02:00 UTC is still the previous market day

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
- `mep-rate-source-fetched` once the MEP rate source yielded MEP Rates, with the Requested-Through Session and the latest MEP Rate session;
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

The `analyze` command SHALL log each progress report as it arrives through the Observatory logger: structured JSON in production, readable lines locally. Each analyzed line SHALL be logged exactly once with its position, its Trading Line ID and its outcome: `available` with its last session, Event count and number of Large One-Session Moves, or `unavailable` with its reason. An available line with Large One-Session Moves SHALL also show each one's session and close ratio, and the entry SHALL be a warning, because an unlisted Corporate Action surfaces this way. An available line with Corporate Actions SHALL also show each one's ex-date and status. When any of them is `step-not-observed`, the entry SHALL also show its observed close ratio, tell the reader to check the history before removing the entry, and be a warning: the provider may no longer need the entry, or a real move may have hidden the step. A line whose Corporate Actions are all `applied` or `outside-window`, with no other reason to warn, SHALL log at info. An `insufficient-liquidity` line SHALL also show its participation and median daily traded value; other unavailable reasons SHALL show the line's message and log as warnings. When the latest MEP Rate session is before the Requested-Through Session, which happens on a holiday or when the provider has not yet published the session, the command SHALL log a warning naming both dates. A successful run SHALL end with one entry giving the available and unavailable counts, how many available lines end before the latest MEP Rate session, the snapshot locations and the run's duration.

Every failure, whether an invalid invocation, a run failure or an unexpected error, SHALL be logged as one error entry whose message starts with `Analysis Run failed:`; for a run failure it SHALL contain the failure reason. Logs SHALL NOT contain the storage configuration's credentials.

The command SHALL exit with status `0` after a snapshot is written and with a non-zero status otherwise. The process SHALL NOT stay alive after the run ends, so that a scheduler that waits for it to exit can start the next run.

The run SHALL have a deadline, 30 minutes by default. A run still unfinished at the deadline SHALL be logged as a failure with reason `deadline-exceeded` and the process SHALL exit non-zero, even if a request is still pending. Railway skips a cron run while the previous one is still running, so a hung request would otherwise block every later run.

#### Scenario: line outcomes

- **WHEN** a run analyzes an available line, a line excluded by the liquidity gate and a line that fails to fetch
- **THEN** the log has, in order, `[1/3] <id>: available (last session ..., N events, M large moves)`, `[2/3] <id>: unavailable: insufficient-liquidity (participation ..., median ...)` and a warning `[3/3] <id>: unavailable: fetch-failed (...)`

#### Scenario: a Corporate Action whose step is not observed

- **WHEN** an available line's Corporate Action is `step-not-observed`
- **THEN** its entry is a warning that names the ex-date, `step-not-observed` and the observed close ratio, and asks for the history to be checked before the entry is removed

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

Each available line SHALL record `corporateActions`: one `{ tradingLineId, exDate, kind, priceFactor, sourceUrl, status, observedCloseRatio }` for each of its Corporate Actions, with the status `applied`, `step-not-observed` or `outside-window` from the corporate-actions module. A line with no Corporate Action SHALL record an empty list.

#### Scenario: an unadjusted share distribution is corrected

- **WHEN** the provider serves a line whose prices before an ex-date are twice the corrected level, with half the volume, and the list has a factor-0.5 entry for it
- **THEN** the line's `corporateActions` lists the entry as `applied`
- **AND** its Events, Large One-Session Moves and latest State equal those of the same line served already adjusted
- **AND** no Structure Break, Volatility Expansion or Large One-Session Move is recorded on the ex-date

#### Scenario: the provider already adjusted the history

- **WHEN** the list has a factor-0.5 entry for a line whose fetched prices show no step at the ex-date
- **THEN** the line's `corporateActions` lists the entry as `step-not-observed`
- **AND** its analysis equals the analysis without the entry

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

- **WHEN** a line's dollarized close doubles on one session and a Volatility Expansion is detected on it
- **THEN** `largeMoves` lists that session with `closeRatio` 2
- **AND** that Event has `coincidesWithLargeMove: true`, and every Event on another session has `false`
- **AND** the line is available

#### Scenario: the flag uses each session's own MEP Rate

- **WHEN** a peso close is unchanged across two sessions while the MEP Rate halves
- **THEN** the dollarized close doubles and the session is flagged with `closeRatio` 2

### Requirement: invalid bars of an analyzed line are dropped and recorded

Each fetched bar of an analyzed line SHALL be validated on its own as a Daily Bar, after the adapter's range repairs. A bar that fails, for example with a non-positive price or a close outside its high–low range beyond the repair tolerance, SHALL be dropped: it SHALL NOT be corrected, dollarized, measured for liquidity or analyzed, and no value SHALL be invented in its place. The remaining bars SHALL then be validated as a chronological Daily Bar history. When they are not one, for example because two bars share a session or sessions are out of order, the line SHALL be unavailable with reason `invalid-bars`. When the provider served bars but every bar was dropped, the line SHALL be unavailable with reason `invalid-bars`.

A dropped session SHALL be treated like a session on which the line did not trade: it has no dollarized bar, it counts as not traded for liquidity eligibility, and the next kept bar is compared with the previous kept bar. Counting it as not traded is a deliberate, conservative choice: the run does not know whether or how much the line traded that session, so it does not credit the line with liquidity it cannot measure. A bar the adapter repaired within its tolerance is a valid bar and SHALL be kept.

The number of dropped bars SHALL NOT be capped. Inside the liquidity window, drops lower participation, so enough of them make the line `insufficient-liquidity`. Outside it, nothing limits them: a line can stay available after losing any number of earlier bars, which is an accepted limitation that `droppedBarSessions` makes visible.

Every entry whose bars passed validation, that is every available entry and every `no-dollarized-bars` or `insufficient-liquidity` entry, SHALL record `droppedBarSessions`: the session dates of its dropped bars, in input order, empty when none was dropped, and `rangeRepairSessions`: the sessions whose range the adapter widened. The `analyze` command SHALL log a line with dropped bars as a warning, in its single line entry, with the number of dropped bars, `1 dropped bar` or `N dropped bars`. That includes an `insufficient-liquidity` line, which otherwise logs at info: its drops may be why it missed the participation floor, so its failure may be a data problem rather than market behavior.

The MEP rate source lines SHALL NOT drop bars; their validation is unchanged.

#### Scenario: a close outside the range drops one bar

- **WHEN** an analyzed line's bar on 2025-01-17 has a close 1.2% below its low and every other bar is valid
- **THEN** the line is available
- **AND** its `droppedBarSessions` is `['2025-01-17']`
- **AND** its window has one bar fewer, and no Event or Large One-Session Move is on 2025-01-17

#### Scenario: placeholder bars before a line traded

- **WHEN** an analyzed line's first ten bars have open, high, low, close and volume all `0`
- **THEN** those ten sessions are dropped and recorded, and the line is analyzed from its first valid bar

#### Scenario: a dropped session lowers participation

- **WHEN** an otherwise fully traded line has one dropped bar inside the liquidity window
- **THEN** its participation is 124/125

#### Scenario: drops push a line below the participation floor

- **WHEN** an otherwise eligible line has thirteen dropped bars inside the liquidity window
- **THEN** it is unavailable with reason `insufficient-liquidity` and participation 112/125
- **AND** its entry lists the thirteen sessions in `droppedBarSessions`
- **AND** its log entry is a warning that names thirteen dropped bars

#### Scenario: a repaired bar is kept

- **WHEN** an analyzed line's close sits 0.5% above its high, within the adapter's repair tolerance
- **THEN** the session is listed in `rangeRepairSessions`, not in `droppedBarSessions`
- **AND** the line's window has the same number of bars as without the defect

#### Scenario: a duplicate session still fails the line

- **WHEN** the provider serves two bars for the same session on an analyzed line
- **THEN** the line is unavailable with reason `invalid-bars`

#### Scenario: every bar is invalid

- **WHEN** every bar of an analyzed line has a zero close
- **THEN** the line is unavailable with reason `invalid-bars`, not `no-provider-bars`

#### Scenario: the MEP rate source does not drop bars

- **WHEN** an AL30D bar has a close above its high beyond the repair tolerance
- **THEN** the run fails with reason `mep-rate-source-unavailable`

#### Scenario: a dropped bar is logged

- **WHEN** an available line has one dropped bar
- **THEN** its log entry is a warning that ends with `1 dropped bar`
