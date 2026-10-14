# period-returns Specification

## Purpose

Measure how far a Trading Line's close moved over fixed windows of Market Sessions (about a month, three months and a year), in MEP dollars for peso lines, as of the line's last bar. Windows count the MEP calendar rather than the line's own bars, so they span the same dates for every line. A return is a pure, causal measurement that is unavailable rather than zero when the history is too short; it says how far, not why, and predicts nothing.

## Requirements

### Requirement: period returns over calendar months

The period-returns module SHALL expose a pure `calculatePeriodReturns(bars)` that measures the percent change of the close over each window in `ANALYSIS_CONFIGURATION.periodReturns.windowMonths` (1, 3 and 12), as of the last input bar. `bars` SHALL be the validated, chronological Daily Bars of one Trading Line; for peso lines, the bars of a Dollarized Series, so the change is in MEP dollars. The windows SHALL NOT be caller parameters. The calculation SHALL NOT mutate its input and SHALL NOT perform I/O.

It SHALL return one `{ windowMonths, fromSessionDate, percentChange }` per configured window, in configuration order:

- The anchor SHALL be the last bar's session.
- The start date SHALL be the anchor's date minus `windowMonths` calendar months. When that day does not exist in the target month, the start date SHALL be that month's last day: 2026-03-31 minus one month is 2026-02-28.
- The start bar SHALL be the last bar whose session is on or before the start date. When the start date was not a session, or the line did not trade on it, the start close is the last close known by then.
- `fromSessionDate` SHALL be the start bar's session.
- `percentChange` SHALL be `(anchor close − start close) / start close × 100`, unrounded. It is positive for a rise and negative for a fall.

Calendar months make "a month", "three months" and "a year" mean what a reader and a broker mean by them, whatever the number of sessions in between. Counting a fixed number of sessions does not: BYMA has fewer sessions a year than the 252 of the US convention, so 252 sessions reach about two weeks past a year.

Both `fromSessionDate` and `percentChange` SHALL be `null` when:

- there are no bars;
- no bar is on or before the start date;
- the start close is zero;
- the result is not finite.

They SHALL NOT be `0` or any other value while unavailable. A readable change of exactly `0` SHALL be `0`.

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
