# Snapshot schema v6: Volatile Session, price unit, distance from EMA(200)

## Why

Reading the prerendered line pages raised three gaps in what the snapshot says.

1. **The Event name says more than the Event.** "Volatility expansion" conventionally names a phase of widening ranges. The Event is narrower: one completed session whose True Range, gaps included, is more than 1.8 times the ATR(14) known the session before. It is direction-neutral and each qualifying session is its own fact. "Wide-range session" was also considered and rejected as unclear.
2. **Prices have no unit.** The run analyzes the Dollarized Series (ADR 0005), so every price and ATR in the snapshot is in MEP dollars, but nothing says so. Only `medianDailyTradedValueUsd` names a unit. A reader of a page sees a close of 7.12 for a stock that trades at thousands of pesos.
3. **The close's distance from EMA(200) has no magnitude.** Regime already compares the close with EMA(200): its proposal is bullish only when the close is above EMA(200) by more than half an ATR(14) and EMA(50) is above EMA(200), bearish in the mirror case, and mixed otherwise. That comparison is categorical: it says which side of a band the close is on, not how far. A close 1% above the most widely watched long-term trend reference and one 40% above it read the same, and a reader cannot tell a close that is just clearing the band from one that is stretched far from its average.

## What Changes

### 1. Volatility Expansion becomes Volatile Session

- CONTEXT.md: the term becomes **Volatile Session**, with "Volatility Expansion" under _Avoid_. "Volatile" is relative to the line's own recent range, not absolute.
- Specs, code, tests and fixtures: `detectVolatilityExpansionEvents` becomes `detectVolatileSessionEvents`, `VolatilityExpansionEvent` becomes `VolatileSessionEvent`, the per-session row `VolatilityExpansionSession` becomes `VolatileSessionRow` (a `VolatileSessionSession` would repeat itself), and the module folder becomes `technical-analysis/volatile-session`.
- Snapshot: the Event `type` becomes `volatile-session`. The evidence field `expansionMultiple` repeats the old term and becomes `atrMultiple`, what it measures: True Range in multiples of the prior ATR. `trueRange`, `baselineAtr` and `baselineThroughSessionDate` are unchanged.
- Configuration: `ANALYSIS_CONFIGURATION.volatilityExpansion` becomes `volatileSession`, and its `expansionThreshold` becomes `atrMultipleThreshold`. The values are unchanged.
- Detection is unchanged: the same sessions qualify with the same evidence.

### 2. The snapshot declares its price unit

- The snapshot gains a top-level `priceUnit: 'mep-dollar'`, in the ADR 0005 vocabulary ("MEP dollars"). It covers every price and price-denominated measurement in the snapshot; it is not repeated per value.
- `readLatest` validates and returns it, and the line page labels every price and ATR it shows with it: `7.12 MEP dollars`. The page takes the unit from the snapshot; a later display currency (ADR 0005 allows pesos or CCL dollars) would be a User-Context Projection and is out of scope.

### 3. Instrument State gains `priceRelativeToLongTermEmaInPercent`

- Definition: `(close − EMA200) / EMA200 × 100`, unrounded, on the Dollarized Series. `-4.2` means the close is 4.2% below its 200-session average. The name follows `priceRelativeToEmaInAtr`, and the page rounds for display as it does every number.
- It is a description, not a signal.
- `ANALYSIS_CONFIGURATION.instrumentState` gets its own `longTermEmaPeriod: 200`. It does not borrow Regime's `slowEmaPeriod`, because each concept owns its periods.
- `null` until EMA(200) is readable under the existing EMA warm-up rule: positions 0 through 198, readable from the 200th bar. Never `0` or a carried value.
- `priceRelativeToEmaInAtr` (EMA(20) in ATR units) stays in the snapshot and on the page unchanged. Whether to relabel or hide it is left to the UX work.

### Versions

- `ANALYSIS_CONFIGURATION.version` goes from 4 to 5, because the Instrument State gains a measurement with a new configured period. Existing values and results are unchanged; the renamed configuration keys do not change any result.
- The snapshot goes to `schemaVersion: 6` under the `analysis-snapshots/v6/` prefix, because a reader of v5 cannot read the renamed Event type, the renamed field, the new State part or the price unit.

## Capabilities

### Modified Capabilities

- `technical-analysis`: the Volatile Session rename, its `atrMultiple` field and threshold name.
- `instrument-state`: the new State part, its configured period and warm-up.
- `analysis-run`: snapshot schema v6, `priceUnit`, the renamed Event and the new State part in `readLatest`.
- `web-app`: the line page shows the new part and labels prices and ATRs with the snapshot's unit.

## Impact

- `src/analysis/lib/config.ts`, `src/analysis/modules/technical-analysis/volatile-session/`, `instrument-state`, `analysis-run` (types, writer, schema, storage prefix), `src/web` (line page, formatting, page props).
- CONTEXT.md glossary entry.
- Deploy order: the web build reads `analysis-snapshots/v6/latest.json`, which does not exist until a v6 run writes it. See design.md.
- No ADR: the rename and the new State part do not change an analysis decision recorded in an ADR, and the price unit records ADR 0005's existing decision.
