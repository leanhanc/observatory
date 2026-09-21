# Technical-analysis core indicators

## ADDED Requirements

### Requirement: aligned indicator calculation

The module SHALL calculate requested EMA periods, Wilder ATR, and Wilder RSI as arrays
aligned one-to-one with the input `DailyBar` sessions. A value at index `i` SHALL depend
only on input positions through `i`.

#### Scenario: warm-up is absent

- **WHEN** EMA(20), ATR(14), and RSI(14) are calculated
- **THEN** EMA positions 0 through 18 are `null`
- **AND** ATR positions 0 through 12 are `null`
- **AND** RSI positions 0 through 13 are `null`
- **AND** no warm-up position is represented as zero

#### Scenario: invalid periods fail explicitly

- **WHEN** a requested period is zero, negative, non-integral, or non-finite
- **THEN** calculation throws `TypeError`

### Requirement: historical numeric parity

The implementation SHALL preserve the committed NFLX fixture conventions: EMA uses
`2/(period+1)` seeded from the first close; True Range uses the greatest of the bar range
and the two previous-close gaps, with the first bar using `high-low`; ATR uses Wilder
smoothing seeded by the first period True Ranges; RSI uses Wilder-smoothed gains and losses.

#### Scenario: NFLX reference session

- **WHEN** the 501-session NFLX fixture is calculated through 2026-08-21
- **THEN** EMA(20) is 76.17 within 0.01
- **AND** EMA(50) is 76.73 within 0.01
- **AND** EMA(200) is 87.44 within 0.01
- **AND** ATR(14) is 2.35 within 0.01
- **AND** RSI(14) is 61.61 within 0.01

### Requirement: edge behavior

RSI SHALL report 100 when the Wilder average loss is zero and average gain is positive.
A falling series SHALL produce an RSI of 0 once warmed up. RSI SHALL report no value when
average gain and average loss are both zero because the series has not established a
direction. A later flat session SHALL preserve an already-established RSI through Wilder
smoothing.

#### Scenario: directional edge series

- **WHEN** warmed-up RSI is calculated over strictly rising and strictly falling series
- **THEN** their values are 100 and 0 respectively

#### Scenario: flat series has not established a direction

- **WHEN** RSI is calculated over a series whose closes have never changed
- **THEN** every position reports no value

#### Scenario: later flat session preserves established RSI

- **WHEN** RSI has been established and the next close is unchanged
- **THEN** Wilder smoothing preserves the prior RSI value
