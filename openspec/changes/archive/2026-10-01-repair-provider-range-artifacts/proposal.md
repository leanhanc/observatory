# Repair small provider range artifacts

## Why

Open BYMADATA returned a GGAL bar for 2025-01-17 whose close (7351.911) is 0.26% below its low (7370.666). Domain validation rejects the whole incoming batch for one such bar, so an initial backfill of GGAL fails and every later reconciliation window that includes the date would fail as well. The provider appears to back-adjust history for cash distributions, and the artifact likely comes from that adjustment.

## What Changes

The Open BYMADATA adapter SHALL widen a bar's high or low to include its open and close when either lies outside the range by at most 1% of the boundary price. Open and close are never changed: the close is the official session price and drives most analysis. A larger gap, or a low above the high, is left unchanged for domain validation to reject.

Each repair keeps the provider's original bar and the repaired bar. After a successful write, the updater logs each repair whose repaired bar was not already stored in that form, so a repair repeated by later fetches is logged once.

## Scope

Domain validation stays strict: stored histories still require open and close within the range. Handling of provider back-adjustment itself is a separate change.
