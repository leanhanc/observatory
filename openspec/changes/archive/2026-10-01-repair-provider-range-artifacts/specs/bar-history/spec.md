## MODIFIED Requirements

### Requirement: Daily Bar values are validated

The system SHALL exclude provider-specific Continuity Data before domain validation only when the source row has zero volume, a positive retained close, and at least one zero open, high, or low value. It SHALL reject any remaining Daily Bar when an OHLCV field is missing or non-finite; when any OHLC price is zero or negative; when volume is negative; when `low` exceeds `high`; or when `open` or `close` lies outside the inclusive low-to-high range. Zero volume alone SHALL remain valid.

Before domain validation, the Open BYMADATA adapter SHALL widen `low` or `high` to include `open` and `close` when either lies outside the range by at most 1% of the boundary price, provided `low` does not exceed `high`. It SHALL NOT change `open`, `close`, or `volume`. Larger gaps SHALL reach domain validation unchanged.

#### Scenario: Historical Continuity Data is excluded

- **WHEN** Open BYMADATA returns a dated row with zero volume, a positive retained close, and one or more zero open, high, or low values
- **THEN** the provider adapter excludes that row before it can become a Daily Bar

#### Scenario: Invalid price range rejects the update

- **WHEN** a supplied bar has a close above its high by more than 1% of the high
- **THEN** the update for that Trading Line fails and its previously stored history remains unchanged

#### Scenario: Zero-volume real bar remains valid

- **WHEN** a supplied bar has structurally valid OHLC prices and zero volume
- **THEN** the system accepts the bar

#### Scenario: Zero price rejects the update

- **WHEN** a supplied row contains zero for any OHLC price but does not match the provider's Continuity Data signature
- **THEN** the update for that Trading Line fails and its previously stored history remains unchanged

#### Scenario: Small provider range artifact is repaired

- **WHEN** Open BYMADATA returns a bar whose close is 0.26% below its low
- **THEN** the adapter sets the low to the close and keeps open, close, and volume unchanged
- **AND** it reports the provider bar and the repaired bar

## ADDED Requirements

### Requirement: Provider range repairs are logged after persistence

After a Trading Line's history is successfully written, the system SHALL log each provider range repair whose repaired bar was not already stored with the same high and low. Each log entry SHALL include the event `market-history-repair`, the Trading Line, the session date, the provider bar, and the repaired bar.

#### Scenario: Repair is logged when first stored

- **WHEN** an initial backfill stores a repaired bar
- **THEN** the system logs that repair after the write succeeds

#### Scenario: Repeated repair is not logged again

- **WHEN** a later update fetches the same provider bar, repairs it identically, and writes other changes
- **THEN** the system does not log that repair again
