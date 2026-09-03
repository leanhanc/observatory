## Purpose

Provide validated, provider-independent Daily Bar histories for configured Trading Lines so Observatory analysis can consume completed-session market facts with explicit provenance and freshness.

## ADDED Requirements

### Requirement: Bar History belongs to a Trading Line

The system SHALL maintain each Bar History under exactly one catalog-owned Trading Line identifier. Different currency or settlement lines of the same Instrument SHALL have independent histories.

#### Scenario: CEDEAR lines remain independent

- **WHEN** the catalog requests `cedear-aapl-ars`, `cedear-aapl-mep`, and `cedear-aapl-ccl`
- **THEN** the system treats them as three independent Bar Histories with no inferred price or volume shared among them

### Requirement: Daily Bars represent completed sessions

Each Daily Bar SHALL contain `sessionDate`, `open`, `high`, `low`, `close`, and `volume` for one completed Trading Session. `sessionDate` SHALL be the Buenos Aires civil date in `YYYY-MM-DD` form rather than an instant, and a Bar History SHALL order bars from oldest to newest with at most one bar per session date.

#### Scenario: Provider timestamp becomes a session date

- **WHEN** a provider row belongs to the Buenos Aires trading session of 2026-09-02
- **THEN** the normalized Daily Bar has `sessionDate` equal to `2026-09-02` regardless of the UTC representation used by the provider

#### Scenario: Active session is excluded

- **WHEN** provider data describes a Trading Session that has not completed
- **THEN** the system does not add that session to Bar History

### Requirement: Daily Bar values are validated

The system SHALL reject a Daily Bar when any OHLCV field is missing, non-finite, or negative; when `low` exceeds `high`; or when `open` or `close` lies outside the inclusive low-to-high range. Zero volume alone SHALL remain valid.

#### Scenario: Invalid price range rejects the update

- **WHEN** a supplied bar has a close above its high
- **THEN** the update for that Trading Line fails and its previously stored history remains unchanged

#### Scenario: Zero-volume real bar remains valid

- **WHEN** a supplied bar has structurally valid OHLC prices and zero volume but is not identified as a provider carried-close row
- **THEN** the system accepts the bar

### Requirement: Stored prices are raw market facts

The system SHALL store provider OHLCV values without dividend or split adjustment and SHALL record an adjustment policy of `none` in history provenance. A single history SHALL not mix providers or adjustment policies.

#### Scenario: Corporate action data is not applied

- **WHEN** the provider reports a dividend or another corporate action
- **THEN** Bar History leaves its raw stored OHLCV values unchanged

### Requirement: Provider carried-close rows are excluded

The provider adapter SHALL omit a row identified by the provider shape `open = high = low = volume = 0` with a carried closing price, because that row does not represent a traded session. Omission SHALL not create a synthetic zero-value Daily Bar.

#### Scenario: CCL line has no trade

- **WHEN** Open BYMADATA returns a carried-close row for a CCL Trading Line
- **THEN** the row is absent from normalized Bar History and the line may legitimately have no bar for that session

### Requirement: Initial backfill retains available history

When no stored history exists for a requested Trading Line, the system SHALL request the provider's available daily history, normalize and validate it, and retain every valid completed Daily Bar without imposing a domain-level rolling retention limit.

#### Scenario: First update creates history

- **WHEN** a recognized Trading Line has no stored history and the provider returns valid daily rows
- **THEN** the system stores the complete normalized history and reports that line as `created`

#### Scenario: Recognized inactive line has no bars

- **WHEN** a recognized Trading Line has no stored history and the provider successfully returns no real bars through the requested session
- **THEN** the system stores a valid empty Bar History with its check progress and does not report a provider failure

### Requirement: Incremental updates catch up missed sessions

For an existing history, the system SHALL request the interval after `checkedThroughSession` through the requested completed session, merge every returned real bar, and advance `checkedThroughSession` only after that interval is successfully accepted. A request already covered by the stored check progress SHALL not duplicate bars or regress progress.

#### Scenario: Update catches up more than one session

- **WHEN** a line was last checked through Friday and the next successful request is through Tuesday
- **THEN** the system requests and processes the missing interval before advancing that line through Tuesday

