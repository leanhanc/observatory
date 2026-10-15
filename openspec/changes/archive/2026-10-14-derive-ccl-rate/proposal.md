# Derive the CCL Rate

## Why

The line design slice adds a price chart with an ARS / USD / CCL toggle. Per ADR 0005, every display currency is the analyzed MEP-dollar series converted with a same-session rate applied in reverse, and the display currency never changes the analysis. The Analysis Run fetches only the MEP pair, AL30 and AL30D, so there is no CCL rate to convert with.

AL30 also trades as AL30C, settled in dollars abroad (cable). The same close ratio that implies the MEP Rate from AL30 and AL30D implies the CCL Rate from AL30 and AL30C.

## What Changes

- The Instrument Catalog adds AL30's cable line, `al30-bond-byma-usd-ccl` with symbol `AL30C`.
- `dollarized-series` adds `CCL_RATE_SOURCE` (AL30 and AL30C) and `calculateCclRates`, which shares the close-ratio calculation of `calculateMepRates`. `validateMepRateSourceBars` becomes `validateRateSourceBars`, because the cable leg gets the same zero-open exception.
- After the MEP Rates and the liquidity window, the Analysis Run fetches AL30C once, derives the CCL Rates with the AL30 bars it already has, reports the latest CCL Rate and its session, and keeps the rates in its result.
- The CCL Rate is display-only. When AL30C cannot be fetched, fails validation or yields no CCL Rate, the run reports a warning and continues. AL30C is not retried. A MEP rate source failure still fails the run.
- The snapshot does not change: no CCL field, schema 10. The design slice's chart-data change publishes the MEP and CCL Rates together.

### Alternatives considered

- **Retry AL30C like the MEP legs.** A missing CCL Rate costs nothing yet, since nothing reads it, and a retry would add a 30 s cool-down to the run.
- **Write the CCL Rates to the snapshot now.** That would be a schema bump for a field nothing reads; the chart-data change decides the shape of both rate series together.

## Capabilities

### Modified Capabilities

- `dollarized-series`: the CCL Rate and its rate source.
- `instrument-catalog`: AL30's cable line.
- `analysis-run`: fetching the cable leg, reporting and logging the CCL Rate, and continuing without it.

## Impact

- `src/analysis/modules/dollarized-series`: CCL Rate calculation and rate source; the rate-source validation is renamed.
- `src/analysis/modules/instrument-catalog/data/instrument-catalog.v1.json`: one Trading Line.
- `src/analysis/modules/analysis-run` and `src/server/analysis-run`: one more provider request per run, a progress report and a log entry.
- `src/server/instrument-catalog-generator`: the renamed validation.
