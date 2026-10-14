# Name what each watch level changes

## Why

The "Qué observar" section mixes two levels that change different things. GGAL's page says "Patrón descendente: … Un cierre por encima de 6.225 pesos (US$ 4,04) lo rompería.", and readers miss what "lo" refers to. The pattern level is the last confirmed swing a Structure Break reads: crossing it breaks the pattern, which becomes "sin patrón claro" rather than reversing, and it does not change the trend. The trend tipping point is where closes change Regime. The glossary keeps Structure and Regime apart, so the page should too, and it must not say that a single close reverses the trend.

Every peso figure also carries the approximation sign, which Argentine readers do not use. The peso figures are approximate because they are converted at the session's MEP Rate, and saying so once is enough.

## What Changes

- Peso figures drop the approximation sign: "5.662 pesos (US$ 3,68)".
- The tier-2 "Sobre esta especie" note says once that peso values are approximate: "Precios analizados en dólares MEP. Los valores en pesos son aproximados: equivalen al dólar MEP del último día y cambian con él." It replaces the current currency note rather than adding a second one.
- The pattern line of a trending pattern names its level and what crossing it changes: "Un cierre por encima de 6.225 pesos (US$ 4,04) rompería el patrón descendente: los máximos dejarían de ser cada vez más bajos. La tendencia seguiría siendo bajista." The mirror for a rising pattern. The trend clause is added only while Regime is readable, and names the current trend.
- A range, an undefined pattern and a warm-up keep their current sentences: they have no level to break.
- The trend tipping points keep their near-edge rules and read "Con cierres por encima de 7.101 pesos (US$ 4,61), la tendencia dejaría de ser bajista.", or "por debajo … dejaría de ser alcista". A mixed trend shows both directions as "… la tendencia pasaría a ser alcista." and "… pasaría a ser bajista.", with the 50-session sentence when EMA50 is not yet on that side.
- The level and the name of what it changes ("patrón descendente", "tendencia") are in bold.

No analysis or snapshot change: every number still comes from the snapshot, and the published-output guard is unchanged.

## Future work

The page ships no JavaScript, so the approximation note is static text in the open tier-2 `<details>`. When the help-pill island arrives, it becomes a dismissable warning.

## Capabilities

### Modified Capabilities

- `web-app`: the line-page wording of peso figures, the currency note, the pattern line and the trend tipping points.
