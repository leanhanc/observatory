# Add the AL30 bond and the configured MEP rate source

## Why

`calculateMepRates` derives the MEP Rate from a bond quoted in pesos and in local dollars, and ADR 0005 names AL30/AL30D as that pair. Nothing in the repository yet describes the bond or says which Trading Lines are the MEP rate source, so a later analysis run would have to invent both.

## What Changes

- The Instrument Catalog gains a `bond` Instrument type. A bond has no Underlying Instrument.
- The initial catalog gains the AL30 bond with two BYMA Trading Lines: `al30-bond-byma-ars` (`AL30`, ARS) and `al30-bond-byma-usd-mep` (`AL30D`, USD).
- A BYMA USD Trading Line's identifier names its operative form, `-usd-mep` or `-usd-ccl`, because both forms are USD and the schema gains no operative-form field. The suffix describes the line; it does not select it.
- The dollarized-series module exports `MEP_RATE_SOURCE`, the analysis configuration naming the peso-bond and dollar-bond Trading Line ids. It selects the bond for the MEP Rate only, not which series feed analysis. A test resolves it through the real catalog and pins each property of the pair.

## Scope

No fetching, storage, scheduling, or analysis wiring, and no startup validation of the configured source: the analysis-run slice can add one, with a contract, if it needs it. The catalog still selects no analysis policy. Settlement is not represented in the catalog; matching it stays the caller's contract.
