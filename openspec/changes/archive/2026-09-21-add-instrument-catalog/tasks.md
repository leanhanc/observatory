## 1. Schema and Domain Types

- [x] 1.1 Define strict Valibot schemas for the version-1 catalog, stock and CEDEAR Instruments, and Trading Lines; infer the exported TypeScript types and verify focused tests reject unsupported versions, fields, types, exchanges, currencies, blank values, invalid IDs, and empty Instrument Trading Line arrays.
- [x] 1.2 Implement complete-catalog relationship validation and verify focused tests cover duplicate Instrument IDs, globally duplicate Trading Line IDs, duplicate exchange-symbol-currency combinations, missing underlying Instruments, and CEDEAR-to-CEDEAR references without exposing partial data.

## 2. Repository Catalog

- [x] 2.1 Add the version-1 JSON catalog with Galicia and YPF stocks, Apple stock, and the Apple CEDEAR using the accepted opaque IDs; verify the complete stored value passes the catalog validator.
- [x] 2.2 Load and validate the repository JSON once, deeply freeze the accepted data or return defensive immutable copies, and build private Instrument and Trading Line indexes; verify invalid input prevents catalog creation and tests cannot change later reads by mutating nested Instrument fields, nested Trading Line fields, or returned arrays.

## 3. Read-Only Module Interface

- [x] 3.1 Implement Instrument listing and single-Instrument lookup with stable result unions; verify tests cover complete embedded lines, order-independent listings, and `instrument-not-found` failures.
- [x] 3.2 Implement ordered batch Trading Line resolution; verify tests cover a successful empty request, request-order preservation, blank IDs, duplicate IDs, all missing IDs in one `trading-line-not-found` failure, and no partial successful result.
- [x] 3.3 Export the Instrument Catalog interface and accepted types only through the module entry point; verify consumers cannot import the stored JSON through a public module path.

## 4. Capability Boundary Verification

- [x] 4.1 Verify a resolved BYMA Trading Line can be explicitly transformed into the existing `{ tradingLineId, symbol }` Bar History descriptor without changing Bar History code or storing provider policy in the catalog.
- [x] 4.2 Verify catalog tests demonstrate that resolving a CEDEAR returns only its stored Underlying Instrument reference and does not select an analysis Trading Line, related history, provider, or fallback.

## 5. Project Validation

- [x] 5.1 Run focused Instrument Catalog tests, the complete test suite, type checking, linting, `bun run format`, strict OpenSpec validation, and whitespace checks; verify every check passes before implementation review.
