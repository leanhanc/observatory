# Line page wording

## Why

The line page shows the snapshot's facts with plain English labels and type names, which a reader who is not into technical analysis cannot use. The approved wording table (design.md) turns those facts into short Spanish sentences, in the order a reader asks: what the line is doing, where its support and resistance are, what would change that, what changed recently, and the detail.

Two Situation labels in the table depend on distance. "Caída sin piso confirmado" fits LAC, 12.8% below its last confirmed low, but not PEP, 0.8% below it. The cutoff is the noise band Regime already uses, half a typical daily move (0.5 × ATR14). The web must not compute it, so the analysis flags it. The Situations themselves stay threshold-free (ADR 0011): the flag selects wording only.

## What Changes

### 1. Analysis: the noise band flag

- Each active Situation gains `isBeyondNoiseBand`: whether the session's close is past the Situation's level by more than `ANALYSIS_CONFIGURATION.situations.noiseBandAtrMultiplier` (0.5) × the session's ATR(14). Exactly at the band is not beyond it. It is `null` when ATR(14) is unavailable.
- The value is the Situations' own setting, equal to Regime's band multiplier by convention, as each concept owns its parameters.
- The flag does not decide whether a Situation is active and does not affect `activeSinceSession`.
- ADR 0011 gains one line saying so.

### 2. Snapshot

- Schema version 8 → 9, under `analysis-snapshots/v9/`. Version 9 adds `isBeyondNoiseBand` on each Situation, and `readLatest` validates it. The change `count-period-returns-in-calendar-months` ships in the same version.

### 3. Web: the wording table

- Line pages and the not-found page are in Spanish, with es-AR numbers and dates. The home page stays as it is until its wording is settled.
- The line page follows the table: identity, what it is doing, support and resistance, what would change it, "Últimos cambios", detail.
- Tier 2 is open and collapsible, tier 3 collapsed, with `<details>` and `<summary>`: the site ships no JavaScript, and the published-output guard is unchanged.
- On a peso line, levels show the peso equivalent first, then MEP dollars.
- The run timestamp is hidden on line pages.
- New `src/web` helpers: `es-ar-formatting`, `line-wording` (one function per fact of the table, plus the recent-changes selection) and `line-identity` (ticker, type, Underlying and currency from the Instrument Catalog). They replace `line-formatting`.

### Versions

- `ANALYSIS_CONFIGURATION.version` 7 → 8: it adds `situations.noiseBandAtrMultiplier`.
- Snapshot `schemaVersion` 8 → 9. See design.md for the deploy order.

## Capabilities

### Modified Capabilities

- `instrument-state`: `isBeyondNoiseBand` on each Situation.
- `analysis-run`: schema v9, prefix `v9`, validation of the flag.
- `web-app`: the line page wording, order, tiers, formats and Situation labels; the not-found page in Spanish.

## Impact

- `src/analysis/lib/config.ts`, `instrument-state` (types, situation tracker), `analysis-run` (types, writer, schema, storage prefix).
- `src/web`: components, `lib/utils/es-ar-formatting`, `lib/utils/line-wording`, `lib/utils/line-identity`; `lib/utils/line-formatting` is removed.
- `docs/adr/0011-situations-are-threshold-free-conjunctions.md`: one line.
