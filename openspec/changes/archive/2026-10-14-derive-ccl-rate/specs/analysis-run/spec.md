## ADDED Requirements

### Requirement: the run derives the CCL Rate for display

Once the MEP Rates yielded the liquidity window, and before any analyzed Trading Line is fetched, the run SHALL fetch the provider's full available window through the Requested-Through Session for `CCL_RATE_SOURCE`'s cable-bond line, AL30C, in one acquisition after the historical request pause. The peso-bond leg, AL30, SHALL NOT be fetched again: the run SHALL derive the CCL Rates with `calculateCclRates` from the AL30 bars its MEP rate source fetch already validated and the AL30C bars. A CCL Rate SHALL therefore come from the same session's AL30 and AL30C closes, and a session where either leg did not trade SHALL have none.

AL30C SHALL be validated like a MEP rate source line: a chronological Daily Bar history whose only accepted defect is a zero open, because the CCL Rate reads only the close and volume.

The CCL Rate is for display only. When AL30C fails to fetch, fails validation, answers with no bars, or the two legs yield no CCL Rate, the run SHALL report the CCL Rate as unavailable and continue: the analysis and the snapshot SHALL NOT depend on it. AL30C SHALL NOT be retried. A MEP rate source failure SHALL still fail the run, and the run SHALL NOT fetch AL30C when it does.

A successful run result SHALL carry `cclRates`: every CCL Rate through the Requested-Through Session in session order, or `null` when the CCL Rate was unavailable. The snapshot SHALL NOT record CCL Rates or any other CCL field, and the CCL Rates SHALL NOT be used to dollarize or analyze any line.

#### Scenario: the cable leg is fetched after the MEP rate source

- **WHEN** a run succeeds
- **THEN** the provider is asked for AL30, then AL30D, then AL30C, with the historical request pause before AL30C, and only then for the analyzed lines
- **AND** AL30 is requested once

#### Scenario: the CCL Rate comes from the same session

- **WHEN** AL30 closes at 86260 and AL30C at 53.3 on the Requested-Through Session, and both closed differently the session before
- **THEN** the latest CCL Rate is 86260 / 53.3 on the Requested-Through Session

#### Scenario: a session without a cable trade has no CCL Rate

- **WHEN** AL30C has volume 0 on the Requested-Through Session
- **THEN** the latest CCL Rate is the previous session's, reported with that previous session's date

#### Scenario: the cable leg fails

- **WHEN** the provider answers HTTP 503 or `no_data` for AL30C
- **THEN** AL30C is requested once, the CCL Rate is reported as unavailable, the run writes its snapshot and its result's `cclRates` is `null`

#### Scenario: the snapshot is unchanged

- **WHEN** a run succeeds with CCL Rates
- **THEN** the snapshot's `schemaVersion` is `10` and it has no CCL field
- **AND** every analyzed line is dollarized with MEP Rates only

#### Scenario: a MEP rate source failure still fails the run

- **WHEN** the provider answers HTTP 503 for AL30D on every request
- **THEN** the run fails with reason `mep-rate-source-unavailable` and AL30C is not requested

### Requirement: the command logs the CCL Rate

The `analyze` command SHALL log `ccl-rate-derived` at info with the latest CCL Rate session and the rate, and `ccl-rate-unavailable` as a warning with its message, saying that the run continues without it.

#### Scenario: the CCL Rate is logged

- **WHEN** the latest CCL Rate is 1618.39 on 2026-10-14
- **THEN** the command logs at info `CCL Rate 1618.39 on 2026-10-14.`

#### Scenario: an unavailable CCL Rate is a warning

- **WHEN** AL30C fails to fetch
- **THEN** the command logs a warning that starts with `CCL Rate unavailable:` and names the failure, and the run goes on to write its snapshot

## MODIFIED Requirements

### Requirement: the run reports its progress

The Analysis Run SHALL accept an optional progress callback and SHALL call it, in order, with:

- `run-started` once the request is valid, before any fetch, with the Requested-Through Session, the number of analyzed Trading Lines and the Analysis Configuration version;
- `fetch-retry-started` before the cool-down of each MEP rate source retry, with scope `mep-rate-source`, the retry number, the number of retries allowed, the cool-down and each retried line's Trading Line ID and failure message;
- `mep-rate-source-fetched` once the MEP rate source yielded MEP Rates, with the Requested-Through Session and the latest MEP Rate session;
- `ccl-rate-derived` once the cable leg yielded CCL Rates, with the latest CCL Rate session and that rate, or `ccl-rate-unavailable` with a message saying why there is none;
- `line-analyzed` once for each analyzed Trading Line that did not fail transiently, in Catalog order, as soon as that line is analyzed and before the next line is fetched, with its 1-based position, the number of analyzed Trading Lines and its snapshot entry;
- `fetch-retry-started` before the cool-down of the analyzed lines' retry pass, with scope `analyzed-lines` and the same fields;
- `line-analyzed` once for each line of the retry pass, in Catalog order, as soon as it is analyzed, with its Catalog position;
- `fetch-retry-stopped`, when the retry cut-off leaves lines unretried, with their Trading Line IDs, after the lines already retried and before the unretried lines, which are then reported as `line-analyzed` with their main-pass failure, in Catalog order;
- `corporate-action-watch-checked` once the relevant-facts feed was fetched and matched, after every `line-analyzed`, with the snapshot's `corporateActionWatch`.

Each analyzed Trading Line SHALL be reported exactly once, with its final outcome. Run-level failures SHALL NOT be reported through the callback; they are the run's result. An invalid request SHALL report nothing. Without a callback the run SHALL behave the same.

So that each line can be reported as soon as it is analyzed, each analyzed Trading Line SHALL be fetched in its own acquisition. The run SHALL keep the historical request pause before each of them in the main pass, so the provider sees the same pace as one acquisition of every line.

#### Scenario: each line is reported once, in order, with its outcome

- **WHEN** a run analyzes three lines and the second fails to fetch with a final failure
- **THEN** the callback receives `run-started`, `mep-rate-source-fetched`, `ccl-rate-derived`, then `line-analyzed` for positions 1, 2 and 3 in Catalog order, then `corporate-action-watch-checked`
- **AND** position 2 carries an unavailable entry with reason `fetch-failed`
- **AND** each line is reported before the next line is requested from the provider
- **AND** the feed is requested after the last line, with the historical request pause before it

#### Scenario: a retried line is reported after the main pass

- **WHEN** a run analyzes three lines and the second fails transiently in the main pass and again on retry
- **THEN** the callback receives `line-analyzed` for positions 1 and 3, then `fetch-retry-started` for one analyzed line, then `line-analyzed` for position 2 with reason `fetch-failed`
- **AND** position 2 is reported once

#### Scenario: MEP rate source failure

- **WHEN** the MEP rate source fails on every attempt
- **THEN** the callback receives only `run-started` and one `fetch-retry-started`
