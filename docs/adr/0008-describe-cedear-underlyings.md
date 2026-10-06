---
status: accepted
---

# Describe a CEDEAR's underlying instead of cataloguing it

A CEDEAR records its underlying as a description: the market of origin and the ticker there, as BYMA's technical sheet gives them (`mercadoOrigen`, `simboloMercado`, for example `NASDAQ` / `AAPL` or `NYSE Arca` / `SPY`). It no longer references an underlying Instrument in the Instrument Catalog, and the catalog no longer needs a record for every underlying. This refines [ADR 0004](./0004-analyze-local-stocks-and-cedears.md), which kept CEDEAR-to-Underlying-Instrument relationships as catalog facts.

Under ADRs 0004 to 0006 nothing analyzes the underlying: Observatory analyzes the CEDEAR's own dollarized peso line and uses no US market data. An underlying Instrument would therefore exist only to satisfy the reference. It would also need a Trading Line on a market Observatory has no data for. And the reference required a `stock`, which does not fit the actual universe. About a quarter of Comafi's programs are ADRs and a tenth are ETFs, including commodity and bitcoin funds such as SLV, USO and IBIT. Some underlyings trade on XETRA, the London Stock Exchange or US OTC markets. Modelling all of them as Instruments would mean inventing kinds, exchanges and lines for assets Observatory never reads.

The description keeps what a reader needs to know, namely which foreign asset this CEDEAR represents, and costs one technical-sheet request per CEDEAR at generation. The market is stored as BYMA writes it (`NASDAQ GM`, `NYSE Arca`), not normalized to an exchange list, because nothing yet depends on comparing markets. The `apple-stock` Instrument and its NASDAQ line, which existed only as the Apple CEDEAR's underlying, are removed.

The conversion ratio is not recorded. It changes over time, no single machine-readable source covers every issuer, and nothing consumes it yet. Ratio changes as a source of false Events belong to the large-move safeguard.

If Observatory later needs to relate a CEDEAR to another catalogued Instrument, for example an Argentine stock's foreign ADR or a CEDEAR's own dollar line, that relationship should be added explicitly, not inferred from the description.
