## ADDED Requirements

### Requirement: session-aligned pending Regime transitions

The technical-analysis module SHALL expose a pure `calculatePendingRegimeTransitions(bars)` that returns one result per input completed `DailyBar`, in input order. Each result SHALL contain that session date and `pending`: either `{ candidate, confirmations, requiredConfirmations }` or `null`. Empty input SHALL return an empty result. The calculation SHALL NOT mutate its input and SHALL NOT perform I/O.

It SHALL read the same internal transition engine as `calculateRegime` and `detectRegimeTransitionEvents` and SHALL NOT restate its rules. `pending` SHALL be the engine's candidate after the session: `candidate` is the candidate's readable Regime label, `confirmations` is the number of matching readable proposals so far, `1` or `2`, and `requiredConfirmations` is the configured number of confirmations, `3`. It SHALL be `null` when the engine has no candidate after the session, including the session that initializes settled Regime, a session whose proposal equals settled Regime, and the transition session, which resets pending State.

On a session whose proposal is unreadable, `pending` SHALL be `null`, because that session's Regime is `undefined`. The engine's candidate SHALL be unaffected, so the next readable session reports the count it would have had without the unreadable session.

A pending candidate is not an Event and predicts nothing: it may still be cleared by a proposal equal to settled Regime or replaced by a different proposal.

#### Scenario: a candidate counts up to two

- **WHEN** settled Regime is `bullish` and two consecutive readable proposals are `mixed`
- **THEN** the first session's `pending` is `{ candidate: 'mixed', confirmations: 1, requiredConfirmations: 3 }`
- **AND** the second session's `pending` is `{ candidate: 'mixed', confirmations: 2, requiredConfirmations: 3 }`

#### Scenario: the transition session clears pending

- **WHEN** the third matching readable proposal changes settled Regime
- **THEN** that session's `pending` is `null`
- **AND** later sessions whose proposal equals the new settled Regime have `pending` `null`

#### Scenario: a settled proposal clears the candidate

- **WHEN** a candidate with two confirmations is followed by a proposal equal to settled Regime
- **THEN** that session's `pending` is `null`
- **AND** a later different proposal starts again at one confirmation

#### Scenario: a different proposal replaces the candidate

- **WHEN** settled Regime is `mixed`, a session proposes `bullish`, and the next proposes `bearish`
- **THEN** the second session's `pending` is `{ candidate: 'bearish', confirmations: 1, requiredConfirmations: 3 }`

#### Scenario: an unreadable session neither shows nor advances the candidate

- **WHEN** a candidate with one confirmation is followed by an unreadable session and then a matching readable proposal
- **THEN** the unreadable session's `pending` is `null`
- **AND** the next session's `pending` has two confirmations

#### Scenario: warm-up and initial availability

- **WHEN** Regime's measurements have not warmed up, or the first readable proposal initializes settled Regime
- **THEN** `pending` is `null`

#### Scenario: prefix replay

- **WHEN** pending Regime transitions are calculated for a history and for each prefix
- **THEN** each prefix result equals the corresponding full-history rows

### Requirement: latest confirmed swings are tracked once

The technical-analysis module SHALL expose a pure `trackLatestConfirmedSwings(structures)` that takes `calculateMarketStructure` rows and returns one `{ high, low }` per row, in order: the latest swing of each kind confirmed by that row's session, or `null` before the first of its kind. A swing SHALL appear from the row whose `newlyConfirmedSwings` first lists it and SHALL remain until a later confirmed swing of the same kind replaces it. Structure Break detection SHALL read its defining swing from the previous session's row, so that Structure Breaks and every other reader of the latest confirmed swings use the same swings.

#### Scenario: a swing appears on its confirmation row

- **WHEN** a swing high occurs at position 3 and is confirmed at position 6
- **THEN** rows 0 through 5 have `high` `null`
- **AND** rows 6 onwards have that swing until another swing high is confirmed

#### Scenario: replaced on the next confirmation of its kind

- **WHEN** Market Structure lists a newly confirmed swing on a row
- **THEN** that row's swing of the same kind is that swing
