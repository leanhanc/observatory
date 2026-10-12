# Expire a range when the close leaves its levels

## Why

Structure is `range` when the last two confirmed highs and the last two confirmed lows disagree on direction (lower highs with higher lows, higher highs with lower lows, or an exact tie). A directional Structure already ends when a completed close crosses its defining level, but a range never ends: until another swing confirms, the label stays `range` however far the close walks from the levels that defined it.

In an orderly fall no new swing low confirms, because each session makes a lower low than the last and a swing low needs three later sessions above it. The label then says "sideways" while the price falls.

- **GGAL fixture:** on 2026-09-14 a close of 6840 below the 6870 swing low breaks the uptrend, and Structure becomes `undefined`. On 2026-09-15 a swing high of 7265 confirms, lower than 7311, while the lows 6702 → 6870 still rise, so Structure becomes `range`, although the close (6725) is already below 6870. From 2026-09-16 to 2026-09-30 it stays `range` with no Event while the close falls to 6000.
- **Real data:** a local dry run through 2026-10-10 had 63 of 171 available lines as `range`. In 24 of them the close was already beyond a confirmed level, and in 8 by more than 5%.

For an investor, "range" in those cases is false: the price has left the area where it last turned.

## What Changes

- A `range` SHALL hold only while the session's completed close is within the last confirmed swing low and the last confirmed swing high, both inclusive. A close strictly above the high or strictly below the low makes Structure `undefined`.
- The expiry stays in effect while the confirmed swings are unchanged, even if a later close returns inside the levels. A newly confirmed swing re-runs the normal classification and the same check, so a range that would form while the close is already outside never appears.
- This is the rule a directional Structure already follows: a trend ends on a strict close beyond its defining level, equality keeps it, and only a new confirmed swing can reclassify. A range has two levels instead of one.
- **No new Event.** Leaving a range is not a Structure Break and produces no Event:
    - The levels a range-ending close crosses are often the ones a Structure Break has just reported (GGAL's 6870), so an Event would report the same level twice.
    - A "range exit" Event reads as a breakout signal, which Observatory does not claim.
    - Structure Break rules are unchanged: only a directional Structure breaks.
- `undefined` with `hasSwingPairs` true now means that the last trend or range expired. CONTEXT.md's **Structure** entry says that a `range` holds only while the close stays within the last confirmed high and low.

### Implementation notes

- The check uses the latest confirmed high and low that `calculateMarketStructure` already keeps for classification and trend expiry. `trackLatestConfirmedSwings` cannot be used inside Market Structure, because it reads Market Structure's rows; both read the same swings, confirmed on the same rows. No new swing loop is added.
- Only the session's own close and swings confirmed by that session are used. Replaying any prefix gives the full-history result for its last session.

### Versions

- `ANALYSIS_CONFIGURATION.version` 5 → 6: the same bars now produce `undefined` where they produced `range`, so results under the two versions mean different things. No configuration value changes; the version records the rule change.
- Snapshot `schemaVersion` stays 7. The shape is unchanged: `structure` already allows `range` and `undefined`, and the snapshot reader validates the shape, not the configuration version. A stored v7 snapshot from configuration 5 is still read; the next run replaces it.
- No ADR: this tightens an existing classification rule without a new trade-off beyond it.

## Capabilities

### Modified Capabilities

- `technical-analysis`: a `range` expires on a strict close beyond its last confirmed high or low; `undefined` after warm-up also means an expired range.
- `instrument-state`: the Structure part's `undefined` also means an expired range.

## Impact

- `src/analysis/modules/technical-analysis/market-structure/market-structure.ts` and its tests.
- `src/analysis/lib/config.ts`: version 6.
- Doc comments on `hasSwingPairs` and the State's `structure`.
- CONTEXT.md: Structure.
- Lines whose Structure was a `range` with the close beyond a level show `undefined` after the next run. Structure Break Events are unchanged.
