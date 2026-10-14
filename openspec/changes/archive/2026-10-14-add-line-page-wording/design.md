# Design

## The noise band is flagged by the analysis, not computed by the page

The two Situation labels in the table depend on how far the close is past the level, with a cutoff at half a typical daily move. Computing it in the page would mean the page reading ATR(14) and comparing it with a distance, a domain calculation in presentation, so the analysis publishes the result as `isBeyondNoiseBand` on each Situation.

- **Which band.** Half of ATR(14) is the margin Regime's band treats as noise around EMA(200). A close within it of a level has moved less than half a normal day's range past it, too little to call a fall "without a floor". The value is `ANALYSIS_CONFIGURATION.situations.noiseBandAtrMultiplier`, equal to `regime.atrBandMultiplier` by convention rather than by reuse: each concept owns its parameters, and changing Regime's band should not silently change the Situation wording. The ATR is the State's own ATR(14).
- **Strictness.** A distance exactly at the band is not beyond it, as a close exactly at a level is not beyond the level.
- **Missing ATR.** `null`, never `false`: a missing measurement must not read as "within the band". The page treats `null` as the calm label, so no dramatic label rests on a missing value. A Situation needs a readable Regime, which needs about 200 sessions, long after ATR(14) is readable, so `null` is not expected in practice.
- **Not a condition.** ADR 0011 keeps Situations threshold-free. The flag does not change which Situations are active or when a run started; within one run it can change from session to session. The dry run through 2026-10-09 has 35 active Situations, 13 of them within the band, including PEP at −0.84%, XLV at +0.08% and SAP at +1.07%, and 22 beyond it, including LAC at −12.76%, XP at +52.07% and SLV at −1.71%. The band is relative to each line's volatility, which is why SAP's +1.07% is calm and SLV's −1.71% is not.

## "Últimos cambios" reuses the one-month return's window

The table's "last 21 sessions" needs a start date. The one-month period return already has one, `fromSessionDate`, which the analysis measures in calendar months (see the change `count-period-returns-in-calendar-months`). Using it means "Sin cambios en el último mes" talks about the same month as "en un mes" beside it, and the page computes no calendar. When the window's start date was not a session or the line did not trade on it, `fromSessionDate` is its last earlier bar, and since the line has no bar in between, the Events after it are the same. A `null` `fromSessionDate` means the history is shorter than a month, so every Event is recent.

## Prices

- On a peso line, every level shows its peso equivalent first, from `pesoEquivalents`, then MEP dollars. Whether a line is a peso line comes from its Trading Line's currency in the Instrument Catalog.
- Event prices stay in MEP dollars: the snapshot has no peso equivalent for an Event's close, and the page does not convert.

## Tiers without JavaScript

Tier 2 is an open `<details>`, tier 3 a closed one. Both work without scripts, so the published-output guard keeps rejecting `<script`.

## Deploy order

The web build reads `analysis-snapshots/v9/latest.json`, which no run has written yet. The web service watches `src/analysis`, so pushing this change starts a web build that fails until a v9 snapshot exists. A failed build keeps the previous deployment serving its v8 pages, so nothing breaks for readers. The safe order:

1. With Lean's OK for the bucket write, run the Analysis Run once from this commit, either locally with the storage variables or by triggering the Railway service after pushing. It writes `v9/<session>/<ranAt>.json` and `v9/latest.json` and leaves the v8 objects in place.
2. The Railway run redeploys the web service after writing. For a local run, redeploy the web service by hand.
3. The web build reads v9 and publishes the Spanish pages.

## Wording not in the table

A few cases the table does not cover got minimal wording, to be reviewed with Lean:

- only one level confirmed: "Todavía no hay un mínimo confirmado." or "… máximo confirmado.";
- a mixed trend's two tipping points: "Punto de quiebre hacia tendencia alcista:" and "… bajista:", and the bearish point's 50-session sentence, the mirror of the bullish one;
- section headings ("Qué está haciendo", "Soporte y resistencia", "Qué observar", "Detalle") and the `<summary>` labels ("Sobre esta especie", "Media móvil de 200 ruedas", "Momentum", "Más detalle");
- an unavailable line's date ("Revisada al cierre del …") and the other unavailable reasons ("Sin analizar." with a generic sentence);
- the full history grouped under a heading per year, since list dates carry no year;
- the raw evidence in tier 3: the peso close and MEP Rate, and the exact analyzed prices.

## Changes to the approved table after review

- **Trend sentence.** "El precio está por encima de su media móvil de 200 ruedas, y la de 50 también" stated today's price, but a settled Regime lags the close by its three confirming sessions: on the GGAL fixture, 8 of 214 readable States had a bullish Regime with the close at or below EMA200, or the mirror. Lean chose "Se confirmó con el precio y la media de 50 ruedas por encima de la de 200", and the mirror for bearish.
- **Tipping point.** The table showed the point toward the other reading, the far edge: GGAL, bearish, showed where it would become bullish (≈ 7.344 pesos), while it stops being bearish at ≈ 7.109 pesos. Lean chose the near edge, worded as where the trend would stop: "con cierres por encima, dejaría de ser bajista". A mixed trend keeps both edges.

## Support and resistance distances name the close

The table's "Soporte en …, 4,9 % abajo" read as if the price were below the support, and its number is the close's distance measured against the level, `(close − level) / level`, not the level's distance below the close. For XP the two differ widely: "62,5 % abajo" while the support is 38,5 % below the close. Lean raised the inversion, so the page now says "Soporte en …: el cierre está 4,9 % por encima." and "Resistencia en …: el cierre está 4,5 % por debajo.", which states exactly what the number measures and matches the Situation labels ("El cierre está 12,8 % por debajo de su último mínimo confirmado").
