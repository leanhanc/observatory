# Design

## The analysis publishes every figure

AGENTS.md keeps calculations out of the UI, so the snapshot carries each view's numbers and the page only picks, rounds and words them. The analysis never reads the CCL figures or the peso returns: the Dollarized Series, the State, the Events and `periodReturns` are the same with or without them.

| Figure                               | MEP dollars (analyzed) | Pesos                                             | CCL dollars                                                    |
| ------------------------------------ | ---------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| Close and levels of the latest State | `latestState`          | `pesoEquivalents`, at that session's MEP Rate     | `cclEquivalents`, the peso values ÷ that session's CCL Rate    |
| A Structure Break's close and swing  | the Event              | its `pesoEquivalents`, at its session's MEP Rate  | its `cclEquivalents`, the peso values ÷ its session's CCL Rate |
| Period returns                       | `periodReturns`        | `pesoPeriodReturns`, on the corrected peso closes | `cclPeriodReturns`, on peso close ÷ the session's CCL Rate     |

A MEP-dollar level reaches CCL dollars through pesos at one session: `level × MEP Rate ÷ CCL Rate`. A CCL close is the corrected peso close ÷ the CCL Rate, a market fact divided by a rate, like the peso close is a market fact.

## One session, one set of rates

A CCL figure uses only the CCL Rate of the session it describes. A session can have a dollarized bar and no CCL Rate, when AL30C did not trade; then its CCL figure is `null`:

- The line's `cclEquivalents` is `null` when its latest session has no CCL Rate, even if the session before has one. Using it would print a CCL level that mixes two sessions' prices.
- A Structure Break's `cclEquivalents` is `null` when its session has none.
- A CCL return whose start or anchor session has none is unavailable. `calculatePeriodReturns` keeps that session in the calendar with a `null` close instead of dropping it: dropping it would make the window start one session earlier, borrowing that session's rate.

When the run has no CCL Rate at all, every CCL figure is `null`, `cclRateSource` is `null`, and every page hides the CCL option.

The page offers CCL per line, from the line's own `cclEquivalents`: a stale CCL Rate (AL30C did not trade on the last session) hides the option on every line that traded that session. That is why the `analyze` command warns, rather than logs at info, when the latest CCL Rate session is earlier than the latest MEP Rate session.

## The three returns share their sessions

All three return lists count windows over the sessions of the Dollarized Series, so a window starts and ends on the same two sessions in every currency. The peso series could have used peso sessions without a MEP Rate, but then a peso and a MEP return could describe different stretches, and the gap between them would not be only the currency's movement. AL30 lacks a bar on about one session in 500, so the difference is rare; sharing the sessions keeps it from ever being a reason.

## Why the returns differ and the distances do not

A distance in percent compares two prices of the same session converted with the same rate, so the rate cancels: 4,9 % above support is 4,9 % in every currency, and the page reads it once from the State. A return compares two sessions' closes, each converted with its own session's rate, so the rate's movement between them is part of the return. In pesos it includes the peso's devaluation, what a holder of the peso line got; in CCL dollars it moves with the MEP–CCL gap as well.

## The control without JavaScript

The build renders each phrase that names a price once per offered view, each wrapped in an element marked `data-currency-view="ars|usd|ccl"`. Three radio inputs in a fieldset form the control. CSS in a cascade layer hides the USD and CCL variants by default, so a browser without `:has()` reads pesos, and `:root:has(#currency-usd:checked)` swaps in the USD ones. ARS is `checked` in the HTML: it is what gets indexed and the line most readers trade. There is one URL; the view is not in the route, the query string or the fragment, and a reload returns to ARS.

Hidden variants are `display: none`, so a screen reader reads only the checked view. Phrases with no price render once.

A line the Instrument Catalog does not list as ARS gets no control and shows MEP dollars only, as it showed the analyzed price alone before. Every analyzed line is a BYMA peso line, so this covers only a line the Catalog no longer lists.

## The run result

The run result carried `cclRates` because the snapshot recorded no CCL field. The snapshot now records every CCL figure and the CCL Rate's latest session in `cclRateSource`, so the result drops `cclRates`.

## Wording

Lean approved this table as drafted, including plain "US$" for CCL prices: the view and the note say which dollar it is.

Each view names only its own currency. The rows this change adds or replaces:

| Fact                                     | ARS                                                                                                                             | USD                                                                                                                         | CCL                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Control                                  | ARS · USD · CCL, legend "Moneda"                                                                                                |                                                                                                                             |                                                                                                                                                      |
| Currency note                            | Precios en pesos. El análisis se hace en dólares MEP; los precios en pesos son aproximados: equivalen al dólar MEP de cada día. | Precios en dólares MEP, la moneda en la que se hace el análisis: cada precio en pesos dividido por el dólar MEP de ese día. | Precios en dólares CCL, aproximados: cada precio en pesos dividido por el dólar CCL de ese día. El análisis se hace en dólares MEP.                  |
| Price                                    | 5.662 pesos                                                                                                                     | US$ 3,68                                                                                                                    | US$ 3,51                                                                                                                                             |
| Support                                  | Soporte en 5.662 pesos: el cierre está 4,9 % por encima.                                                                        | Soporte en US$ 3,68: …                                                                                                      | Soporte en US$ 3,51: …                                                                                                                               |
| Returns                                  | −15,1 % en un mes · … (en pesos, incluye la suba del dólar)                                                                     | … (en dólares MEP)                                                                                                          | … (en dólares CCL)                                                                                                                                   |
| CCL return without a rate at an endpoint |                                                                                                                                 |                                                                                                                             | — en un mes (sin cotización CCL)                                                                                                                     |
| Structure Break                          | … Cerró en 5.215 pesos, por debajo del último mínimo confirmado: 5.325 pesos, del 7 sep, confirmado el 10 sep.                  | … Cerró en US$ 3,39, … US$ 3,46, …                                                                                          | … Cerró en US$ 3,25, … US$ 3,32, …                                                                                                                   |
| Structure Break without a CCL Rate       |                                                                                                                                 |                                                                                                                             | 18 sep · Se rompió el patrón ascendente. Cerró por debajo del último mínimo confirmado, del 7 sep, confirmado el 10 sep. Sin cotización CCL ese día. |
| Raw close                                | Cierre del 13 oct: 5.940,00 pesos, con el dólar MEP a 1.539,94 pesos.                                                           | (none: the last close at the top shows `latestClose.mep`, from v12)                                                         | Cierre del 13 oct: US$ 3,6840, con el dólar CCL a 1.612,38.                                                                                          |
| Raw levels                               | Último mínimo confirmado: 5.664,04 pesos.                                                                                       | Último mínimo confirmado: US$ 3,6781.                                                                                       | Último mínimo confirmado: US$ 3,5129.                                                                                                                |

The pattern line and the tipping points take the view's price in `<level>`, as the support line does. "Apenas" compares the view's own two figures.
