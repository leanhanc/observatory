## ADDED Requirements

### Requirement: session-aligned Regime tipping closes

The technical-analysis module SHALL expose a pure `calculateRegimeTippingCloses(bars)` that returns one result per input completed `DailyBar`, in input order. Each result SHALL contain that session date and `tippingCloses`, either `{ bullish: { closeAbove, isFastEmaAligned }, bearish: { closeBelow, isFastEmaAligned } }` or `null`. Empty input SHALL return an empty result. The calculation SHALL NOT mutate its input and SHALL NOT perform I/O.

For a session where EMA50, EMA200 and ATR14 are readable and finite:

- `bullish.closeAbove` SHALL be `EMA200 + 0.5 × ATR14` and `bearish.closeBelow` SHALL be `EMA200 − 0.5 × ATR14`, the band edges the Regime proposal compares the close with.
- `bullish.isFastEmaAligned` SHALL be true exactly when EMA50 is above EMA200 beyond rounding noise.
- `bearish.isFastEmaAligned` SHALL be true exactly when EMA50 is below EMA200 beyond rounding noise.

Otherwise `tippingCloses` SHALL be `null`. The edges and the alignment SHALL come from the same regime-policy measurement that `proposeRegime` reads, so they cannot disagree with the proposal:

- the proposal is `bullish` exactly when the close is above `closeAbove` beyond rounding noise and `bullish.isFastEmaAligned` is true;
- it is `bearish` exactly when the close is below `closeBelow` beyond rounding noise and `bearish.isFastEmaAligned` is true.

A tipping close describes a condition of Regime's own rule as of the session. It is not a price target and not a prediction. A later session's edge differs, because that session's close moves EMA200 and ATR14. Satisfying both conditions on one session makes a proposal, not a Regime: a change still needs the configured confirmations.

#### Scenario: band edges

- **WHEN** a session's EMA200 is 100, its ATR14 is 4 and its EMA50 is 98
- **THEN** `bullish.closeAbove` is `102` and `bearish.closeBelow` is `98`
- **AND** `bullish.isFastEmaAligned` is false and `bearish.isFastEmaAligned` is true

#### Scenario: agrees with the proposal

- **WHEN** Regime tipping closes and Regime proposals are calculated for the same history
- **THEN** on every session with readable measurements, the proposal is `bullish` exactly when the close is above `closeAbove` and `bullish.isFastEmaAligned` is true, and `bearish` exactly in the mirror case

#### Scenario: equal averages align neither side

- **WHEN** EMA50 equals EMA200 within rounding noise
- **THEN** both `isFastEmaAligned` values are false

#### Scenario: warm-up

- **WHEN** EMA50, EMA200 or ATR14 has not warmed up for a session
- **THEN** that session's `tippingCloses` is `null`

#### Scenario: prefix replay

- **WHEN** Regime tipping closes are calculated for a history and for each prefix
- **THEN** each prefix result equals the corresponding full-history rows
