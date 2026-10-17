## ADDED Requirements

### Requirement: a line's candles in each display currency

The chart-series module SHALL expose a pure `buildChartSeries({ pesoBars, mepRates, cclRates, throughSessionDate })` that returns `{ peso, mep, ccl }`, three chronological lists of candles `{ sessionDate, open, high, low, close }` for one Trading Line, for drawing Candlesticks. `pesoBars` SHALL be the line's validated Daily Bars after Corporate Action correction; `mepRates` and `cclRates` the run's rates by session; `throughSessionDate` the latest State's session. It SHALL NOT mutate its input and SHALL NOT perform I/O. No analysis SHALL read a Chart Series: it is for display only.

Each list SHALL cover the sessions on or after the start date and on or before `throughSessionDate`. The start date SHALL be `throughSessionDate` minus `ANALYSIS_CONFIGURATION.chartSeries.historyMonths` calendar months; when that day does not exist in the target month, it SHALL be that month's last day. The window SHALL NOT be a caller parameter.

- `peso` SHALL hold each corrected peso bar's open, high, low and close, for every corrected peso bar in the window, whether or not its session has a MEP Rate.
- `mep` SHALL hold, for each session in the window that has a MEP Rate, the corrected peso bar's four prices each divided by that session's MEP Rate with `dollarizePrice`: the Dollarized Series bar.
- `ccl` SHALL hold, for each session in the window that has a CCL Rate, the corrected peso bar's four prices each divided by that session's CCL Rate with `toCclEquivalent`.

A session without a MEP Rate SHALL be missing from `mep`, and one without a CCL Rate from `ccl`. No other session's rate, no other currency's rate and no `0` SHALL stand in for a missing rate, and no candle SHALL be carried from a neighboring session. Volume SHALL NOT be included.

#### Scenario: the window is two calendar years

- **WHEN** `historyMonths` is 24, `throughSessionDate` is 2026-10-13 and the line has bars from 2023-01-02
- **THEN** each list starts at the first of its sessions on or after 2024-10-13 and ends on or before 2026-10-13

#### Scenario: a month end

- **WHEN** `throughSessionDate` is 2028-02-29 and `historyMonths` is 24
- **THEN** the start date is 2026-02-28, since 2026 has no 29 February

#### Scenario: the series end on the State's session

- **WHEN** the latest State's session is 2026-10-13 and the line also has a peso bar on 2026-10-14, a session without a MEP Rate
- **THEN** no list has a candle for 2026-10-14

#### Scenario: a session without a MEP Rate

- **WHEN** 2026-09-09 has a corrected peso bar, no MEP Rate and a CCL Rate
- **THEN** `peso` has a candle for 2026-09-09
- **AND** `mep` has none, and `ccl` has a candle for 2026-09-09 at that session's CCL Rate

#### Scenario: a session without a CCL Rate

- **WHEN** 2026-09-09 has a corrected peso bar and a MEP Rate, and AL30C did not trade that session while it traded on 2026-09-08 and 2026-09-10
- **THEN** `peso` and `mep` have a candle for 2026-09-09
- **AND** `ccl` has no candle for 2026-09-09, and its candles for 2026-09-08 and 2026-09-10 use their own sessions' CCL Rates

#### Scenario: each session at its own rates

- **WHEN** a peso bar of 2026-10-13 is open 5880, high 6000, low 5800 and close 5940, with a MEP Rate of 1500 and a CCL Rate of 1600
- **THEN** its `mep` candle is open 3.92, high 4, low 3.8666…, close 3.96
- **AND** its `ccl` candle is open 3.675, high 3.75, low 3.625, close 3.7125

#### Scenario: corrected for a Corporate Action

- **WHEN** the line had a 1:10 split inside the window, applied by the Corporate Action correction
- **THEN** every list's candles before the split are the corrected ones, with no price step at the split

#### Scenario: a run without CCL Rates

- **WHEN** `cclRates` is empty
- **THEN** `ccl` is empty and `peso` and `mep` are unchanged

#### Scenario: input remains unchanged

- **WHEN** the series are built from frozen bars and rates
- **THEN** building succeeds without mutating them
