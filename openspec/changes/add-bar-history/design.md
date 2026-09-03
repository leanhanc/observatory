## Context

See [proposal.md](./proposal.md) for motivation and [the Bar History specification](./specs/bar-history/spec.md) for behavior. Observatory currently has no production market-data persistence, so this capability establishes its initial market-data contract from the accompanying specification and current domain model.

Open BYMADATA exposes separate BYMA trading lines, approximately two years of daily history, batched current-market panels, and source-specific carried-close rows. The application will run on Bun and Railway within a small hobby budget. Railway Buckets expose private S3-compatible object storage but do not provide object versioning, lifecycle rules, or automatic backups.

## Goals / Non-Goals

**Goals:**

- Present one small provider-independent Bar History interface to analysis and orchestration code.
- Keep normalization, validation, and reconciliation deterministic and testable without Railway or network access.
- Minimize provider requests by sharing batched panel responses across Trading Lines.
- Persist complete histories in a simple format that is inspectable and replaceable.
- Make missing, stale, invalid, or partially updated histories visible to consumers.

**Non-Goals:**

- Instrument-catalog management or automatic discovery of BYMA species.
- Corporate-action ingestion, split/dividend adjustment, or total-return series.
- Scheduling, market-calendar policy, analysis, snapshot generation, SSR, or browser data access.
- Intraday bars, quotes, charts, or redistribution endpoints for raw market data.
- Historical object revisions, rollback, or a transactionally consistent snapshot across the entire universe.

## Decisions

### 1. A deep Bar History module owns the complete workflow

The public application boundary will expose two batch operations conceptually equivalent to:

```ts
readBarHistories(request);
updateBarHistories(request);
```

`updateBarHistories` orchestrates fetch, transformation, reconciliation, validation, and persistence. Pure domain functions implement transformation-independent validation and reconciliation. Provider and storage access sit behind narrow adapters.

Bar History does not try to interpret identifiers such as `cedear-aapl-mep`. The instrument catalog tells it which Trading Lines to update and how Open BYMADATA identifies each one. We can decide how the catalog passes that information during implementation.

Alternative considered: expose fetch, merge, and storage as separate application steps. Rejected because callers could skip validation, store provider-shaped rows, or duplicate orchestration policy.

### 2. The stored envelope is complete and self-describing

Storage schema v1 will represent a history approximately as:

```ts
type StoredBarHistoryV1 = {
	schemaVersion: 1;
	tradingLineId: string;
	source: {
		provider: 'open-bymadata';
		symbol: string;
	};
	priceAdjustment: 'none';
	backfilledAt: string;
	lastReconciledAt: string | null;
	checkedThroughSession: string;
	bars: DailyBar[];
};
```

Operational instants are UTC ISO-8601 strings. Session dates are Buenos Aires civil dates and are not represented as instants. The newest bar date is derived from `bars`; it is intentionally not duplicated as metadata.

The initial ID convention is catalog-owned, readable lowercase kebab-case, for example `cedear-aapl-ars`, `cedear-aapl-mep`, and `cedear-aapl-ccl`. Bar History treats the ID as opaque.

Alternative considered: one file per bar or separate metadata and bars files. Rejected because it creates more reads and consistency edges without helping histories of this size.

### 3. Incremental refresh and reconciliation are distinct acquisition modes

The scheduled caller provides an explicit `throughSession` that it has determined is completed. Bar History does not guess the latest completed session from wall-clock time.

- **Initial backfill:** request all daily history currently available for each Trading Line.
- **Ordinary refresh:** fetch the newest completed session from BYMA's batched CEDEAR, leading-equity, and general-equity panels when the stored line is already caught up to the preceding session.
- **Catch-up:** when more than the ordinary refresh interval is missing, request the missing historical interval for that Trading Line before advancing progress.
- **Reconciliation:** request the provider's complete currently available historical window, intended to run staggered approximately monthly.

Grouping ordinary refreshes by provider panel avoids one request per Trading Line. Initial backfill, catch-up, and reconciliation may require per-line historical requests and therefore must respect provider limits in their orchestration.

Alternative considered: use the historical endpoint for every line every day. Rejected because reducing the requested date range does not reduce request count, while the panels provide the newest market rows in a small number of batch calls.

### 4. Provider transformation happens before domain validation

The Open BYMADATA adapter owns provider field names, timestamps, panel categories, symbols, and carried-close detection. It emits normalized candidate bars or explicit adapter failures.

Rows with `open = high = low = volume = 0` and a carried close are omitted before Daily Bar validation. This rule is provider-specific; zero volume by itself remains legal in the domain. Currency and settlement identity come from the catalog entry rather than being inferred from an individual bar.

