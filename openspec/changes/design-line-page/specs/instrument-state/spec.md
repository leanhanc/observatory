## ADDED Requirements

### Requirement: the long-term average

`longTermEma` SHALL equal EMA(200) of the closes through the session, the same average `priceRelativeToLongTermEmaInPercent` measures the close against, in the unit of the input bars. It SHALL be `null` while EMA(200) is unavailable under the EMA warm-up rule, or when it is not finite. It SHALL NOT be `0` or any other value while unavailable. The value SHALL NOT be rounded.

It is the center of Regime's noise band: the Regime tipping closes are this average plus and minus half the ATR. It is published so a reader can place the close, the average and the band on one scale without rebuilding the average from the band's edges.

#### Scenario: readable after warm-up

- **WHEN** States are calculated for a history of 250 bars
- **THEN** `longTermEma` is `null` at positions 0 through 198 and, from position 199, equals EMA(200) of the closes at the same position

#### Scenario: the average and the distance agree

- **WHEN** a State has a readable `longTermEma` and `priceRelativeToLongTermEmaInPercent`
- **THEN** `priceRelativeToLongTermEmaInPercent` equals `(close − longTermEma) / longTermEma × 100` within floating-point error

#### Scenario: causal

- **WHEN** States are calculated for a history truncated at a session
- **THEN** that session's `longTermEma` equals the full history's value at the same position

## MODIFIED Requirements

### Requirement: one Instrument State per session

The instrument-state module SHALL expose a pure `calculateInstrumentStates(bars)` that returns one Instrument State per input completed `DailyBar`, in input order. Each State SHALL contain the bar's `sessionDate`, `regime`, `pendingRegimeTransition`, `regimeTippingCloses`, `structure`, `lastConfirmedSwingHigh`, `lastConfirmedSwingLow`, `rsi`, `priceRelativeToEmaInAtr`, `priceRelativeToLongTermEmaInPercent`, `longTermEma` and `situations`, and nothing else. Input SHALL be the validated, chronological Daily Bars of one Trading Line; for peso lines these are the bars of a Dollarized Series. Empty input SHALL return an empty result. The calculation SHALL NOT mutate its input, SHALL NOT perform I/O and SHALL NOT validate or sort its input.

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
- **AND** later sessions report RSI and price relative to EMA while Regime, Structure, price relative to the long-term EMA and the long-term EMA are unavailable

### Requirement: Events are not part of the State

The Instrument State SHALL NOT contain Structure Break, Regime Transition, Volatile Session or any other Event, nor a lookback over recent Events. Events remain separate outputs. A pending Regime transition is not an Event, and an active Situation is not an Event.

#### Scenario: State has only its parts

- **WHEN** a State is calculated for a session with a Structure Break Event
- **THEN** the State contains only `sessionDate`, `regime`, `pendingRegimeTransition`, `regimeTippingCloses`, `structure`, `lastConfirmedSwingHigh`, `lastConfirmedSwingLow`, `rsi`, `priceRelativeToEmaInAtr`, `priceRelativeToLongTermEmaInPercent`, `longTermEma` and `situations`
