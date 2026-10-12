## MODIFIED Requirements

### Requirement: Structure part

`structure` SHALL be `null` when Market Structure reports `hasSwingPairs` false for the session, because Structure cannot yet be evaluated. Otherwise it SHALL be the classification `calculateMarketStructure` reports: `uptrend`, `downtrend`, `range`, or the string `undefined`. Once available, `undefined` is a reading meaning the last trend or range expired, and SHALL NOT be reported as `null`. The State SHALL NOT include the list of newly confirmed swings; the levels Structure hinges on are the separate last confirmed swing parts.

#### Scenario: Structure warm-up is unavailable

- **WHEN** fewer than two confirmed swings of either kind exist by a session
- **THEN** that State's `structure` is `null`

#### Scenario: an expired trend is readable

- **WHEN** Market Structure reports `undefined` with `hasSwingPairs` true
- **THEN** that State's `structure` is `undefined`, not `null`

#### Scenario: available Structure matches Market Structure

- **WHEN** States and Market Structure are calculated for the same history
- **THEN** each available State's `structure` equals the Market Structure classification for that session
