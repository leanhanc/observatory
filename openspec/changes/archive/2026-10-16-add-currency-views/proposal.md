# Add currency views

## Why

A reader of the line page trades in pesos, thinks in MEP dollars, or compares against the CCL dollar, which is what CEDEAR arbitrage runs on. Today the page shows pesos first with the MEP price in parentheses, and returns only in MEP dollars, so a peso holder never sees the return they actually got. Brokers such as Balanz let the reader switch currency for the whole page.

Per ADR 0005, every view is the analyzed MEP-dollar series converted with a same-session rate: the analysis stays in MEP, and the display currency never changes it. The CCL Rate (AL30 ÷ AL30C) is already derived and logged by the Analysis Run.

## What Changes

- **BREAKING** The snapshot schema goes from 10 to 11, and the key prefix with it (`analysis-snapshots/v11/`). The analysis publishes the CCL figures, so the page computes nothing:
    - `cclRateSource`: the CCL Rate's two lines and its latest session, or `null` when the run had no CCL Rate.
    - each available line's `cclEquivalents`, next to `pesoEquivalents`: its close, last confirmed swings and Regime tipping closes at the latest session's CCL Rate, or `null` when that session has none;
    - each Structure Break's `cclEquivalents`, at its own session's CCL Rate, or `null` when that session has none;
    - each available line's `pesoPeriodReturns` and `cclPeriodReturns`, over the same sessions as `periodReturns`. A peso return includes devaluation. A CCL return whose start or end session has no CCL Rate is unavailable.
- `calculatePeriodReturns` takes session closes that may be `null` in the series' currency, and treats a `null` endpoint as unavailable rather than skipping it.
- `toCclEquivalent` divides a peso value by a stated session's CCL Rate.
- The line page gets an ARS / USD / CCL control that works without JavaScript: the build renders every view's variant of each price phrase, and CSS `:has()` shows the checked one. ARS is checked by default. The CCL option is hidden when the line has no CCL figures.
- Each view shows only its own currency: the "5.662 pesos (US$ 3,68)" pairing goes away. The currency note, the "apenas" rule, Events, period returns and "Más detalle" follow the view.
- The `analyze` command warns when the latest CCL Rate is older than the latest MEP Rate. The run result no longer carries `cclRates`: the snapshot records the CCL figures.

## Capabilities

### Modified Capabilities

- `analysis-run`: CCL and peso display figures in the snapshot, schema version 11 and its validation, the stale CCL warning.
- `period-returns`: session closes with `null` in the series' currency.
- `dollarized-series`: CCL equivalents.
- `web-app`: the currency control and per-view wording.

## Impact

- `src/analysis/modules/{analysis-run,period-returns,dollarized-series}`, `src/server/analysis-run`.
- `src/web`: line wording, formatting, the line page and a small stylesheet for the control.
- The web build reads `analysis-snapshots/v11/latest.json`, which only a run from this commit writes. The cron deploys the web at the run's own commit, so the next run writes v11 and deploys the web that reads it.
