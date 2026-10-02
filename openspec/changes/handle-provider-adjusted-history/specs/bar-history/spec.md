## REMOVED Requirements

### Requirement: Stored prices are raw market facts

**Reason**: Open BYMADATA back-adjusts its history for distributions, so stored prices cannot be raw market facts.
**Migration**: Use "Stored prices follow provider adjustments".

## ADDED Requirements

### Requirement: Stored prices follow provider adjustments

Stored Bar History SHALL follow the provider's adjusted price series. When the provider adjusts history, the system SHALL apply the detected price ratio to every stored bar up to the adjusted session, including bars the provider no longer serves, so the history stays on one price scale. The adjustment SHALL be recorded as an adjustment event, not as corrections.

#### Scenario: Adjustment reaches bars outside the provider window

- **WHEN** a refetch shows every overlapping bar through a session scaled by the same ratio, and older stored bars exist that the provider no longer serves
- **THEN** those older stored bars are scaled by the same ratio
- **AND** the history shows no price jump at the edge of the provider window

### Requirement: Adjustments are distinguished from corrections

`detectAdjustmentOrCorrection(storedBars, fetchedBars)` SHALL compare bars on sessions present in both inputs and classify the difference as `unchanged`, `adjustments`, or `corrections`. Every overlapping bar on or before the latest changed session SHALL have changed prices, and every later overlapping bar SHALL be unchanged. Consecutive bars whose close ratios match within 0.1% SHALL form one step of at least two bars. A step's ratio SHALL be estimated from the sum of all its fetched prices divided by the sum of all its stored prices, and each open, high, low, and close ratio in the step SHALL match that estimate within 0.1%. Each step SHALL be reported as one adjustment whose ratio is the step's ratio divided by the next later step's ratio, through the step's latest session. Every adjustment ratio SHALL be below 0.999, because distributions and forward splits lower past prices. No stored session omitted by the refetch SHALL lie between a step's latest session and the next refetched session. Volume MAY differ on adjusted bars, because a split can rescale it. Any other difference SHALL be `corrections` listing each changed session.

#### Scenario: No overlapping bar changed

- **WHEN** every overlapping bar is identical
- **THEN** the result is `unchanged`

#### Scenario: Distribution adjustment

- **WHEN** every overlapping bar through a session has all four prices multiplied by 0.97, and later bars are unchanged
- **THEN** the result is `adjustments` with one adjustment of ratio 0.97 through that session

#### Scenario: Two adjustments since the last check

- **WHEN** the earliest bars are multiplied by 0.97 × 0.95, the next bars by 0.95, and later bars are unchanged
- **THEN** the result is `adjustments` with an adjustment of ratio 0.97 through the last bar of the first step and an adjustment of ratio 0.95 through the last bar of the second step

#### Scenario: A step with a single bar

- **WHEN** a staircase contains a step of only one bar
- **THEN** the result is `corrections` listing every changed session

#### Scenario: Single corrected bar

- **WHEN** only one overlapping bar changed, and it is the latest overlapping bar
- **THEN** the result is `corrections` listing that session

#### Scenario: Adjustment combined with a correction

- **WHEN** earlier bars are scaled by one ratio but one of them changed by a different ratio
- **THEN** the result is `corrections` listing every changed session

#### Scenario: Volume alone changed

- **WHEN** several overlapping bars changed only their volume
- **THEN** the result is `corrections` listing those sessions

#### Scenario: Small edits near a ratio of 1

- **WHEN** two overlapping bars each changed one price slightly, or by noise or drift within 0.1%
- **THEN** the result is `corrections`

#### Scenario: Ratio above 1

- **WHEN** earlier bars were multiplied by a ratio above 1, such as a reverse split or a rising step in a staircase
- **THEN** the result is `corrections`

#### Scenario: Omitted session at a step boundary

- **WHEN** the refetch omits a stored session between an adjusted step and the next refetched bar
- **THEN** the result is `corrections`, because that session's side of the boundary is unknown
