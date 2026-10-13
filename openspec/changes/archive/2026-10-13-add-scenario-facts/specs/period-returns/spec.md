## ADDED Requirements

### Requirement: period returns over windows of Market Sessions

The period-returns module SHALL expose a pure `calculatePeriodReturns(bars, marketSessionDates)` that measures the percent change of the close over each window in `ANALYSIS_CONFIGURATION.periodReturns.windowMarketSessions` (21, 63 and 252), as of the last input bar. `bars` SHALL be the validated, chronological Daily Bars of one Trading Line; for peso lines, the bars of a Dollarized Series, so the change is in MEP dollars. `marketSessionDates` SHALL be the chronological dates of the Market Sessions, the sessions that have a MEP Rate. The windows SHALL NOT be caller parameters. The calculation SHALL NOT mutate its input and SHALL NOT perform I/O.

It SHALL return one `{ windowMarketSessions, fromSessionDate, percentChange }` per configured window, in configuration order:

- The anchor SHALL be the last bar's session, and its position the anchor's index in `marketSessionDates`.
- The start session SHALL be the Market Session `windowMarketSessions` positions before the anchor.
- The start bar SHALL be the last bar whose session is on or before the start session. When the line did not trade on the start session, it is the last close known by then.
- `fromSessionDate` SHALL be the start bar's session.
- `percentChange` SHALL be `(anchor close − start close) / start close × 100`, unrounded. It is positive for a rise and negative for a fall.

Counting Market Sessions rather than the line's own bars makes a window span the same dates for every line, as Liquidity Eligibility does.

Both `fromSessionDate` and `percentChange` SHALL be `null` when:

- there are no bars;
- the anchor is not a Market Session;
- fewer than `windowMarketSessions` Market Sessions precede the anchor;
- no bar is on or before the start session;
- the start close is zero;
- the result is not finite.

They SHALL NOT be `0` or any other value while unavailable. A readable change of exactly `0` SHALL be `0`.

A period return describes how far the close moved over the window. It does not say why, and it predicts nothing.

#### Scenario: a window with a bar on its start session

- **WHEN** the last bar closes at 110 and the line closed at 100 on the Market Session 21 positions earlier
- **THEN** the 21-session return has that session as `fromSessionDate` and `percentChange` `10`

#### Scenario: the line did not trade on the start session

- **WHEN** the line has no bar on the window's start session, and its last bar before it closed at 80
- **THEN** that return uses the close of 80 and that earlier bar's session as `fromSessionDate`

#### Scenario: Market Sessions, not bars, are counted

- **WHEN** a line skipped 5 of the last 21 Market Sessions
- **THEN** its 21-session return starts at the Market Session 21 positions before the anchor, not 21 bars back

#### Scenario: not enough history

- **WHEN** the line's first bar is after the 252-session window's start session, or fewer than 252 Market Sessions precede the anchor
- **THEN** the 252-session return has `fromSessionDate` and `percentChange` `null`
- **AND** shorter windows that have a start bar are still measured

#### Scenario: no change is a measurement

- **WHEN** the anchor close equals the start close
- **THEN** `percentChange` is `0`, not `null`

#### Scenario: causal

- **WHEN** returns are calculated for a history truncated at a session and its Market Sessions truncated at the same session
- **THEN** they depend only on bars and Market Sessions on or before that session
