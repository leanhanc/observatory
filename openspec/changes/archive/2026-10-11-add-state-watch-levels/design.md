# Design

## Last confirmed swings come from Market Structure's confirmations

`calculateMarketStructure` rows list the swings newly confirmed at each session. The new `trackLatestConfirmedSwings` keeps the latest of each kind as it walks those rows in order, and both `detectStructureBreakEvents` and `calculateInstrumentStates` read its rows. A Structure Break reads the previous session's row, the State reads its own session's row. Swing detection and its confirmation rule stay in one place, a swing can only appear from the row where Market Structure first reports it, which is its confirmation session, and a Structure Break's defining swing and the State's watch level cannot diverge.

Carrying the latest confirmed swing forward is not a carried value in the sense the State forbids: the swing remains the latest confirmed one until another replaces it. Only the distance is recomputed, from each session's own close.

The last confirmed high and low are the levels of the latest same-kind swings Structure compares, so in a directional Structure one of them is the level a Structure Break would use. They are not limited to directional Structures: in a range, both are the levels price last turned at, and after an expired trend the broken level is still the last confirmed swing of its kind until a new one confirms.

Alternative considered: adding the latest swings to `MarketStructureSession`. It would change a technical-analysis contract whose rows deliberately list only newly confirmed swings. A separate function keeps that contract and still gives every consumer one fold.

## Distance in percent of the swing price

`(close − swing price) / swing price × 100`, with the sign of the long-term EMA distance: positive above, negative below. Percent rather than ATR units, for the same reason as the long-term EMA distance: it compares across lines without a second measurement in the denominator, and it reads as "how far the close is from the level". It is `null` only when the swing price is zero or the result is not finite, which validated bars with positive lows and highs do not produce; the swing itself is still reported.

## Pending Regime Transition is a third view of the engine

The engine's state after each session already holds `pending: { regime, proposalSessionDates }`. `analyzeRegime` records it per session, and `calculatePendingRegimeTransitions` maps it to `{ candidate, confirmations, requiredConfirmations }`, as `calculateRegime` and `detectRegimeTransitionEvents` map the same rows. No transition rule is duplicated.

The engine walk is split into `followRegimeProposals`, which takes per-session proposals, so the pending rules can be tested with proposal sequences that bars cannot easily produce, such as an unreadable session after warm-up.

On an unreadable session the engine keeps its candidate, but the State's Regime is `null`. The pending part is then also `null`: a pending change of a Regime the session cannot read would contradict the Regime part. The next readable session reports the candidate with the count it would have had without the gap.

`requiredConfirmations` repeats the configured three so a reader does not need the Analysis Configuration to read "2 of 3". The confirming session dates so far are not included; the Event carries them once the transition happens.

## Peso equivalents at the latest session's MEP Rate

A Structure Break is decided on the dollarized close against the dollarized level. In pesos, the close on session `t` crosses the level when it crosses `level × MEP(t)`, so the peso trigger for a future session depends on a rate nobody knows before that session closes. No fixed peso price is the trigger.

The snapshot therefore publishes the levels at the rate of the latest State's session, the same rate that dollarized that session's close, and states the session and the rate. Close and levels then share one rate, so the close's distance from a level in percent is identical in pesos and in MEP dollars, and the page shows one distance.

Alternatives considered:

- The page multiplies the MEP-dollar level by a published rate. Rejected: converting back is the inverse of dollarization, a domain rule, and pages do not compute domain values.
- The peso high or low of the swing's occurrence session. It is a real peso price, but it is the level in that session's pesos; after any change in the MEP Rate it is not where the dollarized close would cross the level.
- Peso equivalents inside the Instrument State. Rejected: the State describes the analyzed series in one unit; the peso view is a projection for readers of the peso line.
- The run's latest MEP Rate rather than the line's last session's. A line that did not trade on later sessions would then mix a close and a rate from different sessions.

Event prices, such as a Structure Break's close and defining swing, are not converted in this change. Each would need its own session's rate.

## Schema version 7, not an additive v6

`readLatest` validates with `v.object`, which drops unknown fields. A v6 reader would therefore accept a snapshot that has the new parts. The new reader, though, requires them, and would reject a v6 object written before this change. If the version stayed at 6, `schemaVersion` would no longer tell a reader whether it can read an object. The repository already bumped for additive fields (v4 added only `corporateActionWatch`), and the prefix rule keeps each schema's objects apart.

Making the parts optional in the reader was rejected: pages would have to render a State that may or may not have them, for at most one day.

## Deploy order

The web build reads `analysis-snapshots/v7/latest.json` and fails without it, which keeps the previous deployment serving.

1. Before pushing, run `bun run analyze` once against the production bucket. It writes under `v7/` and leaves `v6/` in place, so the deployed site is unaffected. This writes to production and needs Lean's explicit go-ahead.
2. Push. The web service builds from the new v7 `latest.json`.

If the push happens first, the web build fails and the previous deployment keeps serving until the next scheduled Analysis Run writes a v7 snapshot and triggers a redeploy. That is also safe, only slower.
