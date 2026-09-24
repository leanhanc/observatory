## ADDED Requirements

### Requirement: session-aligned descriptive Regime

The technical-analysis module SHALL expose a pure `calculateRegime(bars)` function that returns one result per input completed `DailyBar`, preserving input order and session identity. Each result SHALL contain a `sessionDate` and one canonical label: `bullish`, `bearish`, `mixed`, or the string `undefined`. Empty input SHALL return an empty result. The function SHALL NOT mutate its input and SHALL NOT perform I/O.

#### Scenario: one result per session

- **WHEN** `calculateRegime` receives a chronological list of completed Daily Bars
- **THEN** it returns the same number of rows
- **AND** each row retains the corresponding session date and order

#### Scenario: empty history

- **WHEN** no Daily Bars are supplied
- **THEN** the result is empty

### Requirement: fixed v1 Analysis Configuration

Regime v1 SHALL use the module-owned, versioned settings EMA(50), EMA(200), ATR(14), an ATR band multiplier of `0.5`, and three readable-session transition confirmations. These settings SHALL NOT be caller parameters or user customization. The implementation SHALL reuse the existing EMA and ATR calculations.

#### Scenario: fixed analytical conventions

- **WHEN** two callers calculate Regime for the same Daily Bar history
- **THEN** both use EMA50, EMA200, ATR14, the `0.5` ATR band, and three confirmations
- **AND** neither caller can silently produce a different v1 interpretation by passing custom parameters

### Requirement: causal Regime predicates

For every session where Close, EMA50, EMA200, and ATR14 are available, the proposal SHALL be `bullish` when `close > EMA200 + 0.5 * ATR14` and `EMA50 > EMA200`. It SHALL be `bearish` when `close < EMA200 - 0.5 * ATR14` and `EMA50 < EMA200`. Differences no larger than `8 * Number.EPSILON * max(|value|, |threshold|)` SHALL count as equality rather than directional evidence. Every other readable combination SHALL propose `mixed`.

#### Scenario: directional agreement

- **WHEN** price clears the upper or lower ATR band and EMA50 is on the same side of EMA200
- **THEN** the proposal is respectively `bullish` or `bearish`

#### Scenario: disagreement is mixed

- **WHEN** only price clears the band or only EMA50 is on the directional side of EMA200
- **THEN** the proposal is `mixed`

#### Scenario: equality is not directional

- **WHEN** Close equals either band edge or EMA50 equals EMA200
- **THEN** the proposal is `mixed`

#### Scenario: flat history has no false direction from rounding

- **WHEN** all closes are identical and both EMA periods have warmed up
- **THEN** tiny floating-point EMA drift is treated as equality
- **AND** the proposal is `mixed`

### Requirement: explicit unavailable behavior

A session SHALL be `undefined` when any required input measurement is unavailable or non-finite. Warm-up positions SHALL remain `undefined`; no missing value SHALL be replaced with zero or another fabricated numeric value. An unavailable session SHALL not alter or advance transition state.

#### Scenario: indicator warm-up

- **WHEN** EMA50, EMA200, or ATR14 has not warmed up
- **THEN** the corresponding Regime row is `undefined`

#### Scenario: isolated missing measurement

- **WHEN** a later session lacks any required measurement
- **THEN** that row is `undefined`
- **AND** it does not count toward transition confirmation

### Requirement: hysteretic transitions

The first fully readable session SHALL adopt its proposal immediately. After that, a proposal different from the settled label SHALL replace it only after three consecutive readable sessions with the same proposal. A proposal equal to the settled label SHALL clear the pending candidate. A different proposal SHALL replace the pending candidate and restart its count at one. The rule SHALL apply to transitions among `bullish`, `bearish`, and `mixed`.

#### Scenario: three confirmations are required

- **WHEN** a different readable proposal occurs for one or two consecutive sessions
- **THEN** the settled label remains unchanged
- **AND** the candidate count remains pending

#### Scenario: third confirmation transitions

- **WHEN** the same different proposal occurs for three consecutive readable sessions
- **THEN** the settled label changes on the third session
- **AND** pending state resets

#### Scenario: interrupted candidate

- **WHEN** a pending candidate is followed by a different proposal
- **THEN** the new proposal becomes the pending candidate with count one

#### Scenario: sustained mixed context

- **WHEN** a settled directional label receives three consecutive `mixed` proposals
- **THEN** the settled label becomes `mixed`

### Requirement: causal replay

Every output at position `i` SHALL depend only on input positions through `i`. Recalculating any prefix SHALL produce the same rows as the corresponding prefix of the full-history result. The implementation SHALL calculate complete history oldest-to-newest and SHALL NOT add stateful incremental infrastructure in v1.

#### Scenario: prefix replay

- **WHEN** Regime is calculated for a full history and for each prefix
- **THEN** each prefix result equals the corresponding full-history rows
