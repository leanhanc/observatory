# Retry transient provider fetch failures

## Why

The Analysis Run fetches every line once. A failed request is final: an analyzed line becomes `fetch-failed` for the day, and a failed MEP rate source request fails the whole run. Open BYMADATA's failures come in clusters, such as a short burst of HTTP 5xx answers or timeouts, and a request a minute later usually succeeds. Today a clustered outage of a few seconds removes lines from the day's snapshot, or loses the snapshot entirely when it hits AL30 or AL30D.

Not every failure is an outage. A `no_data` answer, a malformed body or bars that fail validation are the provider's answer. Asking again returns the same answer and only spends request budget and run time.

## What Changes

### Transient and final failures

The Open BYMADATA adapter's `request-failed` reason mixes outages with answers: it covers a request that could not be completed, every non-success HTTP status, and a body that is not JSON. The adapter now separates them:

| Adapter reason           | Cases                                                                                                              | Retried |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------- |
| `request-failed`         | network error, the command's 20 s request timeout, an unreadable body, HTTP 5xx, 408 or 429                        | yes     |
| `request-rejected` (new) | any other non-success HTTP status, such as 400, 403 or 404                                                         | no      |
| `provider-error`         | a JSON answer whose status is neither `ok` nor `no_data`                                                           | no      |
| `invalid-response`       | a body that is not JSON (moved from `request-failed`), a malformed or misaligned history, an unsupported timestamp | no      |

In the run, only an acquisition failure with reason `request-failed` is transient. Everything the run derives after a successful answer is final: `no-provider-bars` (`no_data`), `invalid-bars`, and the MEP rate source's validation failures.

`provider-error` stays final. The provider chose to answer with an error status in a well-formed body, which is an answer; if it later turns out to accompany outages, it can move to the transient side.

### MEP rate source

When AL30 or AL30D fails transiently, the run fetches the failed legs once more after a cool-down of 30 s. When both legs are retried, the usual 2 s pause separates them. If a leg still fails, the run fails with `mep-rate-source-unavailable` and writes nothing. There is no retry when it could not make the run succeed: when either leg failed finally, or the other leg answered with no bars. When one leg failed finally and the other transiently, the failure message names the final failure, since that is why no retry was made.

One retry, not more, is Lean's decision: a MEP outage longer than the cool-down fails the run, and Railway's failure notification surfaces it.

### Analyzed lines

A line that fails transiently in the main pass is not reported yet. After the main pass, the run waits 30 s and fetches those lines once more, in Catalog order, with the usual 2 s pause between requests. A line that succeeds is analyzed as any other line, through its Corporate Actions, liquidity gate and analysis. A line that fails again, for any reason, keeps the retry's failure. Every line is still reported exactly once, with its final outcome and its Catalog position. Lines reported after the retry pass are therefore out of position order, after the main pass's lines.

### Deadline

The two cool-downs are constants at the top of `src/modules/analysis-run/analysis-run.ts`, below the module's other constants. They are not in `ANALYSIS_CONFIGURATION`: retrying changes which fetches succeed, not what any result means.

Worst-case added time, with the command's 20 s request timeout and the 2 s pacing:

- MEP rate source: a 30 s cool-down and one retry of at most two requests (20 + 2 + 20 s), about 72 s.
- Analyzed lines: 30 s + k × (2 s + request time) for k retried lines. The dry run through 2026-10-08 took 365 s for 175 requests, about 2.1 s per request including the pause; the review measured up to about 3.1 s per line. At 3.1 s, retrying all 173 analyzed lines adds about 9.5 minutes. A timeout costs 22 s per line.

A pass of timeouts has no useful static bound: 30 lines that time out in both passes add 30 × 42 s, 21 minutes, to a main pass of 6 to 9 minutes, and the 30-minute deadline would then discard a snapshot the run without retries would have written. So the retry pass has a **cut-off**: before each pause of the pass, the run checks whether that pause would end at or after the cut-off, and if so leaves that line and the rest with their main-pass failure. The runner takes the cut-off as an option. The `analyze` command sets it to its deadline minus a 5-minute margin, `RETRY_DEADLINE_MARGIN_MS` next to `RUN_DEADLINE_MS` in `scripts/analysis-run.ts`, so 25 minutes by default and coupled to the deadline in one place. The last retry request starts before 25 minutes and ends, at worst, 20 s later, which leaves the snapshot write well inside the deadline. A pass that could not start before the cut-off does not wait for its cool-down. The command logs a warning naming the lines left unretried. MEP retries happen in the first minutes and are not cut off.

### Observability

- Each retry attempt is reported through the progress callback before its cool-down, and the command logs it at info with how many lines are retried, the retry number, the cool-down and each line's failure.
- A line that is still `fetch-failed` is logged as a warning, as every non-liquidity unavailable reason already is.
- Lines left unretried at the cut-off are reported and logged as a warning.

The snapshot does not record which lines needed a retry. A retry is an operational fact about this run's fetches, not a property of the line's market data or of what Observatory says about it, so it belongs in the run's log. Recording it would change the snapshot schema for something no reader of the snapshot needs.

### Alerting

No code. Lean relies on Railway's own deploy and cron failure notifications for now. The `analyze` command already exits non-zero whenever no snapshot is written, including a MEP rate source that fails after its retries and a missed deadline.

### Versions

The snapshot schema and the Analysis Configuration are unchanged.

## Trade-offs

- **Retried lines are reported late.** The log's position labels are no longer in order for those lines. The alternative, holding every report until the retry pass ends, would lose progress-as-it-happens for the whole run.
- **One retry for analyzed lines.** A second pass would add another full pacing cycle for a smaller gain; a line that fails twice usually reflects an outage longer than a minute.
- **The retry repeats the request, not the decision.** A retried line that answers differently, for example with bars that fail validation, takes the new outcome.
- **The cut-off can leave a recoverable line failed.** That trades one line's coverage for the whole snapshot, which the deadline would otherwise discard.
- **A body cut off mid-transfer may not be retried.** When a response body is truncated without a framing error, Bun parses the partial text and throws a `SyntaxError`, which the adapter reports as `invalid-response`, a final failure. A connection reset or a timeout during the read is still `request-failed` and retried. This edge is accepted rather than guessed around.

## Out of scope

- Retrying the snapshot write.
- Changing the request timeout or the pacing.
- Retries in the Bar History updater or canary, which use the same adapter but keep their behavior; their `request-failed` simply no longer includes 4xx statuses and non-JSON bodies.
- Alerting beyond Railway's notifications.
