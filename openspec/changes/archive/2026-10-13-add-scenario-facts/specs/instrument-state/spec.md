## MODIFIED Requirements

### Requirement: one Instrument State per session

The instrument-state module SHALL expose a pure `calculateInstrumentStates(bars)` that returns one Instrument State per input completed `DailyBar`, in input order. Each State SHALL contain the bar's `sessionDate`, `regime`, `pendingRegimeTransition`, `regimeTippingCloses`, `structure`, `lastConfirmedSwingHigh`, `lastConfirmedSwingLow`, `rsi`, `priceRelativeToEmaInAtr`, `priceRelativeToLongTermEmaInPercent` and `situations`, and nothing else. Input SHALL be the validated, chronological Daily Bars of one Trading Line; for peso lines these are the bars of a Dollarized Series. Empty input SHALL return an empty result. The calculation SHALL NOT mutate its input, SHALL NOT perform I/O and SHALL NOT validate or sort its input.

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

### Requirement: Events are not part of the State

The Instrument State SHALL NOT contain Structure Break, Regime Transition, Volatile Session or any other Event, nor a lookback over recent Events. Events remain separate outputs. A pending Regime transition is not an Event, and an active Situation is not an Event.

#### Scenario: State has only its parts

- **WHEN** a State is calculated for a session with a Structure Break Event
- **THEN** the State contains only `sessionDate`, `regime`, `pendingRegimeTransition`, `regimeTippingCloses`, `structure`, `lastConfirmedSwingHigh`, `lastConfirmedSwingLow`, `rsi`, `priceRelativeToEmaInAtr`, `priceRelativeToLongTermEmaInPercent` and `situations`

### Requirement: last confirmed swing levels

`lastConfirmedSwingHigh` SHALL be the latest swing high confirmed by the session, and `lastConfirmedSwingLow` the latest swing low, under the technical-analysis swing confirmation rules. Each SHALL contain `kind`, `price`, `occurredAtSession` and `confirmedAtSession`, the fields of a Structure Break's `definingSwing`, and `priceRelativeToSwingInPercent` and `closePosition`.

A swing SHALL be used only from its confirmation session, the session on which Market Structure first reports it as newly confirmed. A candidate that has occurred but is not yet confirmed SHALL NOT be used, and the session's own price SHALL NOT be treated as a swing. A part SHALL be `null` while no swing of its kind has been confirmed, and SHALL NOT be `null` afterwards: a later confirmed swing of the same kind replaces it. Two swings of the same kind confirmed on one session are not possible, since each session confirms at most one candidate.

`priceRelativeToSwingInPercent` SHALL equal `(close − price) / price × 100` with the session's close: positive when the close is above the swing price, negative when below, and `0` when equal. It SHALL NOT be rounded. It SHALL be `null` when the swing price is zero or the result is not finite; validated bars do not produce either, and the swing itself is still reported.

`closePosition` SHALL compare the session's close with the swing price exactly, without rounding or tolerance:

- For the low, it SHALL be `at-or-above` when the close is greater than or equal to the price, and `below` when the close is strictly below it.
- For the high, it SHALL be `at-or-below` when the close is less than or equal to the price, and `above` when the close is strictly above it.

The last confirmed swing low is Support while its `closePosition` is `at-or-above`, and the last confirmed swing high is Resistance while its `closePosition` is `at-or-below`. Equality counts as Support or Resistance, as a close exactly at a level preserves a trend or a range. A close beyond a level means that level is no longer Support or Resistance. The State does not look for an older level in its place, since a level older than the latest confirmed swing of its kind is not what Structure reads.

These parts are Evidence about Structure, not a separate state: in an `uptrend` the last confirmed swing low is the level a Structure Break would use, in a `downtrend` the last confirmed swing high. They describe where the levels are and where the close is relative to them. They do not say whether a level will hold.

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
- **AND** the low's `closePosition` is `at-or-above` and the high's is `at-or-below`

#### Scenario: close exactly on a level

- **WHEN** a session closes exactly at its last confirmed swing low, or exactly at its last confirmed swing high
- **THEN** that swing's `closePosition` is `at-or-above`, or `at-or-below`

#### Scenario: close beyond a level

- **WHEN** a session closes strictly below its last confirmed swing low and below its last confirmed swing high
- **THEN** the low's `closePosition` is `below` and the high's is `at-or-below`

#### Scenario: close beyond both levels

- **WHEN** the last confirmed swing high is below the last confirmed swing low and the close is between them
- **THEN** the low's `closePosition` is `below` and the high's is `above`

#### Scenario: the level defines a Structure Break

