## 1. Domain Model and Validation

- [ ] 1.1 Define schema-v1 `DailyBar`, Bar History envelope, provenance, freshness, result, and failure types; verify TypeScript type checking passes and the storage shape matches the specification.
- [ ] 1.2 Implement Daily Bar and complete-history validation; verify focused tests cover missing/non-finite/negative values, OHLC range violations, duplicate dates, ordering, valid zero volume, identity/provenance mismatch, and progress regression.

## 2. Reconciliation

- [ ] 2.1 Implement pure session-date reconciliation for new, identical, and corrected bars; verify tests prove oldest-to-newest output, no duplicate sessions, safe repeated input, and structured old/new corrections.
- [ ] 2.2 Implement authoritative-window checks; verify tests preserve older out-of-window bars and reject a previously stored real bar disappearing inside the returned interval.
- [ ] 2.3 Implement full-candidate validation before persistence; verify one invalid supplied bar rejects the complete line update and leaves its previous envelope available to the caller.

## 3. Open BYMADATA Adapter

- [ ] 3.1 Implement catalog-resolved mapping for historical requests and batched CEDEAR, leading-equity, and general-equity panels; verify fixtures cover ARS, MEP, CCL, equity, missing, and malformed provider responses.
- [ ] 3.2 Normalize provider timestamps into Buenos Aires session dates and exclude active sessions; verify timezone-boundary and incomplete-session tests.
- [ ] 3.3 Detect and omit provider carried-close rows before domain validation; verify tests distinguish them from structurally valid zero-volume bars.
- [ ] 3.4 Implement initial-backfill, ordinary-refresh, catch-up, and reconciliation fetch modes; verify tests use shared panel requests for ordinary refresh and historical requests for missing intervals.

## 4. Bun and Railway Storage

- [ ] 4.1 Implement a storage adapter around an explicitly configured Bun `S3Client`, including Railway endpoint-style configuration and machine-readable error translation; verify adapter tests cover configuration and expected failures.
- [ ] 4.2 Read and validate complete JSON envelopes from `<trading-line-id>/v1/history.json`; verify missing, unreadable, and invalid stored objects return their distinct failure reasons.
- [ ] 4.3 Serialize, validate, and atomically replace complete history objects with `application/json`; verify an S3-compatible integration test observes only complete old or complete new objects and never reports failed persistence as success.

## 5. Batch Application Operations

- [ ] 5.1 Implement range-aware batch reads that preserve every requested Trading Line result; verify inclusive ranges, empty successful ranges, oldest-to-newest bars, differing freshness, and per-line failures.
- [ ] 5.2 Implement batch updates that share provider fetches while reconciling and persisting each Trading Line independently; verify mixed `created`, `updated`, `unchanged`, and `failed` results in one request.
- [ ] 5.3 Advance `checkedThroughSession` only after a successfully accepted interval, including sessions with no real bar; verify missed-session catch-up, holiday/no-trade progress, and non-regressing repeated updates.
- [ ] 5.4 Log structured corrections through the shared `src/modules/logger` as `market-history-correction` events without adding side effects to pure reconciliation; verify orchestration tests capture the Trading Line ID, session date, and old/new bars.

## 6. Integration and Rollout Verification

- [ ] 6.1 Run a canary backfill against a private Railway Bucket for representative ARS, MEP, CCL, sparse, equity, and inactive lines; verify stored keys, provenance, check progress, ordering, and carried-close omission.
- [ ] 6.2 Verify ordinary panel refresh followed by analysis-facing reads uses completed-session data and explicit freshness, with the scheduled orchestration prevented from overlapping itself.
- [ ] 6.3 Verify staggered full-window reconciliation catches a known correction, preserves older retained history, and stays within observed provider request limits.
- [ ] 6.4 Run the project test, type-check, formatting, and strict OpenSpec validation commands; verify all checks pass before enabling the configured-universe backfill.
