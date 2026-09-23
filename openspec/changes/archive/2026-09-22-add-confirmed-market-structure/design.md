# Design

## Public interface

Expose one pure `calculateMarketStructure(bars)` function from the technical-analysis module. It returns one row per input `DailyBar`, in the same order. Each row contains the `sessionDate`, a `structure` value of `uptrend | downtrend | range | undefined`, and `newlyConfirmedSwings`: only swings whose confirmation session is that row. A public swing has `kind`, `price`, `occurredAtSession`, and `confirmedAtSession`. These dates use the existing `DailyBar.sessionDate`; array indices remain internal. The `undefined` label is a string literal, not a missing JavaScript value.

The interface exposes neither all future swings nor a separate visibility operation. A caller reading row `i` receives only the classification and newly confirmed swings available at session `i`. The delta form avoids copying the full visible swing list into every row. Internal swing detection and comparison functions stay private.

## Detection and classification

Analysis Configuration v1 fixes `k = 3` completed bars on either side of a candidate, with confirmation at input position `i + 3`. This is a versioned analytical convention, not a caller parameter. A unique swing high must have a strictly higher high than every other high in its seven-bar window; a unique swing low must have a strictly lower low than every other low. Highs and lows are checked independently, so an outside bar may yield both kinds of swing on the same occurrence and confirmation sessions. A tie anywhere in the window prevents that kind of swing. Bars within three positions of either edge cannot be detected as swings in that history.

At each session, use only confirmed swings. Compare the latest two confirmed highs with each other and the latest two confirmed lows with each other. Both rising produces `uptrend`; both falling produces `downtrend`; sufficient but equal or conflicting comparisons produce `range`. Fewer than two confirmed swings of either kind produces `undefined`. Swings do not have to alternate. Consecutive highs or lows still update the latest pair of their own kind; introducing an alternation rule would discard valid extremes without a market rationale.

An uptrend expires if a completed session closes strictly below its latest confirmed swing low. A downtrend expires if it closes strictly above its latest confirmed swing high. Equality does not expire either label. On expiry, report `undefined`, not `range` or the opposite trend. Keep that label suppressed while the defining latest high and low remain unchanged, even if a later close moves back across the same level. A new confirmed swing changes the evidence and permits classification again under the same rules. The current close can expire a label but never becomes a swing without its own later confirmation.

This expiry belongs to the classification because publishing the unqualified old trend after its defining extreme is crossed would misdescribe the current session. Future Structural Hold/pressure and Event capabilities may describe the break and its context, but are not required to keep the classification honest.

## Historical decisions

- Preserve the three-bar confirmation delay, independent high/high and low/low comparisons, last-two-by-kind selection, and insufficient-history `undefined`.
- Preserve strict HH/LH and HL/LL comparison: equal prices establish neither direction.
- Adapt the Swift raw-swing-plus-visibility interface to a session-aligned result, so every row carries only information knowable then.
- Adapt public identity from Swift array indices to occurrence and confirmation session dates, which remain meaningful when a history is sliced.
- Replace Swift's permissive plateau ties with strict extrema; repeated flat or equal prices do not manufacture precise turning points.
- Adapt Swift's per-session close expiry to remain expired until new swing evidence arrives; a move back across the old level alone cannot revive an old trend label.

No numeric threshold, recency limit, alternation rule, or user-configurable `k` is introduced.
