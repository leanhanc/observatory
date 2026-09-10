## 1. Domain Model and Validation

- [x] 1.1 Define schema-v1 `DailyBar`, Bar History envelope, provenance, freshness, result, and failure types; verify TypeScript type checking passes and the storage shape matches the specification.
- [x] 1.2 Implement Daily Bar and complete-history validation; verify focused tests cover missing/non-finite/negative values, OHLC range violations, duplicate dates, ordering, valid zero volume, identity/provenance mismatch, and progress regression.

## 2. Reconciliation

- [x] 2.1 Implement pure session-date reconciliation for new, identical, and corrected bars; verify tests prove oldest-to-newest output, no duplicate sessions, safe repeated input, and structured old/new corrections.
- [x] 2.2 Implement authoritative-window checks; verify tests preserve older out-of-window bars and reject a previously stored real bar disappearing inside the returned interval.
- [x] 2.3 Implement full-candidate validation before persistence; verify one invalid supplied bar rejects the complete line update and leaves its previous envelope available to the caller.

## 3. Open BYMADATA Adapter

- [x] 3.1 Implement catalog-resolved mapping for dated historical requests; verify fixtures cover ARS, MEP, CCL, equity, empty, and malformed provider responses.
- [x] 3.2 Normalize provider timestamps into Buenos Aires session dates and exclude active sessions; verify timezone-boundary and incomplete-session tests.
- [x] 3.3 Exclude Open BYMADATA Continuity Data matching the observed zero-volume, retained-close, and missing-range-price signature; verify all-zero and other zero-price rows are rejected while structurally valid zero-volume bars remain accepted.
- [x] 3.4 Implement caller-selected initial-backfill, refresh, and reconciliation acquisition modes; verify dated missing-interval requests, sequential two-second historical pacing, and no storage writes.

## 4. Bun and Railway Storage

- [x] 4.1 Implement a storage adapter around an explicitly configured Bun `S3Client`, including Railway endpoint-style configuration and machine-readable error translation; verify adapter tests cover configuration and expected failures.
- [x] 4.2 Read and validate complete JSON envelopes from `<trading-line-id>/v1/history.json`; verify missing, unreadable, and invalid stored objects return their distinct failure reasons.
- [x] 4.3 Serialize, validate, and atomically replace complete history objects with `application/json`; verify an S3-compatible integration test observes only complete old or complete new objects and never reports failed persistence as success.

## 5. Batch Application Operations

- [x] 5.1 Implement range-aware batch reads that preserve every requested Trading Line result; verify inclusive ranges, empty successful ranges, oldest-to-newest bars, differing freshness, duplicate requests, invalid requests, and per-line failures.
- [x] 5.2 Implement batch updates that pace provider fetches while reconciling and persisting each Trading Line independently; verify mixed `created`, `updated`, `unchanged`, and `failed` results in one request.
- [x] 5.3 Advance `checkedThroughSession` only after a successfully accepted dated interval; verify multi-session refresh, empty-response retry, and non-regressing repeated updates.
- [x] 5.4 Log structured corrections through the shared `src/modules/logger` as `market-history-correction` events without adding side effects to pure reconciliation; verify orchestration tests capture the Trading Line ID, session date, and old/new bars.

## 6. Integration and Rollout Verification

- [x] 6.1 Run a canary backfill against a private Railway Bucket for representative ARS, MEP, CCL, sparse, and equity lines plus the synthetic no-data path; verify stored keys, provenance, check progress, ordering, temporary-object cleanup, and invalid-row rejection.
- [ ] 6.2 Verify dated historical refresh followed by analysis-facing reads uses completed-session data and explicit freshness, with the scheduled orchestration prevented from overlapping itself.
- [ ] 6.3 Verify staggered full-window reconciliation catches a known correction, preserves older retained history, and stays within observed provider request limits.
- [ ] 6.4 Run the project test, type-check, formatting, and strict OpenSpec validation commands; verify all checks pass before enabling the configured-universe backfill.
