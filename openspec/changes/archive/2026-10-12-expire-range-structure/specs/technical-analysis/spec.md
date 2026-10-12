## ADDED Requirements

### Requirement: a range holds only within its confirmed levels

A `range` SHALL hold at a session only while that session's completed close is greater than or equal to the latest confirmed swing low and less than or equal to the latest confirmed swing high. A completed close strictly above the latest confirmed swing high or strictly below the latest confirmed swing low SHALL make Structure `undefined`. Equality SHALL preserve the label. Expiry SHALL remain in effect while the confirmed swings remain unchanged, even if a later close returns within the levels. A newly confirmed swing SHALL permit reclassification using the current confirmed pairs and close, and a `range` so classified SHALL be subject to the same check on that session. Only the session's own close and swings confirmed by that session SHALL be used; intraday highs and lows SHALL NOT expire a range. Range expiry SHALL NOT produce a Structure Break Event or any other Event.

#### Scenario: GGAL range that forms with the close already outside

- **GIVEN** the GGAL fixture, where on 2026-09-14 a close of 6840 below the 6870 swing low ends the uptrend
- **WHEN** on 2026-09-15 a lower swing high of 7265 confirms while the latest confirmed lows rise from 6701.958 to 6870, and the close is 6725
- **THEN** Structure is `undefined` on 2026-09-15, not `range`
- **AND** it remains `undefined` through 2026-09-30 while the close falls to 6050 and no new swing confirms

#### Scenario: a range holds while the close stays inside

- **WHEN** Structure classifies as `range` and every later completed close stays within the latest confirmed swing low and high
- **THEN** Structure remains `range` on each of those sessions

#### Scenario: close beyond the high

- **WHEN** a `range` session's completed close is strictly above the latest confirmed swing high
- **THEN** Structure is `undefined`
- **AND** a later close back inside the levels does not revive `range` without a new confirmed swing

#### Scenario: close beyond the low

- **WHEN** a `range` session's completed close is strictly below the latest confirmed swing low
- **THEN** Structure is `undefined`

#### Scenario: close exactly on a level

- **WHEN** a `range` session closes exactly at the latest confirmed swing high or exactly at the latest confirmed swing low
- **THEN** Structure remains `range`

#### Scenario: a wick beyond a level does not expire a range

- **WHEN** a `range` session trades beyond a confirmed level but closes within the levels
- **THEN** Structure remains `range`

#### Scenario: re-entry when a new swing confirms

- **WHEN** a range has expired
- **AND** a new swing confirms whose pairs still disagree on direction, with the close within the new latest confirmed swing low and high
- **THEN** Structure is `range` from that confirmation session

#### Scenario: no Event on expiry

- **WHEN** a `range` expires on a close beyond either level
- **THEN** Structure Break detection produces a `null` Event for that session and later sessions while no directional Structure is established

#### Scenario: replaying every prefix

- **WHEN** Structure is calculated for a history in which a range expires and is later re-established, and for each prefix of that history
- **THEN** the last result of every prefix equals the corresponding full-history result

## MODIFIED Requirements

### Requirement: classify only confirmed same-kind swing pairs

Structure SHALL compare the last two confirmed highs only with each other and the last two confirmed lows only with each other. Both rising pairs SHALL yield `uptrend`; both falling pairs SHALL yield `downtrend`. With two swings of each kind, equal or conflicting comparisons SHALL yield `range`, subject to the requirement that a range holds only within its confirmed levels. With fewer than two of either kind, Structure SHALL be `undefined`. No alternation between swing kinds is required.

#### Scenario: equal pair

- **WHEN** the latest two confirmed highs are equal and the latest two confirmed lows rise
- **AND** the close is within the latest confirmed swing low and high
- **THEN** Structure is `range`

#### Scenario: consecutive same-kind swings

- **WHEN** two high swings confirm consecutively without an intervening low swing
- **THEN** both highs remain eligible as the latest same-kind pair
- **AND** the latest two confirmed lows are selected independently

### Requirement: Structure availability

`hasSwingPairs` SHALL be true at a session exactly when at least two confirmed swing highs and at least two confirmed swing lows have been confirmed by that session. While it is false, Structure cannot be evaluated: the classification SHALL be `undefined` and that `undefined` SHALL mean not enough history. Once it is true, it SHALL remain true for every later session, and an `undefined` classification SHALL mean that a trend or a range expired, which is a reading of Structure.

#### Scenario: warm-up is unavailable

- **WHEN** fewer than two confirmed swings of either kind exist by a session
- **THEN** that session's `hasSwingPairs` is false and its classification is `undefined`
- **AND** one confirmed swing of each kind is not enough

#### Scenario: an expired trend is a reading

- **WHEN** a trend expires because a completed close crosses its defining swing
- **THEN** the classification is `undefined`
- **AND** `hasSwingPairs` is true

#### Scenario: an expired range is a reading

- **WHEN** a range expires because a completed close is strictly beyond its latest confirmed swing high or low
- **THEN** the classification is `undefined`
- **AND** `hasSwingPairs` is true

#### Scenario: warm-up does not return

- **WHEN** `hasSwingPairs` has become true at a session
- **THEN** it is true at every later session, including sessions whose classification is `undefined`
