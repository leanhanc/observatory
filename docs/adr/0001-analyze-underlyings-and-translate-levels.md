---
status: accepted
---

# Analyze underlying instruments and translate relevant levels

For CEDEAR coverage in the initial product, Observatory will perform technical analysis on the foreign Underlying Instrument rather than independently analyzing the CEDEAR's local price history. This preserves the longer and cleaner history used by the research while avoiding a second body of analysis whose local volume, gaps, liquidity, and price structure would require separate interpretation and evidence.

Observatory will connect each supported CEDEAR to its Underlying Instrument through an explicit catalog entry. When the analysis identifies a relevant price level for the underlying, the product may express the same relative move from the CEDEAR's current price as an approximate BYMA equivalent:

```text
approximate CEDEAR level = current CEDEAR price * (underlying level / current underlying price)
```

The result must be presented as an approximation that assumes current conversion conditions remain stable. It is not a price target: exchange rates, the published conversion ratio, local supply and demand, and differences between market sessions can change the CEDEAR price independently.

Independent analysis of CEDEAR volume, gaps, liquidity, premium, and local price structure is outside the initial scope. It may be added later as its own capability if it helps Argentine investors understand why a locally traded instrument deserves attention. Argentine stocks without a foreign underlying continue to be analyzed from their own BYMA history.

The market-data source for foreign underlying history remains a separate, unresolved decision.
