## ADDED Requirements

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

## MODIFIED Requirements

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
