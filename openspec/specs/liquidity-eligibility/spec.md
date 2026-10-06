# liquidity-eligibility Specification

## Purpose

Decide whether a Trading Line traded regularly enough, and with enough value, over the last 125 Market Sessions for indicators to describe market behavior rather than sparse trading. The decision is a yes/no gate on participation and median daily traded value in MEP dollars, measured causally from peso-line Daily Bars and MEP Rates, independent of any provider.

## Requirements

### Requirement: the window is the last market sessions through the evaluated session

The liquidity-eligibility module SHALL select a liquidity window from a list of MEP Rate sessions and an evaluated session date. The window SHALL be the last `ANALYSIS_CONFIGURATION.liquidityEligibility.windowSessions` (125) MEP Rate sessions whose date is on or before the evaluated session. A market session is a session with a MEP Rate; sessions without one SHALL NOT be counted. MEP Rate sessions after the evaluated session SHALL NOT be part of the window.

When fewer than `windowSessions` MEP Rate sessions exist on or before the evaluated session, selection SHALL fail with reason `insufficient-market-sessions` and the number of market sessions found. A shorter window SHALL NOT be used in its place.

#### Scenario: window ends at the evaluated session

- **WHEN** MEP Rates exist for 200 sessions and the evaluated session is the 150th
- **THEN** the window holds sessions 26 through 150

#### Scenario: evaluated session without a MEP Rate

- **WHEN** the evaluated session has no MEP Rate and the previous session has one
- **THEN** the window ends at the previous session

#### Scenario: not enough market sessions

- **WHEN** only 124 MEP Rate sessions exist on or before the evaluated session
- **THEN** selection fails with reason `insufficient-market-sessions` and a count of 124

### Requirement: participation and median traded value are measured over the window

The module SHALL measure one Trading Line over a window from its peso-line Daily Bars:

- A **traded session** is a window session on which the line has a bar with volume above zero. A window session without a bar, or with a zero-volume bar, SHALL count as not traded.
- **Participation** SHALL be traded sessions ÷ window sessions. Sessions before the line's first bar SHALL count as not traded, so a line listed inside the window has participation below 1.
- **Median daily traded value** SHALL be the median, over traded sessions, of `volume × close ÷ mepRate`, where `mepRate` is that same session's MEP Rate. With an even count it SHALL be the mean of the two middle values. With no traded session it SHALL be `null`, not `0`.

Bars outside the window, before it or after it, SHALL NOT affect the measures. Peso bars are expected to be a validated Daily Bar history.

#### Scenario: each session is valued at its own rate

- **WHEN** a line trades 100 at a close of 1000 on a session whose MEP Rate is 1000, and 100 at 3000 on a session whose rate is 2000
- **THEN** the traded values are USD 100 and USD 150

#### Scenario: a line listed inside the window

- **WHEN** a line's first bar is the 64th of 125 window sessions and it trades on every session from then on
- **THEN** its participation is 62/125

#### Scenario: zero-volume and missing bars

- **WHEN** a line has a zero-volume bar on one window session and no bar on another
- **THEN** neither session is traded, and neither contributes a value to the median

#### Scenario: a block trade does not move the median

- **WHEN** a line trades USD 10,000 on every window session except one, on which it trades USD 10,000,000
- **THEN** its median daily traded value is USD 10,000

#### Scenario: later bars do not change an earlier measure

- **WHEN** the same line is measured at session `i` with and without bars and MEP Rates after `i`
- **THEN** both measures are identical

#### Scenario: no traded session

- **WHEN** a line has no traded session in the window
- **THEN** participation is `0` and the median daily traded value is `null`

### Requirement: eligibility is a gate on both measures

A Trading Line SHALL be eligible when its participation is at least `ANALYSIS_CONFIGURATION.liquidityEligibility.minimumParticipation` (0.9) and its median daily traded value is at least `minimumMedianTradedValueUsd` (50,000). Both bounds SHALL be inclusive. A `null` median SHALL be ineligible. Eligibility SHALL be returned as a boolean together with both measures; the module SHALL NOT combine them into a score.

Changing any `liquidityEligibility` value SHALL require a new `ANALYSIS_CONFIGURATION.version`.

#### Scenario: exactly at both thresholds

- **WHEN** a line's participation is exactly 0.9 and its median daily traded value is exactly USD 50,000
- **THEN** it is eligible

#### Scenario: just below participation

- **WHEN** a line trades on 112 of 125 window sessions with a median of USD 1,000,000
- **THEN** it is ineligible

#### Scenario: just below value

- **WHEN** a line trades on every window session with a median just below USD 50,000
- **THEN** it is ineligible
