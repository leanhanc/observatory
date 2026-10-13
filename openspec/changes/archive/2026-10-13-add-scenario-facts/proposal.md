# Scenario facts: support and resistance, Regime tipping closes, period returns and the first Situations

## Why

The line page is meant to answer, in order:

1. what the line is doing, with its magnitude;
2. whether there is confirmed support or resistance;
3. what would change that;
4. the detail.

The State already carries the levels and distances behind 2 and 4, but not the facts behind 1 and 3. It also leaves the reader to work out from a sign which level is still support.

- **Magnitude.** No fact says how far the line has moved over a familiar span. "12% below the last confirmed low" is not the whole fall, and conflating the two would mislead.
- **Support and resistance.** The State has the last confirmed swing low and high and the close's signed distance from each. Whether a level is support or resistance is a domain reading, and equality counts as on the level's side, as in the range rule. The web must not derive it from a sign.
- **What would change Regime.** Regime's proposal compares the close with a band around EMA(200), but the band's edges are not in the State, so the reader cannot see which close would satisfy Regime's price condition.
- **Combinations worth describing.** A line can be bearish with its close below its last confirmed low: falling, with nothing in confirmed data that marks where it stopped falling. Stating that is descriptive. "Don't catch it" would be advice, and "it usually bounces" an outcome claim, and both are out. Today the State has the parts but no named combination of them.

## What Changes

### 1. Support and resistance

- CONTEXT.md gains **Support** and **Resistance**:
    - Support is the last confirmed swing low while the close is at or above it.
    - Resistance is the last confirmed swing high while the close is at or below it.
    - Both are descriptive: where price last stopped falling or rising. "It will turn there again" is listed under _Avoid_.
- Each last confirmed swing in the State gains `closePosition`:
    - `at-or-above` or `below` for the low;
    - `at-or-below` or `above` for the high.
- Together the two fields cover every case: no level confirmed, only one level confirmed, between the levels, beyond either level, and beyond both after a gap. The web picks a label from them without arithmetic.

### 2. Regime tipping closes

- The State gains `regimeTippingCloses`, as of the session:
    - `bullish.closeAbove` is EMA200 + 0.5 × ATR14, the edge a close must be strictly above for the proposal to be `bullish`.
    - `bearish.closeBelow` is EMA200 − 0.5 × ATR14, the mirror.
    - Each side has `isFastEmaAligned`: whether EMA50 is already on that side of EMA200, the proposal's other condition.
- It is `null` while Regime's measurements are unavailable.
- These are conditions of our own rule, not targets, and they are approximate for a later close: that close moves EMA200 and ATR14 too. Even a close beyond the edge changes Regime only after three confirming sessions.
- The band is computed by the same regime-policy code that proposes Regime, so the predicate is not duplicated.
- `pesoEquivalents` gains both closes in pesos at the session's MEP Rate, like the swings.

### 3. Period returns

- A new `period-returns` module measures the close's percent change in MEP dollars over 21, 63 and 252 Market Sessions (about 1 month, 3 months and 1 year), as of the latest State's session.
- Windows count Market Sessions, the MEP calendar, rather than the line's own bars, so a window spans the same dates for every line. The start close is the line's last close on or before the window's first session.
- A return is `null` when the MEP calendar or the line's history does not reach back that far. It is never `0`.
- The windows are in `ANALYSIS_CONFIGURATION.periodReturns`.
- The module is separate from `calculateInstrumentStates`, which reads only bars. The Analysis Run calls it with the Dollarized Series and the run's Market Sessions, and publishes `periodReturns` next to `latestState`.
- CONTEXT.md gains **Period Return**.

### 4. The first Situations

Two Situations, each a conjunction of State parts:

- **Below the Last Confirmed Low in a Bearish Regime:** Regime is `bearish` and the close is strictly below the last confirmed swing low.
- **Above the Last Confirmed High in a Bullish Regime:** Regime is `bullish` and the close is strictly above the last confirmed swing high.

How they behave:

- "No newer low confirmed since" needs no separate condition, because the comparison is always with the _latest_ confirmed low. A new swing low cannot confirm while the close is below it: its three later bars all have higher lows, and the confirming bar is the current one. So the Situation ends when a new low confirms, when the close returns to or above the low, or when Regime leaves `bearish`. The mirror behaves the same way.
- The State gains `situations`: the active Situations, each with:
    - `type`;
    - `activeSinceSession`, the first session of the current unbroken run of sessions on which it holds;
    - `level`, the confirmed swing it is beyond.

    The list grows as Situations are added.

- **No thresholds.** RSI, the distance from the level and the distance from EMA(200) are not conditions. They are shown alongside from the same State, so a definition is not tuned until it "fires right".
- **Real data.** A dry run through 2026-10-09 has 12 lines below their last confirmed low in a bearish Regime. One, PEP, is only 0.84% below it. The wording has to show the distance next to the label, so a small move does not read as a crash.
- CONTEXT.md gains both Situation names. A new ADR records that Situations are threshold-free conjunctions on the current State.
- **Open wording item:** the user-facing label, for example "Caída sin piso confirmado" or something milder, is decided in the wording table.

### 5. Snapshot and web

- `latestState` gains `closePosition` on both swings, `regimeTippingCloses` and `situations`. Each available line gains `periodReturns`, and `pesoEquivalents` gains `regimeTippingCloses`. `readLatest` validates and returns them.
- The snapshot goes to `schemaVersion: 8` under `analysis-snapshots/v8/`.
- The line page renders the new facts with plain labels. Final wording comes later, from the wording table.

### Versions

- `ANALYSIS_CONFIGURATION.version` 6 → 7: it adds the period-return windows and the first Situation definitions.
- Snapshot `schemaVersion` 7 → 8. See design.md for the deploy order.
- A new ADR, 0011: Situations are threshold-free conjunctions on the current State.

## Capabilities

### New Capabilities

- `period-returns`: percent change of the close over fixed windows of Market Sessions.

### Modified Capabilities

- `technical-analysis`: `calculateRegimeTippingCloses`, built from the regime-policy bands.
- `instrument-state`: `closePosition` on the last confirmed swings, `regimeTippingCloses`, `situations`.
- `analysis-run`: schema v8, prefix `v8`, `periodReturns`, the new State parts and peso tipping closes, all validated by `readLatest`.
- `web-app`: the line page shows the new facts.

## Impact

- `src/analysis/lib/config.ts`, `technical-analysis/regime`, `instrument-state`, a new `src/analysis/modules/period-returns`, `analysis-run` (types, writer, schema, storage prefix), and `src/web` (line page, formatting).
- CONTEXT.md: Support, Resistance, Regime Tipping Close, Period Return, and the two Situations.
- `docs/adr/0011-situations-are-threshold-free-conjunctions.md`.
