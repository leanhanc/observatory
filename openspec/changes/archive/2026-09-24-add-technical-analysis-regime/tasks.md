# Tasks

- [x] Implement the session-aligned Regime module under `src/modules/technical-analysis/regime/`.
- [x] Reuse the existing EMA and ATR calculations without duplicating their arithmetic.
- [x] Add tests for warm-up, all labels, strict equality, zero/near-zero ATR, transition confirmation, candidate interruption/replacement, transitions to and from `mixed`, gaps, NFLX reference behavior, prefix replay, and input non-mutation.
- [x] Export only the intended public Regime API from the technical-analysis module.
- [x] Run tests, typecheck, lint, formatting, strict OpenSpec validation, and whitespace checks.
- [x] Request and resolve an adversarial review before implementation is considered complete.
