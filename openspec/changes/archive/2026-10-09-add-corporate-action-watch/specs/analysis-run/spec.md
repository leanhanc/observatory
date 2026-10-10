## ADDED Requirements

### Requirement: the run watches for Corporate Action Notices

After the analyzed lines' main pass and retry pass, and before the snapshot write, the run SHALL fetch the relevant-facts feed once through the corporate-action-watch module, with the historical request pause before the request, for the seven calendar days ending on the Requested-Through Session. It SHALL match the notices against every analyzed Trading Line, whatever its analysis outcome, and against the run's Corporate Action list, the committed list unless the runner options replace it. The feed request SHALL NOT be retried and SHALL NOT be subject to the retry cut-off. The feed SHALL be fetched only when at least one analyzed line is available: a run that fails before analyzing lines, or with reason `no-analyzed-lines`, writes no snapshot to record the watch in.

A watch that is unavailable SHALL NOT fail the run, change any analyzed line or prevent the snapshot write. Nothing in the watch SHALL be applied to any bar. The watch rules SHALL be replaceable through the runner options, defaulting to the committed rules, and creating the runner SHALL fail when they do not fit the analyzed lines, as the corporate-action-watch module checks.

The `analyze` command SHALL log the watch once it is reported: an unavailable watch as one warning, `Corporate-action watch unavailable: <message>`; each candidate with at least one unlisted notice as one warning naming its Trading Line, and each notice's publication date, listing, title and PDF URL; each candidate whose notices are all listed the same way at info; and, when there is no candidate, one info entry naming the window.

#### Scenario: a feed failure does not fail the run

- **WHEN** the feed answers HTTP 500 and every analyzed line is available
- **THEN** the run writes a snapshot whose lines equal those of a run with a healthy feed
- **AND** its `corporateActionWatch` is `unavailable` with a message

#### Scenario: an unlisted candidate is logged as a warning

- **WHEN** a stock-dividend notice, document 479966, matches Galicia's line and the list has no Galicia entry near it
- **THEN** the command logs one warning naming `galicia-stock-byma-ars`, the notice's date, `unlisted`, its title, and `https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/479966`

#### Scenario: a listed candidate is logged at info

- **WHEN** the same notice matches and the list has a Galicia entry 7 days after it
- **THEN** the command logs the candidate at info

#### Scenario: an unavailable line is still watched

- **WHEN** a CEDEAR line fails to fetch and the feed has a stock-split notice for it
- **THEN** the line is unavailable and the watch has its candidate

#### Scenario: no snapshot can be written

- **WHEN** the run fails with reason `mep-rate-source-unavailable` or `no-analyzed-lines`
- **THEN** the feed is not requested

## MODIFIED Requirements

### Requirement: run-level facts are recorded

The snapshot SHALL record `schemaVersion: 4`, `ranAt` as a UTC instant, `requestedThroughSession`, `analysisConfigurationVersion` equal to `ANALYSIS_CONFIGURATION.version`, and `mepRateSource` with both MEP rate source Trading Line IDs, the date of the latest session that had a MEP Rate, `acceptedZeroOpens`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar accepted with a zero open, and `rangeRepairs`: one `{ tradingLineId, sessionDate }` for each MEP rate source bar whose range the adapter widened.

The snapshot SHALL also record `corporateActionWatch`: either `{ status: 'available', publishedFrom, publishedThrough, candidates }`, with the candidates from the corporate-action-watch module, or `{ status: 'unavailable', publishedFrom, publishedThrough, message }`. Version 4 differs from version 3 only by this field.

#### Scenario: configuration version is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `analysisConfigurationVersion` equals `ANALYSIS_CONFIGURATION.version`

#### Scenario: schema version is recorded

- **WHEN** a run completes
- **THEN** the snapshot's `schemaVersion` is `4`

#### Scenario: the watch is recorded

- **WHEN** a run completes through 2026-09-30 and the feed has a stock-split notice for an analyzed CEDEAR
- **THEN** the snapshot's `corporateActionWatch` is available from 2026-09-24 through 2026-09-30 with that line's candidate

### Requirement: snapshots are persisted as a dated object and as latest

A successful run SHALL write the snapshot as JSON to the S3-compatible bucket used for Bar History under two keys:

- dated: `analysis-snapshots/v4/<requestedThroughSession>/<ranAt>.json`
- latest: `analysis-snapshots/v4/latest.json`

The `v4` in the key prefix SHALL equal the snapshot's `schemaVersion`, so a reader of one schema never finds another schema's object under the keys it reads. Objects written under an earlier prefix SHALL be left in place.

The dated object SHALL be written first. `latest` SHALL be written only after the dated object was written. A failed write SHALL fail the run with reason `snapshot-write-failed`. Each successful run SHALL replace `latest`.

#### Scenario: dated and latest objects

- **WHEN** a run for 2026-10-02 completes at 2026-10-04T15:00:00.000Z
- **THEN** the snapshot is written to `analysis-snapshots/v4/2026-10-02/2026-10-04T15:00:00.000Z.json` and to `analysis-snapshots/v4/latest.json`

#### Scenario: dated write fails

- **WHEN** writing the dated object fails
- **THEN** `latest` is not written and the run fails with reason `snapshot-write-failed`

### Requirement: the run reports its progress

The Analysis Run SHALL accept an optional progress callback and SHALL call it, in order, with:

- `run-started` once the request is valid, before any fetch, with the Requested-Through Session, the number of analyzed Trading Lines and the Analysis Configuration version;
- `fetch-retry-started` before the cool-down of each MEP rate source retry, with scope `mep-rate-source`, the retry number, the number of retries allowed, the cool-down and each retried line's Trading Line ID and failure message;
- `mep-rate-source-fetched` once the MEP rate source yielded MEP Rates, with the Requested-Through Session and the latest MEP Rate session;
- `line-analyzed` once for each analyzed Trading Line that did not fail transiently, in Catalog order, as soon as that line is analyzed and before the next line is fetched, with its 1-based position, the number of analyzed Trading Lines and its snapshot entry;
- `fetch-retry-started` before the cool-down of the analyzed lines' retry pass, with scope `analyzed-lines` and the same fields;
- `line-analyzed` once for each line of the retry pass, in Catalog order, as soon as it is analyzed, with its Catalog position;
- `fetch-retry-stopped`, when the retry cut-off leaves lines unretried, with their Trading Line IDs, after the lines already retried and before the unretried lines, which are then reported as `line-analyzed` with their main-pass failure, in Catalog order;
- `corporate-action-watch-checked` once the relevant-facts feed was fetched and matched, after every `line-analyzed`, with the snapshot's `corporateActionWatch`.

Each analyzed Trading Line SHALL be reported exactly once, with its final outcome. Run-level failures SHALL NOT be reported through the callback; they are the run's result. An invalid request SHALL report nothing. Without a callback the run SHALL behave the same.

So that each line can be reported as soon as it is analyzed, each analyzed Trading Line SHALL be fetched in its own acquisition. The run SHALL keep the historical request pause before each of them in the main pass, so the provider sees the same pace as one acquisition of every line.

#### Scenario: each line is reported once, in order, with its outcome

- **WHEN** a run analyzes three lines and the second fails to fetch with a final failure
- **THEN** the callback receives `run-started`, `mep-rate-source-fetched`, then `line-analyzed` for positions 1, 2 and 3 in Catalog order, then `corporate-action-watch-checked`
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
