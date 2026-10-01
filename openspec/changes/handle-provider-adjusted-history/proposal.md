# Handle provider-adjusted history

Status: awaiting decisions. This change has no spec deltas yet, so it does not pass validation until the decisions below are made.

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

1. **Which series is canonical.** Either the provider's adjusted series, which keeps indicators free of distribution gaps but makes old levels differ from traded prices, or the raw prices as first observed, which match what traded but need our own split adjustment for technical analysis. Technical analysis requires split adjustment either way; dividend adjustment is a convention that charting tools differ on.
2. **How an adjustment is detected.** For example, a consistent ratio between stored and fetched prices across all overlapping sessions, distinguished from ordinary corrections to individual bars.
3. **How older bars are handled.** If the adjusted series is canonical, apply the detected factor to stored bars outside the provider's window and record the adjustment. If raw is canonical, keep first-observed values and stop treating adjustments as corrections.
4. **Where split and ratio events come from.** The research lab defined a dated ratio table that is never inferred from prices, but never found a data source for it.

## Next step

Capture daily provider snapshots for a few instruments with known upcoming distributions, and compare them before and after the payment date. That confirms whether the adjustment is a single multiplicative factor, which decision 2 depends on.