- **WHEN** a Structure Break Event occurs at a session
- **THEN** the previous session's last confirmed swing of the defining swing's kind has the defining swing's kind, price, occurrence session and confirmation session

#### Scenario: prefix replay

- **WHEN** States are calculated for a history and for each prefix of that history
- **THEN** each prefix's last `lastConfirmedSwingHigh` and `lastConfirmedSwingLow` equal the full-history parts at the same position

## ADDED Requirements

### Requirement: Regime tipping closes part

`regimeTippingCloses` SHALL be the tipping closes `calculateRegimeTippingCloses` reports for the same session: `{ bullish: { closeAbove, isFastEmaAligned }, bearish: { closeBelow, isFastEmaAligned } }`, or `null`. It SHALL be `null` exactly when `regime` is `null`, because both read the same measurements.

#### Scenario: matches the technical-analysis view

- **WHEN** States and Regime tipping closes are calculated for the same history
- **THEN** each State's `regimeTippingCloses` equals the tipping closes for that session

#### Scenario: unavailable during Regime warm-up

- **WHEN** a session precedes Regime's warm-up completion
- **THEN** its `regimeTippingCloses` is `null`

### Requirement: Situations part

`situations` SHALL list the Situations active at the session, in this order, each at most once:

1. `below-last-confirmed-low-in-bearish-regime`, active when `regime` is `bearish`, `lastConfirmedSwingLow` is not `null`, and its `closePosition` is `below`;
2. `above-last-confirmed-high-in-bullish-regime`, active when `regime` is `bullish`, `lastConfirmedSwingHigh` is not `null`, and its `closePosition` is `above`.

It SHALL be an empty list when none is active, never `null`.

Each entry SHALL contain `type`, `activeSinceSession` and `level`:

- `level` is the confirmed swing the close is beyond, with `kind`, `price`, `occurredAtSession` and `confirmedAtSession`.
- `activeSinceSession` is the session date of the first State of the current unbroken run of consecutive States, ending at this session, on which the Situation is active. A session on which the Situation is not active ends the run, and a later session on which it holds again starts a new one.

A Situation SHALL compare the close only with the latest confirmed swing of its kind. A swing low that confirms while the close is below an older low therefore ends `below-last-confirmed-low-in-bearish-regime`: the close of the confirming session is above the new low, because the confirming bar's low is above it. A swing that has occurred but is not yet confirmed SHALL NOT end a Situation or start one.

A Situation SHALL NOT be active while `regime` is `null` or its swing is `null`. A Situation's definition SHALL use no threshold on RSI, on the distance from the level or on the distance from EMA(200). Those facts are shown alongside it from the same State. An active Situation describes the current State and predicts nothing about what happens next.

#### Scenario: start

- **WHEN** settled Regime is `bearish` and a session closes strictly below the last confirmed swing low after closing at or above it on the previous session
- **THEN** that session's `situations` contains `below-last-confirmed-low-in-bearish-regime` with `activeSinceSession` equal to that session and `level` equal to that swing low

#### Scenario: persistence

- **WHEN** the next sessions keep Regime `bearish`, confirm no new swing low and close below the same low
- **THEN** each of them lists the Situation with the same `activeSinceSession` and `level`

#### Scenario: ends when a newer low confirms

- **WHEN** a lower swing low occurs while the Situation is active and is confirmed three sessions later, while every close stays below the older low
- **THEN** the sessions before the confirmation still list the Situation with the older low as `level`
- **AND** the confirming session and later sessions closing at or above the new low do not list it

#### Scenario: ends when the close returns

- **WHEN** a session closes at or above the last confirmed swing low
- **THEN** that session does not list the Situation
- **AND** a later close below the same low starts it again with that later session as `activeSinceSession`

#### Scenario: ends when Regime leaves bearish

- **WHEN** settled Regime changes from `bearish` to `mixed` while the close stays below the last confirmed swing low
- **THEN** the transition session does not list the Situation

#### Scenario: the mirror Situation

- **WHEN** settled Regime is `bullish` and a session closes strictly above the last confirmed swing high
- **THEN** that session lists `above-last-confirmed-high-in-bullish-regime` with that swing high as `level`

#### Scenario: close exactly at the level

- **WHEN** settled Regime is `bearish` and a session closes exactly at the last confirmed swing low
- **THEN** that session does not list the Situation

#### Scenario: never active during warm-up

- **WHEN** Regime is `null`, or no swing of the Situation's kind has been confirmed
- **THEN** `situations` is empty

#### Scenario: prefix replay

- **WHEN** States are calculated for a history and for each prefix of that history
- **THEN** each prefix's last `situations` equals the full-history part at the same position
