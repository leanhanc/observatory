## ADDED Requirements

### Requirement: session-aligned confirmed market structure

The technical-analysis module SHALL return one Structure result per completed `DailyBar` session in input order. Each result SHALL contain that session date, a classification of `uptrend`, `downtrend`, `range`, or the string `undefined`, and only swings newly confirmed at that session. Each public swing SHALL carry its kind, price, occurrence session date, and confirmation session date. The calculation SHALL be pure and SHALL NOT mutate its input.

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

### Requirement: strict confirmed swing extrema

In Analysis Configuration v1, a swing candidate SHALL have three earlier and three later completed bars. A swing high SHALL have a high strictly greater than every other high in that seven-bar window. A swing low SHALL have a low strictly less than every other low in that window. The two comparisons SHALL be independent.

#### Scenario: plateau and flat history

- **WHEN** an eligible candidate ties another high or low in its window
- **THEN** it is not a swing of that kind
- **AND** a flat history produces no swings and remains `undefined`

#### Scenario: outside bar

- **WHEN** a completed bar has both the uniquely highest high and uniquely lowest low in its window
- **THEN** both kinds of swing are confirmed together three input positions later

### Requirement: classify only confirmed same-kind swing pairs

Structure SHALL compare the last two confirmed highs only with each other and the last two confirmed lows only with each other. Both rising pairs SHALL yield `uptrend`; both falling pairs SHALL yield `downtrend`. With two swings of each kind, equal or conflicting comparisons SHALL yield `range`. With fewer than two of either kind, Structure SHALL be `undefined`. No alternation between swing kinds is required.

#### Scenario: equal pair

- **WHEN** the latest two confirmed highs are equal and the latest two confirmed lows rise
- **THEN** Structure is `range`

#### Scenario: consecutive same-kind swings

- **WHEN** two high swings confirm consecutively without an intervening low swing
- **THEN** both highs remain eligible as the latest same-kind pair
- **AND** the latest two confirmed lows are selected independently

### Requirement: expire a contradicted trend label

An `uptrend` SHALL become `undefined` when a completed close is strictly below its latest defining confirmed swing low. A `downtrend` SHALL become `undefined` when a completed close is strictly above its latest defining confirmed swing high. Equality SHALL preserve the label. Expiry SHALL remain in effect while the defining confirmed swings remain unchanged, even if a later close crosses back. A newly confirmed swing SHALL permit reclassification using the current confirmed pairs and close.

#### Scenario: downtrend invalidated by current close

- **WHEN** the latest confirmed highs and lows descend but the current completed close rises above the latest confirmed swing high
- **THEN** Structure is `undefined`
- **AND** the current close is not promoted into a swing
- **AND** a later close below that high does not revive the old label without a new confirmed swing

#### Scenario: equality does not expire a trend

- **WHEN** an uptrend closes exactly at its defining swing low or a downtrend closes exactly at its defining swing high
- **THEN** the respective trend label remains
