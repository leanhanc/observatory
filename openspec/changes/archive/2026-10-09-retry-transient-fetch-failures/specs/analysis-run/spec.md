## ADDED Requirements

### Requirement: transient fetch failures are retried

A fetch failure SHALL be transient only when the acquisition failed with reason `request-failed`: the request could not be completed or read, timed out, or the provider answered HTTP 5xx, 408 or 429. Every other failure SHALL be final and SHALL NOT be retried: an acquisition failure with reason `request-rejected`, `provider-error` or `invalid-response`, a line with no provider bars (`no_data`), a line whose bars fail validation, and a MEP rate source leg that fails its validation. Asking again for an answer the provider already gave would return the same answer.

When a MEP rate source leg fails transiently, the run SHALL fetch the transiently failed legs once more, in their usual order, after a cool-down of 30 s. Two legs retried together SHALL keep the usual request pause between them. A leg that succeeded is not fetched again. There SHALL be no retry when it could not yield MEP Rates: when either leg failed finally, or when the other leg answered with no bars. The run SHALL fail with reason `mep-rate-source-unavailable` when a leg still fails after its retry, or at once when there is no retry. When one leg failed finally and the other transiently, the failure message SHALL name the final failure, because it is why no retry was made.

An analyzed Trading Line that fails transiently in the main pass SHALL be fetched once more after the main pass. The retry pass SHALL start with a cool-down of 30 s, SHALL fetch those lines in Catalog order and SHALL keep the usual request pause between them. A line that succeeds on retry SHALL be analyzed exactly as in the main pass. A line that fails again SHALL be unavailable with the retry's failure.

The runner SHALL accept a retry cut-off for analyzed lines, a run time measured from the run's start instant, and SHALL have no cut-off without one. Before each pause of the retry pass, the cool-down or a request pause, the run SHALL compare the run time at which that pause would end with the cut-off: when it would end at or after the cut-off, that line and the lines after it SHALL NOT be fetched again and SHALL keep their main-pass failure, `fetch-failed`. A retry pass that cannot start before the cut-off therefore does not wait for its cool-down. The `analyze` command SHALL set the cut-off to its deadline minus 5 minutes, 25 minutes with the default 30-minute deadline, so that the last retry, bounded by the request timeout, ends well inside the deadline. MEP rate source retries happen in the first minutes and are not subject to the cut-off.

The cool-downs and the number of retries SHALL be defined together in one place in the analysis-run module, and the deadline margin next to the deadline in the command. They SHALL NOT be part of the Analysis Configuration, because they change which fetches succeed, not what any result means. The snapshot SHALL NOT record which lines were retried.

#### Scenario: an analyzed line fails once and succeeds on retry

- **WHEN** the provider answers HTTP 503 for AAPL in the main pass and bars on the retry
- **THEN** AAPL's entry is available and analyzed from the retry's bars

#### Scenario: an analyzed line fails twice

- **WHEN** the provider answers HTTP 503 for AAPL in the main pass and on the retry
- **THEN** AAPL's entry is unavailable with reason `fetch-failed`
- **AND** AAPL is requested exactly twice

#### Scenario: no data is not retried

- **WHEN** the provider answers `no_data` for a line
- **THEN** the line is requested once and is unavailable with reason `no-provider-bars`

#### Scenario: an answer is not retried

- **WHEN** the provider answers HTTP 404, a body that is not JSON, a status of `error` or a malformed history for a line
- **THEN** the line is requested once and is unavailable with reason `fetch-failed`

#### Scenario: requests and pauses of a retry pass

- **WHEN** GGAL and NEW fail transiently in the main pass, AAPL between them succeeds, and both succeed on retry
- **THEN** after the main pass the run pauses 30 s, requests GGAL, pauses 2 s and requests NEW

#### Scenario: the MEP rate source recovers

- **WHEN** the provider answers HTTP 503 for AL30D once and then bars
- **THEN** the run requests AL30, pauses 2 s, requests AL30D, pauses 30 s, requests AL30D again and succeeds

#### Scenario: the MEP rate source does not recover

- **WHEN** the provider answers HTTP 503 for AL30D on every request
- **THEN** AL30D is requested twice, with a pause of 30 s before the second request
- **AND** the run fails with reason `mep-rate-source-unavailable`, fetches no analyzed line and writes nothing

#### Scenario: a final MEP rate source failure is not retried

- **WHEN** AL30 fails transiently and AL30D has an invalid bar
- **THEN** neither leg is requested again
- **AND** the run fails with reason `mep-rate-source-unavailable` and a message naming AL30D's failure

#### Scenario: a MEP rate source leg without bars

- **WHEN** AL30 answers `no_data` and AL30D fails transiently
- **THEN** neither leg is requested again and the run fails with reason `mep-rate-source-unavailable`

#### Scenario: a retry pass that would reach the cut-off

- **WHEN** the cut-off is 25 minutes and the main pass ends at 24:30 of run time with one line pending
- **THEN** the run does not wait for the cool-down, does not request the line again, and records it as `fetch-failed`

#### Scenario: a retry pass stopped at the cut-off

- **WHEN** the cut-off is 25 minutes and a retried line's request ends at 24:58 of run time with another line pending
- **THEN** the pending line is not requested again and is recorded as `fetch-failed`

