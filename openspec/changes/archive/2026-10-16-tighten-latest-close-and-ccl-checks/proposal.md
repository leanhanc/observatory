# Tighten the latest close and the CCL checks

## Why

A review of the currency views and the latest close found the analysis correct, but the page and the snapshot read had gaps:

- A dollar change under a cent printed "U$S 0,00" next to a nonzero percentage on lines priced under a dollar, such as VALO "U$S 0,343 (U$S 0,00, −0,7 %)". A change counted as zero when it rounded to zero at two decimals, while a nonzero change was written with the price's significant digits.
- The stylesheet hid the USD and CCL variants in one selector list with `:has()` selectors, so a browser without `:has()` dropped the rule and showed all three views, where the spec says it shows ARS.
- The snapshot read did not check that the CCL figures agree with each other or with `cclRateSource`.
- The period-returns spec read as if every missing rate gives a `null` return, and the latest-close spec did not say what a dropped previous bar does to the day change.

## What Changes

- A day change is written with exactly the decimals its close prints, and is zero only when it rounds to zero at them, in dollars as in pesos: "U$S 0,343 (−U$S 0,002, −0,7 %)", and "U$S 3,81 (−U$S 0,01, −0,3 %)" where it was "−U$S 0,0105".
- The percentage of a change that moved keeps the change's sign when it rounds to zero: "$ 107.775 (−$ 50, −0,0 %)".
- The default-hide rule of the currency view stands alone, every `:has()` rule moves into an `@supports selector(:has(*))` block so the build's minifier cannot merge them again, and without `:has()` the radio inputs show the checked view.
- The snapshot read validates `cclRateSource`, requires every CCL figure to be `null` when it is, the latest close's peso and CCL closes to equal the equivalents' closes, and the three return lists to share their start sessions. The shape is the same, so the schema stays at 12.
- The period-returns spec says a session without a MEP Rate moves a window's start to the previous session in all three currencies, while one without a CCL Rate makes only the CCL return `null`. The latest-close spec says a dropped previous bar makes the day change span two sessions.
- No analysis change. More tests: the corporate-action correction of the peso returns and the day change, and the read's same-session check.

## Capabilities

### Modified Capabilities

- `web-app`: the day change's precision and the currency view without `:has()`.
- `analysis-run`: the snapshot read's CCL and latest-close checks, and the dropped previous bar.
- `period-returns`: how a missing MEP Rate and a missing CCL Rate differ.
- `dollarized-series`: `dollarizePrice`, the division of one peso price by its session's MEP Rate, which the day change's previous MEP close now names.

## Impact

- `src/web`: formatting, the currency-view stylesheet and the line wording.
- `src/analysis/modules/analysis-run`: the snapshot read schema; the analysis's `describeLatestClose` is renamed `measureLatestClose`, so `describe*` names only the web's wording.
- `src/analysis/modules/dollarized-series`: `dollarizePrice`, used by `dollarizeBarHistory` and the previous MEP close.
- The web build reads the same `analysis-snapshots/v12/latest.json`; the live snapshot of 2026-10-15 passes the tightened read.
