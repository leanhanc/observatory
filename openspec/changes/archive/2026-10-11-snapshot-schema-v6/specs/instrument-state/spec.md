## RENAMED Requirements

- FROM: `### Requirement: fixed v1 Analysis Configuration`
- TO: `### Requirement: fixed Analysis Configuration`

## MODIFIED Requirements

### Requirement: one Instrument State per session

The instrument-state module SHALL expose a pure `calculateInstrumentStates(bars)` that returns one Instrument State per input completed `DailyBar`, in input order. Each State SHALL contain the bar's `sessionDate`, `regime`, `structure`, `rsi`, `priceRelativeToEmaInAtr` and `priceRelativeToLongTermEmaInPercent`, and nothing else. Input SHALL be the validated, chronological Daily Bars of one Trading Line; for peso lines these are the bars of a Dollarized Series. Empty input SHALL return an empty result. The calculation SHALL NOT mutate its input, SHALL NOT perform I/O and SHALL NOT validate or sort its input.

A State SHALL exist for every input bar regardless of how much history precedes it. No part SHALL be required for a State to exist.

#### Scenario: one State per bar

- **WHEN** States are calculated for a history of Daily Bars
- **THEN** the result has one State per bar
- **AND** each State carries the session date of the bar at the same position

#### Scenario: empty history

- **WHEN** no bars are supplied
- **THEN** the result is empty

#### Scenario: input remains unchanged

- **WHEN** States are calculated from frozen input bars
- **THEN** calculation succeeds without mutating the bars

#### Scenario: short history still has States

- **WHEN** a history has 30 bars
- **THEN** every session has a State
- **AND** later sessions report RSI and price relative to EMA while Regime, Structure and price relative to the long-term EMA are unavailable

### Requirement: fixed Analysis Configuration

The Instrument State SHALL use the project-wide Analysis Configuration settings RSI(14), EMA(20), ATR(14) and a long-term EMA(200). These settings SHALL NOT be caller parameters. The long-term EMA period SHALL be the Instrument State's own setting, not Regime's, even though both are 200: each concept owns its periods. Regime and Structure SHALL use their own settings from the same Analysis Configuration unchanged. The module SHALL reuse the technical-analysis calculations and SHALL NOT duplicate indicator math.

#### Scenario: warm-up follows the configured periods

- **WHEN** States are calculated for 30 rising bars
- **THEN** `rsi` is `null` at positions 0 through 13 and readable from position 14
- **AND** `priceRelativeToEmaInAtr` is `null` at positions 0 through 18 and readable from position 19

#### Scenario: long-term EMA warm-up

- **WHEN** States are calculated for 201 rising bars
- **THEN** `priceRelativeToLongTermEmaInPercent` is `null` at positions 0 through 198 and readable from position 199

### Requirement: Events are not part of the State

The Instrument State SHALL NOT contain Structure Break, Regime Transition, Volatile Session or any other Event, nor a lookback over recent Events. Events remain separate outputs.

#### Scenario: State has only its parts

- **WHEN** a State is calculated for a session with a Structure Break Event
- **THEN** the State contains only `sessionDate`, `regime`, `structure`, `rsi`, `priceRelativeToEmaInAtr` and `priceRelativeToLongTermEmaInPercent`

## ADDED Requirements

### Requirement: price relative to the long-term EMA in percent

`priceRelativeToLongTermEmaInPercent` SHALL equal `(close − EMA200) / EMA200 × 100` for the session: the close's distance from its 200-session exponential average, in percent of that average. It SHALL be positive when the close is above EMA(200) and negative when below; `-4.2` means the close is 4.2% below its average. The value SHALL NOT be rounded; rounding belongs to presentation. It SHALL be `null` while EMA(200) is unavailable under the EMA warm-up rule, when EMA(200) is zero, or when the result is not finite. It SHALL NOT be `0` or any other value while unavailable.

Regime already compares the close with EMA(200), the most widely watched long-term trend reference, but categorically: its proposal reads only which side of a band of half an ATR(14) around EMA(200) the close is on, together with the side EMA(50) is on. This part adds the magnitude of the close's distance from that average, which Regime's categorical reading does not show: a close just clearing the band and one stretched far above it have the same Regime. It is a description, not a signal: being near or far from the average does not by itself say what happens next.

Percent is used rather than ATR units because distance from a long-term average is conventionally read as a percentage, and because a percentage compares across lines with different volatility without a second measurement in the denominator.

#### Scenario: Feature value

- **WHEN** a session's close is 95 and its EMA(200) is 100
- **THEN** `priceRelativeToLongTermEmaInPercent` is `-5`

#### Scenario: equals the EMA calculation

- **WHEN** States are calculated for a history with at least 200 bars
- **THEN** each readable `priceRelativeToLongTermEmaInPercent` equals `(close − EMA200) / EMA200 × 100` with EMA(200) of that history's closes at the same position

#### Scenario: unavailable until EMA(200) is readable

- **WHEN** a history has 199 bars
- **THEN** every State's `priceRelativeToLongTermEmaInPercent` is `null`

#### Scenario: close on its average

- **WHEN** a flat history of 200 equal closes is calculated
- **THEN** the last State's `priceRelativeToLongTermEmaInPercent` is a number within floating-point error of `0`, not `null`

#### Scenario: prefix replay

- **WHEN** States are calculated for a history longer than 200 bars and for each prefix of that history
- **THEN** each prefix's last `priceRelativeToLongTermEmaInPercent` equals the full-history value at the same position