#### Scenario: the command derives the cut-off from its deadline

- **WHEN** the deadline is 30 minutes and the main pass ends at 25:00 with one line pending
- **THEN** the command logs the cut-off warning and the line as `fetch-failed`
- **AND** with a 40-minute deadline the same line is retried

### Requirement: the command logs fetch retries

The `analyze` command SHALL log each retry attempt at info when it is reported, before its cool-down, with whether it retries the MEP rate source or analyzed lines, the retry number and the number of retries allowed, the cool-down, the number of lines and each line's Trading Line ID and failure message. It SHALL log lines left unretried at the cut-off as one warning, `Retry cut-off reached; N line(s) not retried: …`, naming them. A line that is still `fetch-failed` after its retry SHALL be logged once, as a warning, like every other unavailable reason except `insufficient-liquidity`.

#### Scenario: a retry pass is logged

- **WHEN** two analyzed lines failed transiently in the main pass
- **THEN** the command logs at info `Retrying 2 analyzed lines in 30 s after transient fetch failures: ...`, naming each line and its failure

#### Scenario: a MEP rate source retry is logged

- **WHEN** AL30D failed transiently on its first request
- **THEN** the command logs at info `Retrying the MEP rate source (retry 1 of 1) in 30 s after transient fetch failures: ...`

## MODIFIED Requirements

### Requirement: the run fails without usable MEP rates or without any analyzed line

The run SHALL fail and write nothing when either MEP rate source line cannot be fetched after its retries or fails validation, or when the two lines yield no MEP Rate. No analyzed line can be dollarized without them.

The run SHALL also fail with reason `insufficient-market-sessions` and write nothing when the MEP Rates on or before the Requested-Through Session are fewer than the liquidity window's 125 sessions. Every line shares that window, so no line's eligibility could be measured. In both cases no analyzed line SHALL be fetched. The run SHALL also fail and write nothing when no analyzed line is available, so that a snapshot made only of failures is never published.

#### Scenario: MEP source fetch fails

- **WHEN** the provider returns an error for AL30D on every attempt
- **THEN** the run fails with reason `mep-rate-source-unavailable`
- **AND** no snapshot is written

#### Scenario: every analyzed line fails

- **WHEN** the MEP rate source succeeds and every analyzed line fails
- **THEN** the run fails with reason `no-analyzed-lines`
- **AND** no snapshot is written

#### Scenario: too few market sessions

- **WHEN** the MEP rate source yields MEP Rates for only 124 sessions through the Requested-Through Session
- **THEN** the run fails with reason `insufficient-market-sessions`
- **AND** no analyzed line is fetched and no snapshot is written

### Requirement: the run reports its progress

The Analysis Run SHALL accept an optional progress callback and SHALL call it, in order, with:

- `run-started` once the request is valid, before any fetch, with the Requested-Through Session, the number of analyzed Trading Lines and the Analysis Configuration version;
- `fetch-retry-started` before the cool-down of each MEP rate source retry, with scope `mep-rate-source`, the retry number, the number of retries allowed, the cool-down and each retried line's Trading Line ID and failure message;
- `mep-rate-source-fetched` once the MEP rate source yielded MEP Rates, with the Requested-Through Session and the latest MEP Rate session;
- `line-analyzed` once for each analyzed Trading Line that did not fail transiently, in Catalog order, as soon as that line is analyzed and before the next line is fetched, with its 1-based position, the number of analyzed Trading Lines and its snapshot entry;
- `fetch-retry-started` before the cool-down of the analyzed lines' retry pass, with scope `analyzed-lines` and the same fields;
- `line-analyzed` once for each line of the retry pass, in Catalog order, as soon as it is analyzed, with its Catalog position;
- `fetch-retry-stopped`, when the retry cut-off leaves lines unretried, with their Trading Line IDs, after the lines already retried and before the unretried lines, which are then reported as `line-analyzed` with their main-pass failure, in Catalog order.

Each analyzed Trading Line SHALL be reported exactly once, with its final outcome. Run-level failures SHALL NOT be reported through the callback; they are the run's result. An invalid request SHALL report nothing. Without a callback the run SHALL behave the same.

So that each line can be reported as soon as it is analyzed, each analyzed Trading Line SHALL be fetched in its own acquisition. The run SHALL keep the historical request pause before each of them in the main pass, so the provider sees the same pace as one acquisition of every line.

#### Scenario: each line is reported once, in order, with its outcome

- **WHEN** a run analyzes three lines and the second fails to fetch with a final failure
- **THEN** the callback receives `run-started`, `mep-rate-source-fetched`, then `line-analyzed` for positions 1, 2 and 3 in Catalog order
- **AND** position 2 carries an unavailable entry with reason `fetch-failed`
- **AND** each line is reported before the next line is requested from the provider

#### Scenario: a retried line is reported after the main pass

- **WHEN** a run analyzes three lines and the second fails transiently in the main pass and again on retry
- **THEN** the callback receives `line-analyzed` for positions 1 and 3, then `fetch-retry-started` for one analyzed line, then `line-analyzed` for position 2 with reason `fetch-failed`
- **AND** position 2 is reported once

#### Scenario: MEP rate source failure

- **WHEN** the MEP rate source fails on every attempt
- **THEN** the callback receives only `run-started` and one `fetch-retry-started`
