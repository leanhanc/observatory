## MODIFIED Requirements

### Requirement: period returns over calendar months

The period-returns module SHALL expose a pure `calculatePeriodReturns(sessionCloses)` that measures the percent change of the close over each window in `ANALYSIS_CONFIGURATION.periodReturns.windowMonths` (1, 3 and 12), as of the last input session. `sessionCloses` SHALL be one Trading Line's chronological sessions, each `{ sessionDate, close }`, in one currency; validated Daily Bars qualify. A `close` MAY be `null`: the session belongs to the series' calendar but has no price in that currency, such as a session without a CCL Rate when the series is in CCL dollars. The windows SHALL NOT be caller parameters. The calculation SHALL NOT mutate its input and SHALL NOT perform I/O.

The currency is the caller's: for peso lines, the run passes the Dollarized Series for MEP dollars, the corrected peso closes of the same sessions for pesos, and those peso closes divided by each session's CCL Rate for CCL dollars. The module neither converts nor knows the currency.

The two rates are missing differently, so the run's three series do not treat a missing rate alike:

- A session without a MEP Rate has no bar in the Dollarized Series, so it is in none of the three series: the run builds the peso and CCL series on the Dollarized Series' sessions. A window whose start date falls on it starts on the previous session in all three currencies, which keeps their windows on the same sessions.
- A session without a CCL Rate keeps its place in the CCL series with a `null` close, so a CCL return that starts or ends on it is `null` while the MEP and peso returns over the same window are measured.

It SHALL return one `{ windowMonths, fromSessionDate, percentChange }` per configured window, in configuration order:

- The anchor SHALL be the last input session.
- The start date SHALL be the anchor's date minus `windowMonths` calendar months. When that day does not exist in the target month, the start date SHALL be that month's last day: 2026-03-31 minus one month is 2026-02-28.
- The start session SHALL be the last input session on or before the start date. When the start date was not a session, or the line did not trade on it, the start close is the last close known by then.
- `fromSessionDate` SHALL be the start session.
- `percentChange` SHALL be `(anchor close − start close) / start close × 100`, unrounded. It is positive for a rise and negative for a fall.

Calendar months make "a month", "three months" and "a year" mean what a reader and a broker mean by them, whatever the number of sessions in between. Counting a fixed number of sessions does not: BYMA has fewer sessions a year than the 252 of the US convention, so 252 sessions reach about two weeks past a year.

Both `fromSessionDate` and `percentChange` SHALL be `null` when:

- there are no sessions;
- no session is on or before the start date;
- the anchor's close or the start close is `null`;
- the start close is zero;
- the result is not finite.

A `null` close SHALL NOT be skipped: when the start session's close is `null`, the return is unavailable, and no earlier or later session's close stands in for it. They SHALL NOT be `0` or any other value while unavailable. A readable change of exactly `0` SHALL be `0`.

A period return describes how far the close moved over the window. It does not say why, and it predicts nothing.

#### Scenario: a month back to a session

- **WHEN** the last bar is on 2026-10-09 and closes at 110, and the line closed at 100 on 2026-09-09
- **THEN** the one-month return has `fromSessionDate` 2026-09-09 and `percentChange` `10`

#### Scenario: the start date is not a session

- **WHEN** the last bar is on 2026-10-13 and 2026-09-13 is a Sunday, with the line's last earlier bar on 2026-09-11
- **THEN** the one-month return starts from the close of 2026-09-11, the close known on 2026-09-13
- **AND** a bar after the start date is never used as the start, even when it is closer to it

#### Scenario: a month end

- **WHEN** the last bar is on 2026-03-31
- **THEN** the one-month window starts on 2026-02-28

#### Scenario: a year is a calendar year

- **WHEN** the last bar is on 2026-10-09 and the line traded on 2025-10-09
- **THEN** the twelve-month return starts from the close of 2025-10-09, not from the close 252 sessions earlier

#### Scenario: not enough history

- **WHEN** the line's first bar is after the twelve-month window's start date
- **THEN** the twelve-month return has `fromSessionDate` and `percentChange` `null`
- **AND** shorter windows that have a start bar are still measured

#### Scenario: no change is a measurement

- **WHEN** the anchor close equals the start close
- **THEN** `percentChange` is `0`, not `null`

#### Scenario: causal

- **WHEN** returns are calculated for a history truncated at a session
- **THEN** they depend only on bars on or before that session

#### Scenario: the start session has no close in the currency

- **WHEN** the one-month window starts on 2026-09-09, the series has a session on 2026-09-09 whose close is `null` and a session on 2026-09-08 that closed at 100
- **THEN** the one-month return has `fromSessionDate` and `percentChange` `null`
- **AND** the close of 2026-09-08 is not used

#### Scenario: the start date has no MEP Rate

- **WHEN** the run's one-month window starts on 2026-09-09, the line traded on 2026-09-09 and 2026-09-08, and only 2026-09-09 has no MEP Rate
- **THEN** the MEP, peso and CCL one-month returns all have `fromSessionDate` 2026-09-08
- **AND** none of them is `null` for the missing MEP Rate

#### Scenario: the anchor has no close in the currency

- **WHEN** the last session's close is `null`
- **THEN** every window's `fromSessionDate` and `percentChange` are `null`, even where the start close exists
