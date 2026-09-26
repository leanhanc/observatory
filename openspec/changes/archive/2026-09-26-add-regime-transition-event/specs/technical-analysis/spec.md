## ADDED Requirements

### Requirement: session-aligned Regime Transition Events

The technical-analysis module SHALL expose a pure `detectRegimeTransitionEvents(bars)` calculation
that returns one result per completed `DailyBar` session in input order. Each result SHALL contain
that session date and either one `RegimeTransitionEvent` or `null`. Empty input SHALL return an empty
result. The calculation SHALL NOT mutate its input and SHALL NOT perform I/O.

Each Event SHALL have type `regime-transition`, different readable `from` and `to` Regime labels,
and exactly three `confirmingSessionDates`. The result row's `sessionDate` SHALL identify the
effective transition session and SHALL NOT be duplicated inside the Event.

#### Scenario: empty and warm-up histories

- **WHEN** no bars are supplied or no Regime proposal is readable
- **THEN** the result is respectively empty or contains only `null` Events

#### Scenario: input remains unchanged

- **WHEN** Regime Transition Events are detected from frozen input bars
- **THEN** calculation succeeds without mutating the bars

### Requirement: only settled readable Regime changes are Events

The first readable Regime proposal SHALL initialize settled Regime without producing an Event. After
initialization, every settled change between `bullish`, `bearish`, and `mixed` SHALL produce one Event
on the third matching readable proposal. An Event SHALL never have `undefined` or equal `from` and
`to` labels.

#### Scenario: initial availability is not a transition

- **WHEN** warm-up ends and the first readable Regime proposal is adopted
- **THEN** that session contains a `null` Event

#### Scenario: directional Regime becomes mixed

- **WHEN** settled Regime is `bullish` and three matching readable `mixed` proposals occur
- **THEN** the third proposal session contains a `bullish` to `mixed` Event

#### Scenario: mixed Regime becomes directional

- **WHEN** settled Regime is `mixed` and three matching readable `bearish` proposals occur
- **THEN** the third proposal session contains a `mixed` to `bearish` Event

#### Scenario: direct directional reversal

- **WHEN** settled Regime is `bearish` and three matching readable `bullish` proposals occur
- **THEN** the third proposal session contains a `bearish` to `bullish` Event

#### Scenario: only two proposals

- **WHEN** only two matching readable proposals differ from settled Regime
- **THEN** neither session contains an Event

### Requirement: pending confirmation follows Regime State

Regime Transition detection SHALL use the same internal transition engine as `calculateRegime`. A
proposal equal to settled Regime SHALL clear the pending candidate. A readable proposal different
from both settled Regime and the pending candidate SHALL replace the candidate and restart its count
at one. An unreadable session SHALL neither advance nor cancel pending transition State.

#### Scenario: settled proposal clears the candidate

- **WHEN** two matching candidate proposals are followed by a proposal equal to settled Regime
- **THEN** the candidate is cleared
- **AND** a later matching candidate requires three new confirmations

#### Scenario: different proposal replaces the candidate

- **WHEN** a pending candidate is followed by another readable proposal different from it and from
  settled Regime
- **THEN** the new proposal becomes the candidate with one confirmation

#### Scenario: unreadable gap preserves the candidate

- **WHEN** matching readable candidate proposals are separated by an unreadable session
- **THEN** the unreadable session neither advances nor cancels the candidate
- **AND** the Event lists the three actual readable confirming session dates

### Requirement: record each Regime Transition once

One Event SHALL occur on the session that changes settled Regime. Later sessions that retain that
Regime SHALL NOT repeat the Event.

#### Scenario: retained Regime does not repeat

- **WHEN** one session records a Regime Transition Event
- **AND** later readable proposals equal the new settled Regime
- **THEN** those later sessions contain `null` Events

### Requirement: Regime Transition evidence is minimal

The Event SHALL contain the prior Regime, replacement Regime, and the three actual readable
confirming session dates. It SHALL NOT duplicate Close, EMA50, EMA200, or ATR14 measurements.
Presentation-time history queries or indicator recalculation SHALL NOT be part of this capability.

#### Scenario: transition evidence identifies causal proposals

- **WHEN** the third matching readable proposal changes settled Regime
- **THEN** `confirmingSessionDates` identifies the three readable proposal sessions in order
- **AND** the wrapper identifies the third date as the effective session

### Requirement: Regime Transition replay is causal

Every Event SHALL depend only on bars and measurements available through its completed session.
Detecting Events over a complete history and over every prefix SHALL produce identical results through
each shared cutoff.

#### Scenario: replaying every prefix

- **WHEN** Regime Transition Events are detected for a history and each prefix of that history
- **THEN** the last result of every prefix equals the corresponding full-history result

### Requirement: Regime Transition is independent of Structure Break

Regime Transition Event calculation SHALL neither consume nor alter Structure Break Events. Both
Event types MAY be valid on the same completed session. Cross-Event composition SHALL remain outside
this capability.

#### Scenario: same-session Structure Break does not suppress Regime Transition

- **WHEN** the third confirming Regime proposal occurs on a session that also satisfies the
  independent Structure Break contract
- **THEN** Regime Transition calculation still emits its Event
