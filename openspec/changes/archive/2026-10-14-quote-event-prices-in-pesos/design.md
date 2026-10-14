# Design

## Which MEP Rate converts an Event's prices

A Structure Break is decided in MEP dollars: the dollarized close is beyond the last confirmed swing. Its peso prices could use three rates. Real data: PAMP broke its rising pattern on 2026-09-18 with a dollarized close of US$ 3,39 below the low of 2026-09-07 at US$ 3,46. The MEP Rate was 1.538,32 that day and 1.539,94 on the last session, 2026-10-13. PAMP's own peso low on 2026-09-07 was 5.290.

| Rate                                                    | Close                      | Crossed low |
| ------------------------------------------------------- | -------------------------- | ----------- |
| The Event session's                                     | 5.215, PAMP's actual close | 5.325       |
| The last session's                                      | 5.220, never traded        | 5.331       |
| Mixed (close at the Event's, low at the last session's) | 5.215                      | 5.331       |

Lean chose the Event session's rate, for both prices:

- **The close is a fact.** It is the peso close the reader saw on their broker that day, not a conversion. With the last session's rate it would be a hypothetical price that changes every day, for an Event that is over.
- **One rate per sentence.** The close and the swing share the rate that dollarized the bar, so "cerró por debajo de …" is true in pesos exactly when it is true in MEP dollars. The mixed option uses two rates: when the MEP Rate falls enough between the break and the last session, the converted low ends up below the actual close, and the sentence contradicts itself.
- **The cost.** The same swing can have a different peso price in an Event than as today's watch level, and the swing's peso price is neither the line's peso low on the swing's own day: here 5.325, not 5.290. A swing is a dollarized level, so no peso price was the trigger; the note says the values follow the MEP dollar of each day.

The close is the corrected peso close: after a confirmed Corporate Action, such as a split, it is adjusted, and it differs from what the broker showed that day by the action's factor. The line page's Large One-Session Move note already flags a session like that.

## No missing rate

Events are detected on the Dollarized Series, whose bars exist only for sessions with both a peso bar and a MEP Rate, so every Event session has a rate. The fields are numbers, never `null`, as the line's `pesoEquivalents` are: a nullable field would add a branch no data can reach. The run looks up the Event session's rate and peso bar the same way it does for the latest State.

## Only Structure Breaks

The peso prices belong to the Structure Break inside the snapshot Event, `event.pesoEquivalents`, because only that kind carries prices the page shows. A Regime Transition names Regimes and sessions. A Volatile Session's `trueRange` and `baselineAtr` are in MEP dollars, but the page shows only `atrMultiple`, their ratio.

## A line not traded in pesos

Every analyzed line is a BYMA peso line, stocks and CEDEARs alike (ADR 0004), so each Structure Break has `pesoEquivalents`. The page shows the analyzed price alone on a line its Instrument Catalog does not list as ARS, as it already does for the levels.

## Wording

The rows of the line-page wording table this change replaces. The English column is kept for a later English version.

| Fact            | ES                                                                                                                                              | EN                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Structure Break | <date> · Se rompió el patrón ascendente. Cerró en <close>, por debajo del último mínimo confirmado: <level>, del <date>, confirmado el <date>.  | <date> · The rising pattern broke. It closed at <close>, below the last confirmed low: <level>, from <date>, confirmed on <date>.   |
| Mirror          | <date> · Se rompió el patrón descendente. Cerró en <close>, por encima del último máximo confirmado: <level>, del <date>, confirmado el <date>. | <date> · The falling pattern broke. It closed at <close>, above the last confirmed high: <level>, from <date>, confirmed on <date>. |
| Currency note   | Precios analizados en dólares MEP. Los valores en pesos son aproximados: equivalen al dólar MEP de cada día.                                    | Prices are analyzed in MEP dollars. Peso values are approximate: they are converted at each day's MEP dollar rate.                  |

`<close>` and `<level>` are written as the levels are: "5.215 pesos (US$ 3,39)" on a peso line, with the peso figure in bold, and "US$ 3,39" otherwise.

## Deploy order

The web build reads `analysis-snapshots/v10/latest.json`, which no run has written yet. This change must not be pushed before the cron deploys the web at the analysis run's own commit; with that in place, the next run writes v10 and deploys the web that reads it.
