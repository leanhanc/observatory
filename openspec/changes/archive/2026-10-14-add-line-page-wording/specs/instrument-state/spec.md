## MODIFIED Requirements

### Requirement: Situations part

`situations` SHALL list the Situations active at the session, in this order, each at most once:

1. `below-last-confirmed-low-in-bearish-regime`, active when `regime` is `bearish`, `lastConfirmedSwingLow` is not `null`, and its `closePosition` is `below`;
2. `above-last-confirmed-high-in-bullish-regime`, active when `regime` is `bullish`, `lastConfirmedSwingHigh` is not `null`, and its `closePosition` is `above`.

It SHALL be an empty list when none is active, never `null`.

Each entry SHALL contain `type`, `activeSinceSession`, `level` and `isBeyondNoiseBand`:

- `level` is the confirmed swing the close is beyond, with `kind`, `price`, `occurredAtSession` and `confirmedAtSession`.
- `activeSinceSession` is the session date of the first State of the current unbroken run of consecutive States, ending at this session, on which the Situation is active. A session on which the Situation is not active ends the run, and a later session on which it holds again starts a new one.
- `isBeyondNoiseBand` says whether the session's close is past `level` by more than the noise band: `level.price − close` for a low, `close − level.price` for a high, compared strictly with `ANALYSIS_CONFIGURATION.situations.noiseBandAtrMultiplier` (0.5) times the session's ATR(14), the State's own ATR. The comparison SHALL be made between the close and the band's edge (`level.price − band` for a low, `level.price + band` for a high) beyond the same floating-point rounding tolerance Regime's band uses, so a distance exactly equal to the band SHALL be `false` on either side, even when the arithmetic lands a hair past the edge. It SHALL be `null` when the session's ATR(14) is unavailable, and SHALL NOT be `false` or a guess then. A Situation is only active once Regime is readable, which needs more history than ATR(14), so `null` is not expected from validated bars; it is defined so that a missing ATR is never read as "within the band".

The noise band is half a typical daily move, the margin Regime's band treats as noise around EMA(200); the value is the Situations' own setting, equal to Regime's by convention, not by reuse. `isBeyondNoiseBand` selects reader-facing wording only. It SHALL NOT be a condition of any Situation, SHALL NOT affect which Situations are listed, and SHALL NOT affect `activeSinceSession`: within one run it may change from session to session while the run's start stays the same.

A Situation SHALL compare the close only with the latest confirmed swing of its kind. A swing low that confirms while the close is below an older low therefore ends `below-last-confirmed-low-in-bearish-regime`: the close of the confirming session is above the new low, because the confirming bar's low is above it. A swing that has occurred but is not yet confirmed SHALL NOT end a Situation or start one.

A Situation SHALL NOT be active while `regime` is `null` or its swing is `null`. A Situation's definition SHALL use no threshold on RSI, on the distance from the level or on the distance from EMA(200); `isBeyondNoiseBand` measures the distance from the level but is not part of the definition. Those facts are shown alongside it from the same State. An active Situation describes the current State and predicts nothing about what happens next.

#### Scenario: start

- **WHEN** settled Regime is `bearish` and a session closes strictly below the last confirmed swing low after closing at or above it on the previous session
- **THEN** that session's `situations` contains `below-last-confirmed-low-in-bearish-regime` with `activeSinceSession` equal to that session, `level` equal to that swing low, and `isBeyondNoiseBand` from that session's close and ATR(14)

#### Scenario: persistence

- **WHEN** the next sessions keep Regime `bearish`, confirm no new swing low and close below the same low
- **THEN** each of them lists the Situation with the same `activeSinceSession` and `level`

#### Scenario: ends when a newer low confirms

- **WHEN** a lower swing low occurs while the Situation is active and is confirmed three sessions later, while every close stays below the older low
- **THEN** the sessions before the confirmation still list the Situation with the older low as `level`
- **AND** the confirming session and later sessions closing at or above the new low do not list it

#### Scenario: ends when the close returns

- **WHEN** a session closes at or above the last confirmed swing low
- **THEN** that session does not list the Situation
- **AND** a later close below the same low starts it again with that later session as `activeSinceSession`

#### Scenario: ends when Regime leaves bearish

- **WHEN** settled Regime changes from `bearish` to `mixed` while the close stays below the last confirmed swing low
- **THEN** the transition session does not list the Situation

#### Scenario: the mirror Situation

- **WHEN** settled Regime is `bullish` and a session closes strictly above the last confirmed swing high
- **THEN** that session lists `above-last-confirmed-high-in-bullish-regime` with that swing high as `level`

#### Scenario: close exactly at the level

- **WHEN** settled Regime is `bearish` and a session closes exactly at the last confirmed swing low
- **THEN** that session does not list the Situation

#### Scenario: never active during warm-up

- **WHEN** Regime is `null`, or no swing of the Situation's kind has been confirmed
- **THEN** `situations` is empty

#### Scenario: close exactly half an ATR past the level

- **WHEN** a Situation's level is a low at 10, the session closes at 9 and its ATR(14) is 2
- **THEN** its `isBeyondNoiseBand` is `false`
- **AND** a close of 8.99 with the same ATR gives `true`, and for a high at 20 a close of 21 gives `false` and 21.01 gives `true`

#### Scenario: ATR unavailable

- **WHEN** a Situation is measured for a session whose ATR(14) is `null`
- **THEN** its `isBeyondNoiseBand` is `null`, not `false`

#### Scenario: the flag changes within a run

- **WHEN** a bearish run below a low of 167 starts with a close of 166, within half that session's ATR(14), and later closes fall to 160
- **THEN** the first session's `isBeyondNoiseBand` is `false` and the later sessions' is `true` once the distance exceeds half their ATR(14)
- **AND** every session of the run has the same `activeSinceSession` and `level`

#### Scenario: prefix replay

- **WHEN** States are calculated for a history and for each prefix of that history
- **THEN** each prefix's last `situations` equals the full-history part at the same position, including `isBeyondNoiseBand`
