# Add Analysis Run

## Why

Observatory can dollarize a peso-line history, describe each session as an Instrument State and detect Regime Transition, Structure Break and Volatility Expansion Events. Nothing yet runs that analysis for the supported universe and keeps the result. ADR 0003 asks for canonical analysis to be computed once per update, persisted, and read by SSR instead of being recomputed for each visitor. The Analysis Run is that step: it produces one Analysis Snapshot that a later page can read.

## What Changes

Add an `analysis-run` module and a manual `bun run analyze --through-session YYYY-MM-DD` command.

One Analysis Run:

1. **Fetches fresh.** It fetches the provider's full available window (about two years) from Open BYMADATA, first for the MEP rate source lines (AL30 and AL30D) and then, if they yield MEP Rates, for every analyzed Trading Line. The Requested-Through Session must be before the current market date in Buenos Aires, so a session still trading is never analyzed. It reuses the existing Open BYMADATA adapter and acquirer, with their request pacing. It neither reads nor writes stored Bar Histories. Stored history can mix price scales after provider adjustments (see `handle-provider-adjusted-history`); one fresh fetch is always on a single scale.
2. **Validates** each fetched line with the existing Daily Bar validation, because dollarization and analysis assume validated input. The MEP rate source lines accept a zero open, which the run records: the provider serves AL30 and AL30D with `open: 0` on a traded session (2025-10-13), and the MEP Rate reads only closes and volume. Without this exception every run would fail until that bar leaves the provider's window.
3. **Dollarizes** each analyzed line with `calculateMepRates` and `dollarizeBarHistory`.
4. **Analyzes** each Dollarized Series with `calculateInstrumentStates`, `detectRegimeTransitionEvents`, `detectStructureBreakEvents` and `detectVolatilityExpansionEvents`. It adds no calculations.
5. **Persists** one Analysis Snapshot to the existing S3-compatible bucket, as a dated object and as a `latest` object.

The analyzed Trading Lines are the BYMA peso (`ARS`) lines of the Catalog's stocks and CEDEARs, per ADRs 0004 and 0005.

The snapshot records, per analyzed Trading Line, the latest Instrument State and every Event in the analyzed window. At run level it records the run time, the Requested-Through Session, the Analysis Configuration `version` and the MEP rate source. It does not record the full State series.

Failures are explicit:

- An analyzed line that cannot be fetched, fails validation or has no dollarized bars appears in the snapshot as unavailable, with a reason. The run continues.
- If the MEP rate source fails or yields no rate, no line can be dollarized. The run fails and writes nothing.
- If no line could be analyzed, the run fails and writes nothing, so a snapshot made only of failures never becomes `latest`.

The `bar-history` module's public index additionally exports the Open BYMADATA adapter and acquirer factories, `validateDailyBars` and the historical request pause, so the run can fetch and validate without storing and keep the request pace between its two acquisitions. Their behavior is unchanged.

The `dollarized-series` contract for `calculateMepRates` now states what it actually reads: chronological legs with positive finite closes. Open, high and low were never read.

## Scope

- Manual trigger only.
- One snapshot schema version (`1`).
- No new indicator, State or Event calculations.

## Follow-ups

- **Scheduling.** Run after each completed session (Railway cron) and choose the Requested-Through Session automatically.
- **Stored history.** Use and update stored Bar Histories, and apply provider adjustments, once `handle-provider-adjusted-history` is complete. Until then the analyzed window is the provider's window, about two years.
- **AL30/AL30D adjustment check.** A single fetch cannot tell whether AL30 and AL30D were adjusted by the same factor for a coupon. If they were not, the MEP Rate shifts at that date, and so does every Dollarized Series. Detecting this needs history observed across the adjustment.
- **`latest` ordering.** Every successful run replaces `latest`, including a manual run for an older Requested-Through Session. Scheduling should prevent `latest` from moving backwards.
- **Corporate actions and CEDEAR ratio changes.** ADR 0005 requires adjusting for them before analysis consumes real history, and the safeguard that flags a large one-session move with no detected adjustment (`handle-provider-adjusted-history`, decision 4) does not exist yet. Until it does, snapshot Events may include artifacts of an unadjusted split or ratio change.
- **Snapshot content.** The full State series, Structure Evidence, volume comparison, and the SSR page that reads `latest`.