#### Scenario: Holiday produces no bar

- **WHEN** the provider successfully answers through a market holiday without returning a real bar
- **THEN** `checkedThroughSession` advances while the latest stored bar remains unchanged

#### Scenario: Repeated update does not duplicate a bar

- **WHEN** the same completed interval is processed more than once
- **THEN** each session date occurs at most once and check progress does not regress

### Requirement: Reconciliation preserves history and applies corrections

Reconciliation SHALL compare provider rows with stored bars by the same session date. Identical rows SHALL cause no bar change; differing valid rows SHALL replace the stored bar as a provider correction. Bars older than the provider's returned reconciliation window SHALL remain stored.

#### Scenario: Provider corrects an existing session

- **WHEN** reconciliation returns valid OHLCV values that differ from the stored bar for the same session date
- **THEN** the system replaces that bar and reports the old and new values as a correction

#### Scenario: Provider window no longer reaches oldest stored bar

- **WHEN** the earliest session returned by reconciliation is newer than the earliest stored bar
- **THEN** the system retains stored bars before the returned window

### Requirement: Suspicious reconciliation shrinkage is rejected

If a previously stored real bar within the provider's authoritative returned interval is absent from a successful reconciliation response, the system SHALL reject the update for that Trading Line rather than delete the bar.

#### Scenario: Stored bar disappears inside returned interval

- **WHEN** the provider returns bars before and after a stored session but omits that previously stored real bar
- **THEN** reconciliation fails for that line and its stored history remains unchanged

### Requirement: Complete resulting history is validated before replacement

Before replacing stored state, the system SHALL validate the complete merged Bar History, including ordering, unique session dates, Daily Bar invariants, Trading Line identity, provenance consistency, and non-regressing check progress. Any failure SHALL preserve the complete previously stored history.

#### Scenario: One invalid incoming bar preserves prior state

- **WHEN** an update contains several valid bars and one invalid bar
- **THEN** none of that Trading Line's supplied bars or progress changes are stored

### Requirement: Batch updates report each Trading Line independently

An update SHALL return exactly one result for every requested Trading Line. Each result SHALL be `created`, `updated`, `unchanged`, or `failed`; a failure for one line SHALL not roll back successful updates for other lines. Failures SHALL include a machine-readable reason, and successful correction results SHALL include correction details.

#### Scenario: Partial provider failure

- **WHEN** an update succeeds for two requested Trading Lines and fails for a third
- **THEN** the two successful histories are stored and the response contains an explicit failed result for the third line

#### Scenario: No work is required

- **WHEN** a requested Trading Line is already checked through the target session and no reconciliation was requested
- **THEN** its result is `unchanged`

### Requirement: Batch reads are explicit and range-aware

A read SHALL return exactly one result for every requested Trading Line identifier. A usable result SHALL include bars, provenance, and `checkedThroughSession`; a failed result SHALL include a machine-readable reason such as `not-found`, `unreadable`, or `invalid-stored-history`. Reads SHALL accept an optional inclusive session-date range, return matching bars oldest to newest, and treat an empty matching range as a successful result with `bars: []`.

#### Scenario: Requested history is missing

- **WHEN** a requested Trading Line has no stored Bar History
- **THEN** the read returns an explicit `not-found` result for that identifier without removing other requested results

#### Scenario: Inclusive range has no matches

- **WHEN** a valid requested date range contains no stored bars
- **THEN** the read succeeds for that Trading Line with an empty bars array and its freshness metadata

#### Scenario: Lines have different freshness

- **WHEN** requested histories have different `checkedThroughSession` values
- **THEN** the read returns every usable history with its own freshness value instead of silently hiding a stale line

### Requirement: Successful storage becomes the authoritative history

After a successful create or update, subsequent reads SHALL return the complete replacement history. A failed write SHALL be reported as a failed update and SHALL not be reported as successful progress.

#### Scenario: Storage replacement fails

- **WHEN** persistence rejects the complete validated replacement
- **THEN** the line is reported as failed and the operation does not claim that its bars or check progress were stored
