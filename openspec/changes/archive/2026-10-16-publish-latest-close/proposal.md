# Publish the latest close

## Why

The line page names levels and returns but never the price itself. A reader opening it first looks for what the line closed at and how it moved that day, the way a broker shows it, in the currency they trade.

## What Changes

- **BREAKING** The snapshot schema goes from 11 to 12, and the key prefix with it (`analysis-snapshots/v12/`). Each available line adds `latestClose`: the latest State's close in pesos, MEP dollars and CCL dollars, the line's previous session, and the change since it in each currency, computed by the analysis.
- Each previous close uses only its own session's rate. When the previous session has no rate in a currency, that currency's change is `null`; no other session's rate stands in. The CCL part is `null` when the latest session has no CCL Rate, as `cclEquivalents` is.
- The line page shows the last close under the data date, unlabeled, with the day change as an absolute figure and a percentage, in each currency view: "$ 5.940 (+$ 60, +1,0 %)". No color: the sign carries the direction until the design slice.
- Every peso amount on the page is written with `$`, and every MEP or CCL dollar amount with `U$S`, as Argentines write them.

## Capabilities

### Modified Capabilities

- `analysis-run`: `latestClose`, schema version 12 and its validation.
- `web-app`: the last close at the top of the line page.

## Impact

- `src/analysis/modules/analysis-run`, `src/web`.
- The web build reads `analysis-snapshots/v12/latest.json`, which only a run from this commit writes: as with v11, the web build fails after the push until that run, and the previous deployment keeps serving.
