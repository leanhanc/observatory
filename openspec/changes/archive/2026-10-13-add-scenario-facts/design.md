# Design

## Close position is per level, not one classification

A single enum (between levels, below the low, above the high, no levels) is not total. One level can be confirmed before the other. After a gap, the last confirmed high can sit below the last confirmed low, so a close can be beyond both. Two fields, one per level, cover every case, and each is `null` exactly when its swing is.

Equality counts as on the level's side (`at-or-above` the low, `at-or-below` the high), as in the range rule and Structure Break, where only a strict close beyond a level counts. The comparison uses the close and the swing price exactly, with no tolerance, as Market Structure does.

## Regime tipping closes reuse the policy's band

`proposeRegime` and `calculateRegimeTippingCloses` both read one `measureRegimeBand(ema50, ema200, atr14)` in regime-policy. It returns the two band edges and which side of EMA200 EMA50 is on, beyond rounding noise. The proposal keeps its rule:

- `bullish` when the close is above the upper edge and EMA50 is above EMA200;
- `bearish` for the mirror;
- `mixed` otherwise.

The tipping closes are the edges themselves. A close equal to an edge, or within rounding noise of it, does not satisfy the condition, and the field says "strictly above" or "strictly below".

The edges are as of the session. A later close moves EMA200 by `2/201` of its distance from EMA200, and moves ATR14 through its True Range. The edge for that later session is therefore close to this one but not equal. Solving for it exactly would mean modeling the next True Range, which depends on the next high and low. The field documents the approximation instead.

## Period returns count Market Sessions

A window of N Market Sessions ending at the anchor session `a` starts at the Market Session N positions before `a` in the MEP calendar. Counting the line's own bars would stretch the window for a line that skipped sessions, so "1 month" would mean different spans for different lines. Counting Market Sessions follows Liquidity Eligibility.

If the line did not trade on the start session, the start close is the line's last close before it. That close was known on the start session, so nothing is used early. `fromSessionDate` records which close was used. The return is `null` when:

- the MEP calendar has fewer than N Market Sessions before `a`;
- the line has no bar on or before the start session.

The anchor is the latest State's session. It may be earlier than the Requested-Through Session when the line did not trade on later sessions, so its returns and its State describe the same close.

## Situations are stateless predicates with a replayed start

Each Situation is a predicate on one session's State. `activeSinceSession` comes from walking the line's States oldest to newest, so it is causal: it depends only on States through the session. If the predicate fails for one session and holds again, `activeSinceSession` restarts. An interruption is a fact, and bridging it would need a tolerance this change does not introduce.

The Situation compares the close with the latest confirmed low, which the State already holds. Comparing with the first low the close fell below (a stale low) would keep it active after a newer low confirms, and that is the plausible wrong implementation the tests exclude.

## Deploy order

The web build reads `analysis-snapshots/v8/latest.json`, which no run has written yet. The web service watches `src/analysis`, so pushing this change starts a web build that fails until a v8 snapshot exists. A failed build keeps the previous deployment serving its v7 pages, so nothing breaks for readers. The safe order:

1. With Lean's OK for the bucket write, run the Analysis Run once from this commit, either locally with the storage variables or by triggering the Railway service after pushing. It writes `v8/<session>/<ranAt>.json` and `v8/latest.json` and leaves the v7 objects in place.
2. The Railway run redeploys the web service after writing. For a local run, redeploy the web service by hand.
3. The web build reads v8 and publishes the new pages.
