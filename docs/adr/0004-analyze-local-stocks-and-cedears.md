---
status: accepted, refined by ADR-0005
---

# Analyze local stocks and CEDEARs instead of foreign underlyings

Observatory will analyze Argentine stocks and CEDEARs directly from their selected BYMA Trading Line's history. For CEDEAR coverage, it will not analyze the foreign Underlying Instrument or translate underlying analysis levels into local prices. This supersedes [ADR 0001](./0001-analyze-underlyings-and-translate-levels.md).

We accept a less isolated view of the foreign asset's performance: the analysis describes the local instrument in its quoted currency. The trade-off removes the dependency on US market data and its provider-specific licensing nuances; it is not a finding that local analysis is mathematically incorrect or a blanket determination of data-use permissions.

The original application architecture remains unchanged: server-side analysis, stored Bar Histories, shared analysis snapshots, and pre-rendered or cached public presentation remain as planned. Existing CEDEAR-to-Underlying-Instrument catalog relationships remain domain facts, not dependencies of local analysis.
