# Schedule the Analysis Run

## Why

The Analysis Run only runs when someone types `bun run analyze --through-session YYYY-MM-DD`. ADR 0003 asks for the canonical analysis to run once per completed session and be persisted for SSR to read. This change runs it every weekday morning on Railway, with no one choosing the date.

## What Changes

1. **Default Requested-Through Session.** When `--through-session` is omitted, the command uses the calendar date before the current date in `America/Argentina/Buenos_Aires`. A run early in the morning therefore analyzes yesterday's session, which has always closed, so the existing rule that the Requested-Through Session must be before today's market date is unchanged. An explicit `--through-session` still wins.
2. **Non-trading dates.** The default is a calendar date, not a known trading session; the run has no holiday calendar. When it falls on a holiday, the provider has no bar for it, and the run analyzes through the latest bar on or before it, as it already does. The snapshot records the date that was requested, not the last session found. `mepRateSource.latestRateSessionDate` and each line's `window.lastSessionDate` already show which session was actually analyzed, so the gap is visible without a second field. Such a run still replaces `latest`. It re-publishes the same States, which is harmless. Detecting non-trading dates to skip the write would add a new outcome to justify for a cosmetic gain.
3. **Exit status.** The command exits `0` after a written snapshot and `1` on any failure, logging one `Analysis Run failed: <reason>: <message>` error entry. Railway cron requires the process to exit, and the exit code is how a failed run shows up in the deployment list.
4. **Progress.** With about 173 lines a run takes several minutes, and until now it was silent until the end. The runner takes an optional progress callback, defaulting to a no-op, and reports the start, the MEP rate source and each analyzed line as soon as it is analyzed. The command wires the callback to the Observatory logger (pino), with JSON in production, so Railway's log view can filter by field, and readable lines locally. Each line is logged once with its outcome: available with its last session and Event count, or unavailable with its reason, plus the liquidity measures when the liquidity gate excluded it. The final entry gives counts, snapshot locations and duration; the old per-line summary is gone because each line has already been logged. Unavailable lines other than `insufficient-liquidity` log as warnings, since they are data problems rather than an expected filter. Logs carry dates, IDs, outcomes and object keys only, never storage credentials.
    - **Per-line acquisition.** The acquirer fetches all the lines it is given in one call, so the run could not report a line before every line was fetched. Rather than add a hook to bar-history, the run now gives the acquirer one line at a time, keeping the 2 s pause before each, so the pace the provider sees is unchanged. The acquirer is untouched.
5. **Schedule.** `railway.json` declares a Railway cron service that runs `bun run analyze` at `0 9 * * 2-6`: Tuesday to Saturday at 09:00 UTC, which is 06:00 in Buenos Aires (Argentina has no DST). That covers the Monday–Friday sessions. Restarts are disabled: a failed run stays failed and visible instead of being retried silently. The next day's run catches up anyway, because each run fetches the full window.
6. **Railway service.** One service in the Observatory project, built from this repository. The six `OBSERVATORY_STORAGE_*` variables are reference variables to the project's `history-bars` bucket, the same bucket the local `.env` uses, so no secret is copied. `NODE_ENV=production` selects the logger's JSON output.

## Trade-offs

- **06:00 next day vs. ~18:00 same day.** Running after the close the same day would publish about 12 hours sooner. It requires accepting today's date once the session has closed. The run would then need the closing time, the auction schedule and early closes, and it would have to wait until the provider publishes the final bar. The M1 rule rejects today's date as a whole precisely to avoid knowing any of that. For a daily-bar product, a morning publish before the next open loses nothing a reader can act on.
- **Holiday runs.** On a Tuesday–Saturday after a holiday, the snapshot is a re-run of the previous session. See point 2.

## Run time

About 173 analyzed lines (21 stocks and 152 CEDEARs) plus the two MEP rate source lines at the 2 s pacing take about 6–15 minutes, depending on provider latency. Both fit well inside a daily schedule, and Railway skips a cron run while the previous one is still running, so runs cannot overlap.

## Scope

- Default session, progress logging, exit status, cron config and the Railway service.
- No change to what a run fetches, analyzes or writes.

## Follow-ups

- **Alerting.** A failed run is visible in Railway's deployment list and logs only; nobody is notified.
- **`latest` ordering.** A manual run for an older session still replaces `latest`.
- **CEDEAR universe and liquidity gate.**
- **Panel membership and cadence.** Leaders daily, the rest every 2–3 days.
