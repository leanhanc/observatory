---
status: accepted
---

# Keep US market data in the research lab

`observatory-research` is the private research lab. It may use US market data: it currently fetches daily history for US listings and CEDEAR dollar lines from an unofficial Yahoo Finance endpoint, whose terms of use are undocumented. This repository is the public product and uses only BYMA data. This boundary keeps the product clear of US data licensing, in line with [ADR 0004](./0004-analyze-local-stocks-and-cedears.md) and [ADR 0005](./0005-analyze-dollarized-local-series.md).

Ideas cross the boundary; data does not. Concepts, methods, parameters, specifications, and findings described in words may move from the lab into the product. Price histories, derived series, test fixtures, and statistics computed on US data stay in the lab. Product test fixtures come from BYMA data or are synthetic.

Evidence shown by the product is computed only on BYMA data, and confirmation uses sessions after the hypothesis was registered. BYMA history is not independent of what the lab has already seen: the lab studied about 15 years of the US underlyings behind the supported CEDEARs and the CEDEAR dollar lines themselves, and dollarized peso lines track those series closely. Testing a lab-derived hypothesis on the same historical period would recheck data that shaped it rather than confirm it.
