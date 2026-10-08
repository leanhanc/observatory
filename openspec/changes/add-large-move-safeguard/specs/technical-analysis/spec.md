## ADDED Requirements

### Requirement: Large One-Session Moves are flagged by close ratio

The technical-analysis module SHALL expose a pure `detectLargeOneSessionMoves(bars)` that returns, in input order, one `{ sessionDate, closeRatio }` for each bar `i` after the first whose close ratio to the previous input bar satisfies `|ln(close_i / close_{i−1})| ≥ ln(ANALYSIS_CONFIGURATION.largeMove.minimumCloseRatio)`, which is ln 1.8. `closeRatio` SHALL be the unrounded `close_i / close_{i−1}`, so a fall has a ratio below 1. Both bounds SHALL be inclusive. The first bar has no previous bar and SHALL NOT be flagged. Empty input SHALL return an empty list. The calculation SHALL NOT perform I/O or mutate input.

The previous bar is the previous input bar, whatever the calendar gap. The flag SHALL read only bars `i − 1` and `i`.

A Large One-Session Move is a description of the move's size, not a claim about its cause. It SHALL NOT encode direction beyond the ratio, and it SHALL NOT suppress or alter any Event.

#### Scenario: exact threshold, both directions

- **WHEN** a close rises from 100 to 180, or falls from 180 to 100
- **THEN** that session is flagged with `closeRatio` 1.8, or 100/180

#### Scenario: just below the threshold

- **WHEN** a close rises from 100 to 179.99, or falls from 179.99 to 100
- **THEN** that session is not flagged

#### Scenario: causal

- **WHEN** detection runs over a history and over each of its prefixes
- **THEN** every flag through a shared session is identical
- **AND** changing any bar other than `i − 1` and `i` does not change whether `i` is flagged
