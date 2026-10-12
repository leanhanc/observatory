# instrument-state Specification

## Purpose

Describe a Trading Line at the close of each completed session as one Instrument State: Regime, Structure, RSI, price relative to EMA in ATR units and price relative to the long-term EMA in percent, each either measured or explicitly unavailable. The State is a pure, causal description built from existing technical-analysis calculations; it holds no Events, labels, scores or recommendations.

## Requirements

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

### Requirement: unavailable parts are null

A measured part that cannot be evaluated for a session SHALL be `null`. Unavailable SHALL mean that the session lacks the history or a readable input the measurement needs. It SHALL NOT be represented as `0`, `NaN`, an infinite value, or a value carried from another session. A readable measurement of exactly `0` SHALL be reported as `0`, distinct from `null`.

#### Scenario: zero is a measurement, not a gap

- **WHEN** the close equals EMA(20) and ATR(14) is positive
- **THEN** `priceRelativeToEmaInAtr` is `0`, not `null`

### Requirement: Regime part

`regime` SHALL be the settled label `calculateRegime` reports for the same session: `bullish`, `bearish` or `mixed`. When `calculateRegime` reports the string `undefined`, meaning its measurements are unavailable, `regime` SHALL be `null`. `mixed` is a readable Regime and SHALL NOT be reported as `null`.

#### Scenario: Regime warm-up is unavailable

- **WHEN** a session precedes Regime's warm-up completion
- **THEN** its `regime` is `null`

#### Scenario: mixed Regime is readable

- **WHEN** `calculateRegime` reports `mixed` for a session
- **THEN** that State's `regime` is `mixed`

### Requirement: Structure part

`structure` SHALL be `null` when Market Structure reports `hasSwingPairs` false for the session, because Structure cannot yet be evaluated. Otherwise it SHALL be the classification `calculateMarketStructure` reports: `uptrend`, `downtrend`, `range`, or the string `undefined`. Once available, `undefined` is a reading meaning the last trend expired, and SHALL NOT be reported as `null`. The State SHALL NOT include newly confirmed swings, the defining swing level, or the distance from it.

#### Scenario: Structure warm-up is unavailable

- **WHEN** fewer than two confirmed swings of either kind exist by a session
- **THEN** that State's `structure` is `null`

#### Scenario: an expired trend is readable

- **WHEN** Market Structure reports `undefined` with `hasSwingPairs` true
- **THEN** that State's `structure` is `undefined`, not `null`

#### Scenario: available Structure matches Market Structure

- **WHEN** States and Market Structure are calculated for the same history
- **THEN** each available State's `structure` equals the Market Structure classification for that session

### Requirement: RSI part

`rsi` SHALL be the raw Wilder RSI(14) of closes for the session, or `null` when RSI reports no value. The State SHALL NOT label RSI as overbought, oversold or any other zone.

#### Scenario: RSI matches the indicator

- **WHEN** States are calculated for a history
- **THEN** each State's `rsi` equals RSI(14) of that history's closes at the same position

#### Scenario: flat history has no RSI

- **WHEN** the closes have never changed
- **THEN** every State's `rsi` is `null`, including after RSI's warm-up

### Requirement: price relative to EMA in ATR units

`priceRelativeToEmaInAtr` SHALL equal `(close − EMA20) / ATR14` for the session. It SHALL be positive when the close is above EMA(20) and negative when below. It SHALL be `null` when EMA(20) or ATR(14) is unavailable, when ATR(14) is zero, or when the result is not finite. The finite check is defensive: validated Daily Bars are not expected to produce a non-finite result.

#### Scenario: Feature value

- **WHEN** EMA(20) and ATR(14) are readable for a session
- **THEN** `priceRelativeToEmaInAtr` equals that session's close minus EMA(20), divided by ATR(14)

#### Scenario: zero ATR is unavailable

- **WHEN** every bar has equal open, high, low and close, so ATR(14) is zero
- **THEN** `priceRelativeToEmaInAtr` is `null` for every session

### Requirement: Events are not part of the State

The Instrument State SHALL NOT contain Structure Break, Regime Transition, Volatile Session or any other Event, nor a lookback over recent Events. Events remain separate outputs.

#### Scenario: State has only its parts

- **WHEN** a State is calculated for a session with a Structure Break Event
- **THEN** the State contains only `sessionDate`, `regime`, `structure`, `rsi`, `priceRelativeToEmaInAtr` and `priceRelativeToLongTermEmaInPercent`

### Requirement: causal Instrument State

The State for session `i` SHALL depend only on bars through `i`. Calculating States for any prefix of a history SHALL produce the same States as the corresponding prefix of the full-history result. A swing confirmed after session `i` SHALL NOT affect the State for `i`, even when it occurred at or before `i`.

#### Scenario: prefix replay

- **WHEN** States are calculated for a history and for each prefix of that history
- **THEN** the last State of every prefix equals the full-history State at the same position

#### Scenario: a later-confirmed swing does not reach back

- **WHEN** a swing occurs at session `k` and is confirmed at a later session `c`
- **THEN** the States for sessions `k` through `c − 1` equal the States calculated from bars truncated at each of those sessions

### Requirement: fixed Analysis Configuration

The Instrument State SHALL use the project-wide Analysis Configuration settings RSI(14), EMA(20), ATR(14) and a long-term EMA(200). These settings SHALL NOT be caller parameters. The long-term EMA period SHALL be the Instrument State's own setting, not Regime's, even though both are 200: each concept owns its periods. Regime and Structure SHALL use their own settings from the same Analysis Configuration unchanged. The module SHALL reuse the technical-analysis calculations and SHALL NOT duplicate indicator math.

#### Scenario: warm-up follows the configured periods

- **WHEN** States are calculated for 30 rising bars
- **THEN** `rsi` is `null` at positions 0 through 13 and readable from position 14
- **AND** `priceRelativeToEmaInAtr` is `null` at positions 0 through 18 and readable from position 19

#### Scenario: long-term EMA warm-up

- **WHEN** States are calculated for 201 rising bars
- **THEN** `priceRelativeToLongTermEmaInPercent` is `null` at positions 0 through 198 and readable from position 199

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
