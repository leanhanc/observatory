# Add Dollarized Series

## Why

ADR 0005 decides that Observatory analyzes peso-line instruments in MEP dollars so exchange-rate movement does not pose as market structure. No capability yet turns a peso-line Bar History into that series.

## What Changes

Add a pure `dollarized-series` module with two calculations:

- `calculateMepRates(pesoBondBars, dollarBondBars)` derives one MEP rate per session: the peso-bond close divided by the dollar-bond close of that same session. A rate exists only when both bond legs have a Daily Bar with volume greater than zero for the session.
- `dollarizeBarHistory(pesoLineBars, mepRates)` divides open, high, low and close of each peso bar by that session's MEP rate and copies volume unchanged. Sessions without a rate produce no bar and are reported in `sessionsWithoutMepRate`.

## Scope

No storage, catalog, scheduled run, display-currency conversion, or CEDEAR conversion ratio. The CCL/MEP difference is neither computed nor corrected; it remains accepted noise per ADR 0005. Settlement matching between the peso bar and the bond pair is the caller's contract: Daily Bars carry no settlement, so the module cannot check it.
