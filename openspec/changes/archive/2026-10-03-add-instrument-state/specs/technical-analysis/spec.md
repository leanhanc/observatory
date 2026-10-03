## MODIFIED Requirements

### Requirement: fixed v1 Analysis Configuration

Regime v1 SHALL use the project-wide v1 Analysis Configuration settings EMA(50), EMA(200), ATR(14), an ATR band multiplier of `0.5`, and three readable-session transition confirmations. These settings SHALL NOT be caller parameters or user customization. The implementation SHALL reuse the existing EMA and ATR calculations.

#### Scenario: fixed analytical conventions

- **WHEN** two callers calculate Regime for the same Daily Bar history
- **THEN** both use EMA50, EMA200, ATR14, the `0.5` ATR band, and three confirmations
- **AND** neither caller can silently produce a different v1 interpretation by passing custom parameters

### Requirement: fixed prior-session volatility baseline

Volatility Expansion SHALL use the project-wide v1 Analysis Configuration settings Wilder ATR period 14 and expansion threshold 1.8, neither configurable by caller nor user. It SHALL reuse the existing True Range and ATR calculations. At position `i`, `expansionMultiple` SHALL equal current True Range divided by ATR14 at `i - 1`. The baseline SHALL exclude the current session and SHALL NOT average multiple ATR values.

#### Scenario: current movement cannot raise its own baseline

- **WHEN** prior ATR14 is 10 and current True Range is 19
- **THEN** the multiple is 1.9 and an Event is emitted
- **AND** the current session's updated ATR does not affect this decision

#### Scenario: changing volatility does not use a second smoothing window

- **WHEN** the previous session's ATR14 differs from the mean of the latest 20 ATR14 values
- **THEN** the denominator is exactly the previous session's ATR14
- **AND** Event existence and evidence follow that denominator

#### Scenario: earliest readable prior ATR

- **WHEN** the fourteenth input bar first establishes ATR14
- **THEN** its Event remains `null`
- **AND** the fifteenth input bar is the first eligible session if its prior ATR is finite and positive

### Requirement: session-aligned confirmed market structure

The technical-analysis module SHALL return one Structure result per completed `DailyBar` session in input order. Each result SHALL contain that session date, a classification of `uptrend`, `downtrend`, `range`, or the string `undefined`, a `hasSwingPairs` availability flag, and only swings newly confirmed at that session. Each public swing SHALL carry its kind, price, occurrence session date, and confirmation session date. The calculation SHALL be pure and SHALL NOT mutate its input.

#### Scenario: empty and short histories

- **WHEN** no bars are supplied
- **THEN** the result is empty
- **WHEN** there are fewer than seven completed bars
- **THEN** every result is `undefined` with no confirmed swings

#### Scenario: occurrence differs from confirmation

- **WHEN** a unique extreme occurs at input position 4 under v1's fixed three-bar rule
- **THEN** it is absent from results through position 6
- **AND** it appears as newly confirmed at position 7 with both occurrence and confirmation session dates
- **AND** it may first influence classification at position 7

#### Scenario: replaying a prefix

- **WHEN** structure is calculated for a history and each prefix of that history
- **THEN** the last result of every prefix equals the corresponding full-history result
- **AND** no result uses later bars or a swing before its confirmation session

## ADDED Requirements

### Requirement: Structure availability

`hasSwingPairs` SHALL be true at a session exactly when at least two confirmed swing highs and at least two confirmed swing lows have been confirmed by that session. While it is false, Structure cannot be evaluated: the classification SHALL be `undefined` and that `undefined` SHALL mean not enough history. Once it is true, it SHALL remain true for every later session, and an `undefined` classification SHALL mean that a trend expired, which is a reading of Structure.

#### Scenario: warm-up is unavailable

- **WHEN** fewer than two confirmed swings of either kind exist by a session
- **THEN** that session's `hasSwingPairs` is false and its classification is `undefined`
- **AND** one confirmed swing of each kind is not enough

#### Scenario: an expired trend is a reading

- **WHEN** a trend expires because a completed close crosses its defining swing
- **THEN** the classification is `undefined`
- **AND** `hasSwingPairs` is true

#### Scenario: warm-up does not return

- **WHEN** `hasSwingPairs` has become true at a session
- **THEN** it is true at every later session, including sessions whose classification is `undefined`
