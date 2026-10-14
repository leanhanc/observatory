# Resolve line-page wording contradictions

## Why

The live v10 page for PAMP shows two sentences that read as contradictions.

"Qué observar" says: "Un cierre por encima de 5.336 pesos (US$ 3,47) rompería el patrón descendente: los máximos dejarían de ser cada vez más bajos. La tendencia seguiría siendo indefinida." The next line says: "Con cierres por encima de 5.288 pesos (US$ 3,43), la tendencia pasaría a ser alcista." The break level lies beyond the tipping point, so closes above it would also be closes that turn the trend. "Seguiría siendo indefinida" is only true for a single close, because a Regime change needs its confirming sessions, and the page doesn't say so.

"Últimos cambios" says: "Cerró en 4.703 pesos (US$ 3,30), por debajo del último mínimo confirmado: 4.703 pesos (US$ 3,30)". The close was 4.702,50 pesos against a low of 4.703,45: below it by less than the rounding, so both read 4.703.

## What Changes

- The pattern line's trend clause becomes "Por sí solo, no cambia la tendencia." It is always true, since a Structure Break never changes Regime, and it names no trend that a tipping point could contradict. The clause is still omitted while Regime is `null`, where there is no trend to speak of. Considered and set aside: hiding the old clause only when the break level lies beyond a tipping point. It would keep a sentence that is true only for one close, and make its presence depend on a comparison the reader doesn't see.
- A Structure Break whose close and level have the same leading figure reads "apenas por debajo" or "apenas por encima" of the level, and keeps both prices. The comparison uses the figures as written (the peso figure on a peso line, otherwise the analyzed price), not a numeric threshold, so the rule follows what the reader sees. Considered and set aside: printing more decimals when the figures collide, which would break the page's whole-peso format for one sentence. In the current snapshot, 10 Structure Breaks collide in pesos and 92 in MEP dollars, so the dollar check matters for lines not traded in pesos.

English, for the wording table: "On its own, it doesn't change the trend." and "just below" / "just above".

## Capabilities

### Modified Capabilities

- `web-app`: the pattern line's trend clause and the Structure Break side when the figures collide.

## Impact

- `src/web/lib/utils/line-wording`: `describePattern`, `describeStructureBreak` and the leading-figure formatting shared with `describeLevelPrice`.
- Wording only. No snapshot or analysis change, so the next web deploy shows it without an Analysis Run.
