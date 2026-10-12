## MODIFIED Requirements

### Requirement: one Instrument State per session

The instrument-state module SHALL expose a pure `calculateInstrumentStates(bars)` that returns one Instrument State per input completed `DailyBar`, in input order. Each State SHALL contain the bar's `sessionDate`, `regime`, `pendingRegimeTransition`, `structure`, `lastConfirmedSwingHigh`, `lastConfirmedSwingLow`, `rsi`, `priceRelativeToEmaInAtr` and `priceRelativeToLongTermEmaInPercent`, and nothing else. Input SHALL be the validated, chronological Daily Bars of one Trading Line; for peso lines these are the bars of a Dollarized Series. Empty input SHALL return an empty result. The calculation SHALL NOT mutate its input, SHALL NOT perform I/O and SHALL NOT validate or sort its input.

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

### Requirement: Structure part

`structure` SHALL be `null` when Market Structure reports `hasSwingPairs` false for the session, because Structure cannot yet be evaluated. Otherwise it SHALL be the classification `calculateMarketStructure` reports: `uptrend`, `downtrend`, `range`, or the string `undefined`. Once available, `undefined` is a reading meaning the last trend expired, and SHALL NOT be reported as `null`. The State SHALL NOT include the list of newly confirmed swings; the levels Structure hinges on are the separate last confirmed swing parts.

#### Scenario: Structure warm-up is unavailable

- **WHEN** fewer than two confirmed swings of either kind exist by a session
- **THEN** that State's `structure` is `null`

#### Scenario: an expired trend is readable

- **WHEN** Market Structure reports `undefined` with `hasSwingPairs` true
- **THEN** that State's `structure` is `undefined`, not `null`

#### Scenario: available Structure matches Market Structure

- **WHEN** States and Market Structure are calculated for the same history
- **THEN** each available State's `structure` equals the Market Structure classification for that session

### Requirement: Events are not part of the State

The Instrument State SHALL NOT contain Structure Break, Regime Transition, Volatile Session or any other Event, nor a lookback over recent Events. Events remain separate outputs. A pending Regime transition is not an Event.

#### Scenario: State has only its parts

- **WHEN** a State is calculated for a session with a Structure Break Event
- **THEN** the State contains only `sessionDate`, `regime`, `pendingRegimeTransition`, `structure`, `lastConfirmedSwingHigh`, `lastConfirmedSwingLow`, `rsi`, `priceRelativeToEmaInAtr` and `priceRelativeToLongTermEmaInPercent`

## ADDED Requirements

### Requirement: last confirmed swing levels

`lastConfirmedSwingHigh` SHALL be the latest swing high confirmed by the session, and `lastConfirmedSwingLow` the latest swing low, under the technical-analysis swing confirmation rules. Each SHALL contain `kind`, `price`, `occurredAtSession` and `confirmedAtSession`, the fields of a Structure Break's `definingSwing`, and `priceRelativeToSwingInPercent`.

A swing SHALL be used only from its confirmation session, the session on which Market Structure first reports it as newly confirmed. A candidate that has occurred but is not yet confirmed SHALL NOT be used, and the session's own price SHALL NOT be treated as a swing. A part SHALL be `null` while no swing of its kind has been confirmed, and SHALL NOT be `null` afterwards: a later confirmed swing of the same kind replaces it. Two swings of the same kind confirmed on one session are not possible, since each session confirms at most one candidate.

`priceRelativeToSwingInPercent` SHALL equal `(close − price) / price × 100` with the session's close: positive when the close is above the swing price, negative when below, and `0` when equal. It SHALL NOT be rounded. It SHALL be `null` when the swing price is zero or the result is not finite; validated bars do not produce either, and the swing itself is still reported.

These parts are Evidence about Structure, not a separate state: in an `uptrend` the last confirmed swing low is the level a Structure Break would use, in a `downtrend` the last confirmed swing high. They describe where the levels are and where the close is relative to them; they do not say whether a level will hold.

#### Scenario: an occurred swing is not used before confirmation

- **WHEN** a swing high occurs at position 3 and is confirmed at position 6
- **THEN** the States at positions 3 through 5 have `lastConfirmedSwingHigh` `null`
- **AND** the State at position 6 has that swing with its occurrence and confirmation session dates

#### Scenario: no swing of a kind yet

- **WHEN** a swing high has been confirmed and no swing low has
- **THEN** `lastConfirmedSwingLow` is `null` and `lastConfirmedSwingHigh` is not

#### Scenario: distance below a high and above a low

- **WHEN** the last confirmed swing high is at 22, the last confirmed swing low is at 4, and the session closes at 10
- **THEN** the high's `priceRelativeToSwingInPercent` is about `-54.55`
- **AND** the low's `priceRelativeToSwingInPercent` is `150`

#### Scenario: the level defines a Structure Break

- **WHEN** a Structure Break Event occurs at a session
- **THEN** the previous session's last confirmed swing of the defining swing's kind has the defining swing's kind, price, occurrence session and confirmation session

#### Scenario: prefix replay

- **WHEN** States are calculated for a history and for each prefix of that history
- **THEN** each prefix's last `lastConfirmedSwingHigh` and `lastConfirmedSwingLow` equal the full-history parts at the same position

### Requirement: pending Regime transition part

`pendingRegimeTransition` SHALL be the pending candidate `calculatePendingRegimeTransitions` reports for the same session: `{ candidate, confirmations, requiredConfirmations }`, or `null`. It SHALL be `null` whenever `regime` is `null`. It is not an Event and SHALL NOT be presented as a Regime Transition: the candidate may be cleared or replaced before it is confirmed.

#### Scenario: a candidate part-way through confirmation

- **WHEN** settled Regime is `mixed` and the last two readable proposals were `bearish`
- **THEN** `regime` is `mixed`
- **AND** `pendingRegimeTransition` is `{ candidate: 'bearish', confirmations: 2, requiredConfirmations: 3 }`

#### Scenario: matches the technical-analysis view

- **WHEN** States and pending Regime transitions are calculated for the same history
- **THEN** each State's `pendingRegimeTransition` equals the pending transition for that session

#### Scenario: prefix replay

- **WHEN** States are calculated for a history and for each prefix of that history
- **THEN** each prefix's last `pendingRegimeTransition` equals the full-history part at the same position