Candidate bars then pass through pure reconciliation and full-history validation. Reconciliation uses `sessionDate` as identity, sorts oldest to newest, adds new sessions, leaves identical sessions unchanged, and replaces differing valid sessions as corrections.

Alternative considered: preserve carried-close rows as flat bars. Rejected because they manufacture sessions and distort gap, volatility, liquidity, and structure analysis.

### 5. One mutable JSON object is stored per Trading Line and schema version

Each Trading Line uses one key:

```text
<trading-line-id>/v1/history.json
```

`v1` is the storage schema version, not a history revision. There are no UUIDs, timestamped snapshots, current pointers, or immutable history objects. A future incompatible representation can be written under `v2` and migrated deliberately.

The storage adapter will use an explicitly configured Bun `S3Client` against a private Railway Bucket. It will read and write complete JSON values in memory because reconciliation already requires the complete history and the expected files are small. Every read is schema- and domain-validated; successful JSON parsing alone is insufficient.

Before replacement, the complete candidate envelope is serialized and validated. A successful S3 `PUT` atomically replaces the individual object, so readers observe the old complete object or the new complete object rather than partial JSON. This does not protect against an unknown logical bug that passes validation and does not provide rollback; those limitations are accepted for v1.

Bun credentials, Railway endpoint style, content type, transport errors, and retries remain inside the storage adapter. Integration tests must exercise actual Railway-compatible configuration and replacement behavior. Streaming, `exists()`-then-write checks, presigned browser access, and conditional S3 writes are unnecessary for v1.

Alternative considered: immutable daily history snapshots selected through a mutable pointer. Rejected because schema versioning was the actual requirement; daily snapshots would duplicate almost all stored data and add pointer recovery complexity.

### 6. One writer per Trading Line replaces concurrency machinery

Only one update process may write a given Trading Line at a time. The scheduled workflow must not overlap itself. Bun's high-level S3 API does not document conditional replacement headers, and the system does not need them while this rule holds.

Batch reads load each requested object once and return in-memory values that remain stable for that consumer. The storage layer does not promise a transactionally consistent universe-wide read. Scheduled orchestration should complete the market-data update before starting analysis, and analysis must inspect each line's `checkedThroughSession`.

Alternative considered: conditional writes and a universe manifest. Deferred until competing writers or independently timed analysis demonstrate the need.

### 7. Per-line results preserve partial progress

Fetches may be shared, but reconciliation and persistence commit independently per Trading Line. Results preserve every requested identifier and use stable status/failure unions instead of exceptions for expected per-line outcomes.

Provider-wide or storage-wide failures may produce failures for multiple lines, but successful lines are not rolled back. Unexpected programming errors may still reject the outer operation.

The reconciliation result carries structured old/new correction details. Application orchestration logs each correction through the shared logger at `src/modules/logger`, using the event name `market-history-correction`. Pure domain reconciliation does not log or emit side effects itself.

## Risks / Trade-offs

- **[An invalid logical update could pass validation and overwrite good history]** → Keep validation strict, add discriminating merge/reconciliation tests, and revisit bounded backups only if operational evidence justifies them.
- **[A second writer could silently replace newer state]** → Enforce one non-overlapping writer per Trading Line; add conditional replacement only after Railway and a suitable client are verified end to end.
- **[A batch read can span an update and contain lines from different moments]** → Sequence scheduled update before analysis and require consumers to inspect per-line freshness.
- **[Provider payload or semantics may change]** → Isolate source mapping in the adapter, reject malformed or suspiciously shrinking responses, and preserve explicit source information.
- **[Anonymous endpoint limits are undocumented]** → Use batched panels for daily refresh, stagger historical reconciliation, and report provider throttling explicitly.
- **[Whole-value JSON eventually becomes large]** → Measure actual object sizes and memory before introducing streaming or another storage model.
- **[Sparse CCL histories may be unsuitable for some indicators]** → Preserve real observations and expose freshness; analysis decides whether sample density is sufficient.

## Migration Plan

1. Introduce schema-v1 domain types, pure validation/reconciliation, and behavior tests.
2. Add the Open BYMADATA adapter and fixtures for real, carried-close, sparse, corrected, empty, and malformed responses.
3. Add the Bun/Railway storage adapter and integration-test `<trading-line-id>/v1/history.json` replacement.
4. Wire batch reads and updates to Trading Line entries supplied by the instrument catalog.
5. Backfill a small canary set covering ARS, MEP, CCL, equity, sparse, and inactive lines; inspect stored source information and history density.
6. Backfill the configured universe in rate-limited batches, then enable ordinary refresh and staggered reconciliation orchestration.

Because no production Bar History exists yet, no data migration or rollback procedure is required. Before enabling consumers, failed rollout data can be discarded and backfilled again from the provider.
