# Count period returns in calendar months

## Why

Period returns count 21, 63 and 252 Market Sessions back. The labels say "un mes", "tres meses" and "un año", and readers check them against their broker, which counts calendar periods.

The two disagree. BYMA trades about 240 to 245 sessions a year, so 252 Market Sessions from 2026-10-09 reach back to 2025-09-30, about nine days past a year. For GLD this start made the yearly return +10,1%. On GLDD's own closes, the line rose from 7,31 to 7,68 between 2025-09-30 and 2025-10-13, so where the year starts moves the return by about 5 points. Balanz showed +4,17%, measured from 13 Oct 2025 to today's price. Matched against GLDD's own closes, Balanz's numbers are the close one calendar day, week, month and year back.

Counting calendar months makes each label mean what it says. A session count would need a per-market calendar and would still drift with holidays.

## What Changes

- `calculatePeriodReturns(bars)` measures each window from the line's last close on or before the anchor date minus 1, 3 or 12 calendar months. A month end clamps to the target month's last day, so 31 Mar minus a month is 28 Feb.
- It no longer takes the MEP calendar: a calendar window spans the same dates for every line by construction.
- `ANALYSIS_CONFIGURATION.periodReturns.windowMarketSessions: [21, 63, 252]` becomes `windowMonths: [1, 3, 12]`.
- Each snapshot period return carries `windowMonths` instead of `windowMarketSessions`, and `readLatest` validates it.
- CONTEXT.md: **Period Return** counts calendar months.
- The line page names the windows by months, and "Últimos cambios" covers the one-month return's window. Those web requirements live in `add-line-page-wording`, which has not been archived yet, so that change carries the web side.

### Versions

This change ships with `add-line-page-wording` and shares its unreleased versions, so there is one bucket write and one deploy:

- `ANALYSIS_CONFIGURATION.version` 8, which neither change has released;
- snapshot `schemaVersion` 9.

If `add-line-page-wording` ships first, this change moves to config 9 and schema 10.

### Archive order

Archive `add-line-page-wording` first. This change's MODIFIED blocks for "run-level facts are recorded" and "the latest snapshot can be read with validation" include that change's text, so they must apply last. On archive, reword the Purpose of `openspec/specs/period-returns/spec.md`, which still describes windows of Market Sessions; a delta cannot change it.

## Capabilities

### Modified Capabilities

- `period-returns`: windows in calendar months.
- `analysis-run`: `calculatePeriodReturns` over the series alone; `windowMonths` in the snapshot and its validation.

## Impact

- `src/analysis/lib/config.ts`, `src/analysis/modules/period-returns`, `analysis-run` (call site, schema, tests).
- `src/web/lib/utils/line-wording` (window names, recent-changes window).
- CONTEXT.md.
