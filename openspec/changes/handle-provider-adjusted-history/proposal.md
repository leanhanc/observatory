# Handle provider-adjusted history

Status: decisions made 2026-10-01. Detection is implemented; applying adjustments during reconciliation is pending (see tasks).

## Why

The Bar History spec says stored prices are raw market facts with an adjustment policy of `none`. Open BYMADATA data contradicts that: the provider appears to back-adjust history for cash distributions.

Evidence, from daily history fetched on 2026-10-01:

- Each instrument has prices off the 0.25 price grid up to a date, and only on-grid prices after it: GGAL until 2026-09-04, AAPL until 2026-08-07, and AL30 until 2026-07-07, which matches AL30's July coupon. YPFD has no off-grid prices in the window.
- GGAL and GGALD stay consistent through 2026-09-04 after converting by MEP, so both lines appear to be adjusted together.
- A GGAL bar on 2025-01-17 has a close 0.26% below its low, which fits a rounding artifact of adjustment.
- The provider returns only a rolling window of about two years: a request for GGAL from 2018 returned 486 sessions starting 2024-10-01, and a request for 2022 alone returned an error.

These are inferences from price patterns. The provider does not document its adjustment method, and no snapshot taken before and after an adjustment exists yet to confirm it.

## Consequences if nothing changes

- Stored history mixes price scales. Bars stored before an adjustment keep the old scale; later fetches bring adjusted values. Reconciliation only re-checks a recent window, so older stored bars never move, and the history shows a fake jump at the window's edge.
- Refetching cannot repair it. Once stored history is older than the provider's two-year window, the adjusted versions of the oldest bars can no longer be fetched.
- Adjustments inside the reconciliation window appear as many simultaneous corrections, which the correction log reports as data errors.
- The MEP rate in ADR 0005 uses AL30 and AL30D. If the two legs are adjusted by different factors for a coupon, the implied rate shifts at that date.

## Decisions needed

1. **Which series is canonical. Decided 2026-10-01: the provider's adjusted series.** Stored history follows Open BYMADATA's adjustments rather than raw first-observed prices. Indicators stay free of gaps caused by distributions; the cost is that older levels, such as swing prices, differ from prices that actually traded. The spec requirement "Stored prices are raw market facts" and its adjustment policy of `none` must be replaced.
2. **How an adjustment is detected. Decided: by its shape.** An adjustment changes every overlapping bar up to a session by the same price ratio and leaves later bars unchanged. Several adjustments since the last check form a staircase of such steps. Any other difference is a set of corrections. `detectAdjustmentOrCorrection` makes this classification.
3. **How older bars are handled. Decided: apply the provider's factor.** Stored bars that the provider no longer serves are multiplied by the detected factor, so the history stays on one price scale. They are never refetched or replaced otherwise. The adjustment is recorded as its own event rather than as corrections. Still open: whether volume changes with the factor, which matters for splits but not for cash distributions.
4. **Where split and ratio events come from. Decided 2026-10-08: from the provider, except for confirmed corporate actions it does not adjust.** A split or CEDEAR ratio change scales earlier prices like a distribution, so the same detection covers it when the provider adjusts it. The provider has now been seen failing to adjust one: BYMA's 1:1 share distribution, ex-date 2025-05-26, is still served unadjusted more than 16 months later, while the same prices carry cash-dividend adjustments ([large one-session moves](../../../docs/research/large-one-session-moves.md)). CEDEAR ratio changes look different: ServiceNow's 5-for-1 split leaves no step in NOW's peso price, but its volume steps up about thirtyfold, so the price looks adjusted and the volume does not. [ADR 0009](../../../docs/adr/0009-correct-confirmed-unadjusted-corporate-actions.md) therefore adds a committed, sourced list of confirmed corporate actions the provider did not adjust, applied only while the fetched data still shows the step, and the `add-large-move-safeguard` change flags every remaining one-session move of ×1.8 or more without hiding the line. Still open: whether CEDEAR volume needs adjusting across ratio changes such as NOW's, and how detection treats a reverse split the provider does adjust. ADR 0007 counts only a staircase of ratios below 1 as an adjustment, but adjusting a reverse split such as ETHA's raises earlier prices, a ratio above 1, so today it would be treated as corrections.

## Next step

Capture daily provider snapshots for a few instruments with known upcoming distributions, and compare them before and after the payment date. That confirms whether the adjustment is a single multiplicative factor, which decision 2 depends on.
