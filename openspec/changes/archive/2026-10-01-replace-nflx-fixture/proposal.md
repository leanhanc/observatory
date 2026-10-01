# Replace the NFLX fixture with BYMA data

## Why

The technical-analysis reference fixture `nflx-501.csv` is US market data copied from the research lab. ADR 0006 keeps US market data in the lab, so this public repository must not carry it.

## What Changes

Replace the NFLX fixture with `ggal-413.csv`: 413 completed GGAL sessions from Open BYMADATA, 2025-01-20 through 2026-09-30. The window starts after a provider bar on 2025-01-17 whose close is below its low, so every fixture bar is internally consistent.

The numeric conventions do not change. The new reference values were computed by the historical Swift implementation on the same file and reproduced exactly by the TypeScript implementation, so the requirement still checks parity with the lab's conventions rather than values produced by the code under test.

## Scope

Only the fixture, the reference scenario, and the tests that load the fixture change. Removing the old file from git history is out of scope.
