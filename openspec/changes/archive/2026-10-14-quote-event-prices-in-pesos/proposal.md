# Quote Event prices in pesos

## Why

On a peso line, the line page leads with peso prices: support, resistance, the pattern level and the trend tipping points come from `pesoEquivalents`. "Últimos cambios" still quotes Structure Breaks in MEP dollars only: "Se rompió el patrón ascendente. Cerró en US$ 3,39, por debajo del último mínimo confirmado (…)". A reader who trades PAMP in pesos looks for 5.215 pesos on their broker, not US$ 3,39. The sentence also names the swing it crossed without its price.

## What Changes

- **BREAKING** The snapshot schema goes from 9 to 10, and the key prefix with it (`analysis-snapshots/v10/`). Each `structure-break` Event adds `pesoEquivalents: { mepRate, closePrice, definingSwingPrice }`, at the MEP Rate of the Event's own session. `closePrice` is the line's corrected peso close that session, a market fact; `definingSwingPrice` is the swing converted at that rate.
- The fields are never `null`: an Event is detected on a dollarized bar, so its session always has a peso bar and a MEP Rate.
- Regime Transitions carry no price. Volatile Sessions carry `trueRange` and `baselineAtr` in MEP dollars, but the page shows only their ratio, which has no currency, so neither gets peso prices.
- The Structure Break sentence names both prices, peso first: "18 sep · Se rompió el patrón ascendente. Cerró en 5.215 pesos (US$ 3,39), por debajo del último mínimo confirmado: 5.325 pesos (US$ 3,46), del 7 sep, confirmado el 10 sep."
- The currency note says peso values follow the MEP dollar "de cada día" rather than "del último día", since Event prices use their own session's rate: "Precios analizados en dólares MEP. Los valores en pesos son aproximados: equivalen al dólar MEP de cada día."

## Capabilities

### Modified Capabilities

- `analysis-run`: Structure Break peso equivalents in the snapshot, schema version 10 and its validation.
- `web-app`: the Structure Break wording, the currency note and the peso requirement for Event prices.

## Impact

- `src/analysis/modules/analysis-run`: the run, its types and the snapshot schema.
- `src/web/lib/utils/line-wording`: `describeEvent` and `CURRENCY_NOTE`.
- The web build reads `analysis-snapshots/v10/latest.json`, which only a run from this commit writes.
- This change's web-app deltas are written over the versions in `name-what-watch-levels-change`, which archives first.
