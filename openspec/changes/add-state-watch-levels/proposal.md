# State watch levels: last confirmed swings, pending Regime transition and their peso equivalents

## Why

Two of the State's parts change only after confirmation, by design: a swing counts only once three later sessions have confirmed it, and Regime changes only after three readable sessions agree on a new proposal. Confirmation keeps noise out, but a reader who sees only the settled labels learns about a change when it has already happened.

The State can say what to watch without rushing either confirmation, using only information that is already confirmed:

1. **Which levels Structure hinges on.** A directional Structure is defined by its latest confirmed swing: an uptrend by its latest confirmed swing low, a downtrend by its latest confirmed swing high. A completed close beyond that level is a Structure Break. In a range or an undefined Structure, the latest confirmed high and low are the levels price last turned at. The glossary already calls these levels, and the close's distance from them, Evidence about Structure. Today the State omits them, and the instrument-state spec forbids them.
2. **Whether Regime is part-way through a change.** The Regime transition engine already keeps a pending candidate and its count. A reader cannot see that two of the three confirming sessions have already happened.

## What Changes

### 1. Last confirmed swing high and low

- The Instrument State gains `lastConfirmedSwingHigh` and `lastConfirmedSwingLow`: the latest swing of each kind confirmed by the session, under the existing swing confirmation rules.
- Each has the same fields as a Structure Break's `definingSwing` (`kind`, `price`, `occurredAtSession`, `confirmedAtSession`) plus `priceRelativeToSwingInPercent`: `(close − swing price) / swing price × 100`, unrounded. Positive means the close is above the level, negative below, the same sign convention as `priceRelativeToLongTermEmaInPercent`.
- A swing is used only from its confirmation session. An unconfirmed candidate is never used, and the current price is never a swing.
- `null` until a swing of that kind has been confirmed. Once one exists, the part never returns to `null`: a later confirmed swing of the same kind replaces it.
- The Structure part's rule that the State "SHALL NOT include the defining swing level, or the distance from it" is replaced. The State still does not include newly confirmed swings as a list.
- No new glossary term: Confirmed Swing and Evidence about Structure already name the concept.

### 2. Pending Regime Transition

- The technical-analysis module gains `calculatePendingRegimeTransitions(bars)`, a third view of the same Regime transition engine that `calculateRegime` and `detectRegimeTransitionEvents` read. It reports, per session, the engine's pending candidate as `{ candidate, confirmations, requiredConfirmations }`, or `null`.
- The Instrument State gains `pendingRegimeTransition` with that value.
- It is `null` when there is no candidate, on the transition session and after it, and on a session whose Regime is unavailable. An unavailable session does not advance or clear the engine's candidate, so the count continues on the next readable session.
- CONTEXT.md gains **Pending Regime Transition**: a candidate that may still be cleared or replaced, is not an Event, and predicts nothing.

### 3. Snapshot and web

- Each `latestState` in the snapshot gains the three parts. `readLatest` validates and returns them.
- The snapshot goes to `schemaVersion: 7` under `analysis-snapshots/v7/`. See design.md for why an additive change still bumps the version, and for the deploy order.
- The line page renders the three parts minimally: swing prices with the snapshot's `priceUnit`, distances as percentages, the pending candidate as `candidate, n of 3`, and `null` as not evaluated or none. Final wording comes later.

### 4. Watch levels in pesos

- Readers trade the peso line, so a level in MEP dollars is not the price their broker shows. ADR 0005 already allows displaying prices in pesos by applying the rate in reverse.
- The dollarized-series module gains `toPesoEquivalent(valueInMepDollars, mepRate)`.
- Each available line in the snapshot gains `pesoEquivalents`: the latest State's session, that session's MEP Rate, the line's peso close, and both last confirmed swings converted at that rate. The State itself stays in MEP dollars.
- The line page shows the peso close and the levels in pesos with the session and rate they were converted at. It converts nothing itself.
- CONTEXT.md gains **Peso Equivalent**.

### Versions

- `ANALYSIS_CONFIGURATION.version` stays at 5. The new parts read the existing swing confirmation bars and transition confirmations; no parameter is added or changed, and no existing result changes.
- Snapshot `schemaVersion` 6 → 7.
- No ADR: ADR 0005 already decided that prices may be displayed in pesos by applying the same-session rate in reverse.

## Capabilities

### Modified Capabilities

- `technical-analysis`: `calculatePendingRegimeTransitions`.
- `instrument-state`: the three new parts; the Structure part's exclusion of swing levels is lifted.
- `dollarized-series`: `toPesoEquivalent`.
- `analysis-run`: schema v7, prefix `v7`, the new parts in `latestState`, `pesoEquivalents`, and both in `readLatest`.
- `web-app`: the line page shows the new parts and the peso equivalents.

## Impact

- `src/analysis/modules/technical-analysis/regime` and `regime-transition`, `instrument-state`, `analysis-run` (types, writer, schema, storage prefix), `src/web` (line page, formatting).
- CONTEXT.md: two new terms.
- No ADR: the change exposes measurements the existing contracts already compute, without a new analysis trade-off.
