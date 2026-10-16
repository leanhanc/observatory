## ADDED Requirements

### Requirement: a line page offers a currency view without JavaScript

An available line traded in pesos, as its Trading Line's currency in the Instrument Catalog says, SHALL offer three currency views: ARS, in pesos; USD, in MEP dollars, the analyzed unit; and CCL, in CCL dollars. The CCL view SHALL be offered only when the line's `cclEquivalents` is not `null`; otherwise the page offers ARS and USD. A line the Catalog does not list as ARS SHALL show only the analyzed prices, in MEP dollars, with no currency control.

The control SHALL be a group of radio inputs, one per offered view, labeled "ARS", "USD" and "CCL" in that order, with a "Moneda" legend, placed in the identity section after the data date. ARS SHALL be checked in the HTML, so the page as built and indexed reads in pesos.

The build SHALL render every view's variant of each phrase that names a price, a price's currency or a currency's return: the period returns, the support and resistance lines, the pattern line, the trend tipping points, the Structure Break Events, the raw evidence and the currency note. Each variant SHALL be marked with its view, and CSS alone SHALL show the variant of the checked view and hide the others, with `:has()` on the checked input; without that support the ARS variants show. The page SHALL ship no script for it, and SHALL NOT use a route, a query string or a fragment per view: one URL serves every view. Phrases without a price, such as the trend, the 200-session distance, the pending trend change, Regime Transitions, Volatile Sessions and the momentum, SHALL be rendered once.

The control's CSS SHALL be plain CSS inside a cascade layer, and minimal: a segmented row of the three labels with the checked one marked. It SHALL NOT restyle anything else on the page.

#### Scenario: GGAL offers three views

- **WHEN** the build writes GGAL's page and its `cclEquivalents` is not `null`
- **THEN** the page has radio inputs labeled ARS, USD and CCL, in that order, with ARS checked
- **AND** each phrase that names a price is rendered three times, once per view
- **AND** the page has no `<script` tag

#### Scenario: no CCL Rate on the line's session

- **WHEN** a peso line's `cclEquivalents` is `null`, because the run had no CCL Rate or none on the line's last session
- **THEN** its page has only the ARS and USD inputs, with ARS checked, and renders no CCL variant

#### Scenario: a line not traded in pesos

- **WHEN** a line's Trading Line currency is not ARS
- **THEN** its page has no currency inputs and shows its prices in MEP dollars only

#### Scenario: phrases without a price are rendered once

- **WHEN** the build writes GGAL's page
- **THEN** "Tendencia bajista." and its momentum sentence appear once each

### Requirement: each currency view shows only its own currency

Each view SHALL name prices, levels and returns only in its own currency, everywhere on the page:

- ARS: the levels from `pesoEquivalents`, the period returns from `pesoPeriodReturns`, and each Structure Break's prices from its own `pesoEquivalents`;
- USD: the analyzed prices from the State and the Events, and the period returns from `periodReturns`;
- CCL: the levels from `cclEquivalents`, the period returns from `cclPeriodReturns`, and each Structure Break's prices from its own `cclEquivalents`.

A view SHALL NOT pair its price with another currency's: the ARS view writes "5.662 pesos", not "5.662 pesos (US$ 3,68)". The page SHALL NOT convert any value, and SHALL NOT use the line's equivalents, at the last session's rate, for an Event. Distances in percent are the same in every view, since the analysis converts the close and its levels with one session's rates, so the page reads them from the State once.

The "apenas" rule SHALL be evaluated in each view's own currency and formatting: a Structure Break reads "apenas por debajo" or "apenas por encima" in a view exactly when that view's close and level print the same figure.

In the CCL view, a Structure Break whose `cclEquivalents` is `null` SHALL keep its sentence without prices and add "Sin cotización CCL ese día.", and a period return that is unavailable in CCL dollars while the same window's `periodReturns` entry is available SHALL read "— <period> (sin cotización CCL)", since its start or end session had no CCL Rate. No other session's rate or currency SHALL stand in for either.

#### Scenario: GGAL's levels in each view

- **WHEN** GGAL's last confirmed swing low is 3.68 MEP dollars, 5,662 pesos in `pesoEquivalents` and 3.51 in `cclEquivalents`, with the close 4.9% above it
- **THEN** the ARS view shows "Soporte en 5.662 pesos: el cierre está 4,9 % por encima."
- **AND** the USD view shows "Soporte en US$ 3,68: el cierre está 4,9 % por encima."
- **AND** the CCL view shows "Soporte en US$ 3,51: el cierre está 4,9 % por encima."

#### Scenario: no view names another currency's price

- **WHEN** the build writes GGAL's page with all three views
- **THEN** no ARS variant contains "US$"
- **AND** no USD or CCL variant contains a peso amount

#### Scenario: period returns in each view

- **WHEN** GGAL's one-month, three-month and one-year returns are −15.1%, −26.3% and +25.1% in pesos, −15.2%, −27.3% and +14.3% in MEP dollars, and −15.8%, −28.3% and +10.4% in CCL dollars
- **THEN** the ARS view shows "−15,1 % en un mes · −26,3 % en tres meses · +25,1 % en un año (en pesos, incluye la suba del dólar)"
- **AND** the USD view shows "−15,2 % en un mes · −27,3 % en tres meses · +14,3 % en un año (en dólares MEP)"
- **AND** the CCL view shows "−15,8 % en un mes · −28,3 % en tres meses · +10,4 % en un año (en dólares CCL)"

#### Scenario: a CCL return without a rate at an endpoint

- **WHEN** the one-month `cclPeriodReturns` entry is unavailable and the one-month `periodReturns` entry is −15.2%
- **THEN** the CCL view shows "— en un mes (sin cotización CCL)"
- **AND** a window unavailable in every currency still reads "(sin historia suficiente)"

#### Scenario: a Structure Break in each view (PAMP)

- **WHEN** PAMP's downward Structure Break on 2026-09-18 from an `uptrend` has a close of 3.39 MEP dollars and a defining swing low of 3.46 that occurred 2026-09-07 and was confirmed 2026-09-10, its `pesoEquivalents` are a close of 5,215 and a swing of 5,325, and its `cclEquivalents` a close of 3.25 and a swing of 3.32
- **THEN** the ARS view shows "18 sep · Se rompió el patrón ascendente. Cerró en 5.215 pesos, por debajo del último mínimo confirmado: 5.325 pesos, del 7 sep, confirmado el 10 sep."
- **AND** the USD view shows "… Cerró en US$ 3,39, por debajo del último mínimo confirmado: US$ 3,46, …"
- **AND** the CCL view shows "… Cerró en US$ 3,25, por debajo del último mínimo confirmado: US$ 3,32, …"

#### Scenario: a Structure Break on a session without a CCL Rate

- **WHEN** a Structure Break's `cclEquivalents` is `null` and the line's `cclEquivalents` is not
- **THEN** the CCL view shows "18 sep · Se rompió el patrón ascendente. Cerró por debajo del último mínimo confirmado, del 7 sep, confirmado el 10 sep. Sin cotización CCL ese día."
- **AND** the ARS and USD views show the Event with their own prices

#### Scenario: "apenas" in each view's own figures

- **WHEN** an upward Structure Break has a peso close of 8,330 and a high of 8,328, both US$ 5,41 in MEP dollars, and 5.18 and 5.17 in CCL dollars
- **THEN** the ARS view reads "por encima del último máximo confirmado", since 8.330 and 8.328 differ
- **AND** the USD view reads "apenas por encima del último máximo confirmado", since both read US$ 5,41
- **AND** the CCL view reads "por encima del último máximo confirmado", since US$ 5,18 and US$ 5,17 differ

## MODIFIED Requirements

### Requirement: a line page renders the approved wording

A line page SHALL render the wording of the approved line-page wording table (in this change's design.md) from the snapshot's facts, and SHALL NOT compute domain values: every number it shows SHALL be read from the snapshot, and the page only rounds, signs, takes absolute values for wording that names the side, and chooses wording from the facts. A part that is `null` SHALL NOT be shown as a number or as `0`. Each phrase that names a price is written in each currency view, as the currency-view requirements describe; the sentences below show the USD view unless a scenario names another.

The page SHALL identify the line from the Instrument Catalog: its symbol as the ticker, its type as "Acción argentina" for a stock or "CEDEAR", and for a CEDEAR its Underlying as "Subyacente: <ticker> · <market>". A line the Catalog does not list SHALL show its Trading Line ID and no type.

For an available line, the page SHALL render:

- **Trend** from `regime`: "Tendencia alcista. Se confirmó con el precio y la media de 50 ruedas por encima de la de 200.", the mirror "por debajo" for "Tendencia bajista.", "Tendencia indefinida." with the table's sentence. A settled Regime lags the close by its confirming sessions, so the sentence says what confirmed it, not where the price is today. For `null` it SHALL show "Sin historia suficiente para leer la tendencia (hacen falta unas 200 ruedas)."
- **Period returns** on one line, each window named ("en un mes", "en tres meses", "en un año" for windows of 1, 3 and 12 months) with its signed percent change, then the view's currency: "(en pesos, incluye la suba del dólar)" from `pesoPeriodReturns`, "(en dólares MEP)" from `periodReturns`, or "(en dólares CCL)" from `cclPeriodReturns`. A `null` change SHALL show as "— … (sin historia suficiente)", except in CCL dollars as the currency-view requirement says.
- **Distance from the 200-session average** from `priceRelativeToLongTermEmaInPercent`, as "El cierre está x % por debajo|por encima de su media móvil de 200 ruedas.", omitted when `null`.
- **Support and resistance** as described in the Situation label requirement, with "Todavía no hay máximos ni mínimos confirmados." when neither swing is confirmed, and "Todavía no hay un mínimo confirmado." or "Todavía no hay un máximo confirmado." when only one is.
- **Pattern** from `structure`, naming what its level changes. A `downtrend` SHALL read "Un cierre por encima de <level> rompería el patrón descendente: los máximos dejarían de ser cada vez más bajos.", with the last confirmed swing high as the level, and an `uptrend` "Un cierre por debajo de <level> rompería el patrón ascendente: los mínimos dejarían de ser cada vez más altos.", with the last confirmed swing low. Either SHALL add "Por sí solo, no cambia la tendencia." while `regime` is readable, and nothing when `regime` is `null`. A break makes Structure undefined and does not change Regime, so the page SHALL NOT say that a close reverses the pattern or the trend. It SHALL NOT name the trend the line would keep either: the break level can lie beyond a trend tipping point, where closes would also change the trend. A trending pattern without its level SHALL read "Patrón descendente: máximos y mínimos cada vez más bajos." or "Patrón ascendente: máximos y mínimos cada vez más altos." The other patterns name no level: "Patrón lateral:", "Sin patrón claro:" for `undefined`, and "Sin patrón todavía:" for `null`, each with the table's sentence.
- **Trend tipping points** as described in their requirement.
- **Trend change in progress** from `pendingRegimeTransition`: "Posible cambio a tendencia <alcista|bajista|indefinida> en curso (n de m ruedas).", and nothing when `null`.
- **Recent changes** as described in their requirement.
- **Detail:** RSI as "Momentum: n sobre 100. En las últimas ruedas, las subas fueron el n % del movimiento total.", omitted when `null`; `priceRelativeToEmaInAtr` as "x movimientos diarios típicos por debajo|por encima de su media móvil de 20 ruedas."; the swing dates as "Mínimo del <date>, confirmado el <date> · Máximo del <date>, confirmado el <date>."; and the raw evidence in the view's currency: in ARS, the peso close with the MEP Rate, "Cierre del 13 oct: 5.940,00 pesos, con el dólar MEP a 1.539,94 pesos.", then the exact peso swings and tipping closes; in USD, the exact analyzed swings and tipping closes; in CCL, the CCL close with the CCL Rate, "Cierre del 13 oct: US$ 3,6840, con el dólar CCL a 1.612,38.", then the exact CCL swings and tipping closes.

Events SHALL be worded as:

- Structure Break: "<date> · Se rompió el patrón ascendente." for a prior `uptrend` or "descendente" for a prior `downtrend`, then "Cerró en <close>, por debajo del último mínimo confirmado: <level>, del <date>, confirmado el <date>." or the mirror with "por encima del último máximo confirmado". When the close and the level print the same figure in the view, the side SHALL read "apenas por debajo" or "apenas por encima", so the close does not appear beyond an equal price. The close and the level SHALL be the Event's own prices in the view's currency, as the currency-view requirement describes.
- Regime Transition: "<date> · Tendencia: <from> → <to>. Se confirmó tras n ruedas (<confirming dates>)."
- Volatile Session: "<date> · Rueda volátil: el rango del día fue x veces su rango diario típico."
- An Event that coincides with a Large One-Session Move SHALL add "⚠ Movimiento inusual en una sola rueda; suele deberse a un split u otro evento corporativo."

For an unavailable line it SHALL render "Sin analizar: opera muy poco volumen." with the table's sentence for `insufficient-liquidity`, "Sin datos." with the table's sentence for `no-provider-bars`, and "Sin analizar." with a sentence saying the prices could not be analyzed in the last update for any other reason. An `insufficient-liquidity` line SHALL also show its participation and median daily traded value in USD in tier 3, showing a `null` median as no trades in the period.

#### Scenario: GGAL, between its levels in a downtrend

- **WHEN** GGAL's State on 2026-10-09 is `bearish` and `downtrend`, its last confirmed swing low is 3.68 with the close 4.9% above it and `closePosition` `at-or-above`, its last confirmed swing high is 4.04 with the close 4.5% below it and `closePosition` `at-or-below`, its peso equivalents are 5,662 and 6,223, its MEP-dollar returns are −16.5%, −24.9% and +18.5%, and it is 17.8% below its 200-session average
- **THEN** its page shows "Tendencia bajista.", "−16,5 % en un mes · −24,9 % en tres meses · +18,5 % en un año (en dólares MEP)" in the USD view and "El cierre está 17,8 % por debajo de su media móvil de 200 ruedas."
- **AND** in the ARS view "Soporte en 5.662 pesos: el cierre está 4,9 % por encima." and "Resistencia en 6.223 pesos: el cierre está 4,5 % por debajo."
- **AND** in the ARS view "Un cierre por encima de 6.223 pesos rompería el patrón descendente: los máximos dejarían de ser cada vez más bajos. Por sí solo, no cambia la tendencia."

#### Scenario: a short history

- **WHEN** a line's Regime, Structure and price relative to the long-term EMA are `null` and its twelve-month return is `null` in every currency
- **THEN** its page shows "Sin historia suficiente para leer la tendencia", "Sin patrón todavía:" and "— en un año (sin historia suficiente)"
- **AND** no distance from the 200-session average

#### Scenario: a pending trend change (PATH, TECO2)

- **WHEN** PATH has a pending transition to `bullish` with 2 of 3 confirmations and TECO2 one to `mixed` with 1 of 3
- **THEN** PATH's page shows "Posible cambio a tendencia alcista en curso (2 de 3 ruedas)."
- **AND** TECO2's page shows "Posible cambio a tendencia indefinida en curso (1 de 3 ruedas)."

#### Scenario: Events

- **WHEN** a line not traded in pesos has a downward Structure Break on 2026-10-09 from an `uptrend`, closing at 3.50 against a low of 3.68 that occurred 2026-10-01 and was confirmed 2026-10-06, and a Regime Transition from `bullish` to `mixed` on 2026-09-29 confirmed on 2026-09-25, 2026-09-26 and 2026-09-29
- **THEN** its page shows "9 oct · Se rompió el patrón ascendente. Cerró en US$ 3,50, por debajo del último mínimo confirmado: US$ 3,68, del 1 oct, confirmado el 6 oct."
- **AND** "29 sep · Tendencia: alcista → indefinida. Se confirmó tras 3 ruedas (25, 26 y 29 sep)."

#### Scenario: an insufficiently liquid line

- **WHEN** a line is unavailable with reason `insufficient-liquidity`, participation 1 and median daily traded value 43,290 USD
- **THEN** its page shows "Sin analizar: opera muy poco volumen." with the table's sentence
- **AND** its participation and median in tier 3

#### Scenario: a line without provider bars

- **WHEN** a line is unavailable with reason `no-provider-bars`
- **THEN** its page shows "Sin datos. Nuestra fuente de datos de mercado no devolvió precios para esta especie."

#### Scenario: a rising pattern in a mixed trend

- **WHEN** a line's State is `mixed` and `uptrend`, and its last confirmed swing low is 3.68 MEP dollars with peso equivalent 5,662
- **THEN** its ARS view shows "Un cierre por debajo de 5.662 pesos rompería el patrón ascendente: los mínimos dejarían de ser cada vez más altos. Por sí solo, no cambia la tendencia."

#### Scenario: a pattern without a level to break

- **WHEN** a line's Structure is `range` or `undefined`
- **THEN** its page shows "Patrón lateral:" or "Sin patrón claro:" with the table's sentence and no "rompería" sentence

#### Scenario: a break level beyond a trend tipping point (PAMP)

- **WHEN** PAMP's State on 2026-10-13 is `mixed` and `downtrend`, its last confirmed swing high has a peso equivalent of 5,336, and its bullish tipping close has a peso equivalent of 5,288
- **THEN** its ARS view shows "Un cierre por encima de 5.336 pesos rompería el patrón descendente: los máximos dejarían de ser cada vez más bajos. Por sí solo, no cambia la tendencia."
- **AND** it does not say that the trend would stay "indefinida"

#### Scenario: a Structure Break that crossed by less than the rounding (PAMP)

- **WHEN** PAMP's downward Structure Break on 2026-05-08 from an `uptrend` has a peso close of 4,702.50 and a defining swing low of 4,703.45 in pesos, which both read 4.703, and 3.2954 and 3.2960 MEP dollars, which both read 3,30
- **THEN** its ARS view shows "8 may · Se rompió el patrón ascendente. Cerró en 4.703 pesos, apenas por debajo del último mínimo confirmado: 4.703 pesos, del 27 abr, confirmado el 30 abr."
- **AND** its USD view shows "Cerró en US$ 3,30, apenas por debajo del último mínimo confirmado: US$ 3,30"

#### Scenario: "apenas" follows the leading figure

- **WHEN** an upward Structure Break has a peso close of 8,330 and a high of 8,328 in pesos, both 5,41 in MEP dollars
- **THEN** the ARS view reads "por encima del último máximo confirmado", since 8.330 and 8.328 differ
- **AND** the USD view reads "apenas por encima del último máximo confirmado", since both read US$ 5,41

### Requirement: line pages are in Spanish with es-AR formats

Line pages and the not-found page SHALL be in impersonal Spanish and declare `lang="es"`. The home page stays in English until its own wording is settled. Numbers SHALL use es-AR formatting: a dot groups thousands, a comma separates decimals, a negative number uses the minus sign `−`, and a unit or sign stays on the same line as its number. Percentages SHALL have one decimal and a space before `%`, with a sign where the wording does not name the side. Prices in MEP dollars and in CCL dollars SHALL be written `US$ 4,04`, with two decimals, or three significant digits when the price rounds to less than one; the view and its currency note say which dollar it is. Exact prices in raw evidence SHALL have up to four decimals, and exact peso amounts two. Peso amounts SHALL be written `5.662 pesos`, whole when they round to a thousand or more and with two decimals below. Header dates SHALL be written "viernes 9 de octubre de 2026", and list dates "9 oct", with months abbreviated as ene, feb, mar, abr, may, jun, jul, ago, sep, oct, nov and dic. A list of dates SHALL name each month once, after its last day: "25, 26 y 29 sep" or "30 sep, 1 y 2 oct".

The table's English column is kept in the design for a later English version; this change builds no language routing.

#### Scenario: es-AR numbers

- **WHEN** a page shows −17.83%, +41.6%, 4.0412 MEP dollars, 3.5129 CCL dollars and 5,662.4 pesos
- **THEN** it shows "−17,8 %", "+41,6 %", "US$ 4,04", "US$ 3,51" and "5.662 pesos"

#### Scenario: a zero percentage

- **WHEN** a period return rounds to 0.0%
- **THEN** it shows "0,0 %", without a sign

### Requirement: the line page reads in a fixed order with tiers

A line page SHALL render, in order:

0. identity: the ticker, the type, the data date, the currency control on an available peso line, and in tier 2 the CEDEAR's Underlying and, on an available peso line, the currency note;
1. what the line is doing: the trend and the period returns, then the distance from the 200-session average in tier 2;
2. support and resistance;
3. what would change it: the pattern with its break level, the trend tipping points and the trend change in progress;
4. "Últimos cambios";
5. detail: momentum in tier 2, and the short-term stretch, the swing dates and the raw evidence in tier 3.

Tier 1 SHALL always be visible. Tier 2 SHALL be visible and collapsible, as an open `<details>` element with a `<summary>`. Tier 3 SHALL be collapsed by default, as a closed `<details>` element. The page SHALL NOT use client JavaScript for collapsing.

The currency note SHALL change with the view:

- ARS: "Precios en pesos. El análisis se hace en dólares MEP; los precios en pesos son aproximados: equivalen al dólar MEP de cada día."
- USD: "Precios en dólares MEP, la moneda en la que se hace el análisis: cada precio en pesos dividido por el dólar MEP de ese día."
- CCL: "Precios en dólares CCL, aproximados: cada precio en pesos dividido por el dólar CCL de ese día. El análisis se hace en dólares MEP."

It is the only place the page says that converted figures are approximate. "De cada día" and "de ese día" cover both rates the page uses: the levels in "Soporte y resistencia" and "Qué observar" are at the last session's rate, and each Event's prices at its own session's.

#### Scenario: tiers without JavaScript

- **WHEN** the build writes GGAL's page
- **THEN** the distance from the 200-session average and the momentum are inside open `<details>` elements
- **AND** the swing dates and the full history are inside closed `<details>` elements
- **AND** the page has no `<script` tag

#### Scenario: a CEDEAR's identity

- **WHEN** the build writes LAC's page
- **THEN** it shows "LAC", "CEDEAR", the currency control and, in tier 2, "Subyacente: LAC · NYSE" and the currency note in each view

#### Scenario: an unavailable line has no currency note

- **WHEN** a peso line is unavailable
- **THEN** its page shows no currency note and no currency control, since it shows no prices

### Requirement: trend tipping points name the nearest change

The page SHALL show the Regime tipping close at which the trend would change soonest:

- for a `bearish` Regime, the bearish close, as "Con cierres por encima de <level>, la tendencia dejaría de ser bajista.";
- for a `bullish` Regime, the bullish close, as "Con cierres por debajo de <level>, la tendencia dejaría de ser alcista.";
- for a `mixed` Regime, both, as "Con cierres por encima de <level>, la tendencia pasaría a ser alcista." and "Con cierres por debajo de <level>, la tendencia pasaría a ser bajista.", each adding "Además, la media de 50 ruedas tendría que pasar por encima de la de 200." for the bullish point, or "por debajo" for the bearish point, when that side's `isFastEmaAligned` is `false`.

Leaving a trend needs only its price condition to fail, so the bearish and bullish points carry no 50-session sentence; entering one from `mixed` needs both conditions. Each point SHALL be its own line, apart from the pattern's break level, since the two levels change different things: the pattern level changes Structure, the tipping point changes Regime. A point speaks of closes, in the plural, because a single close does not change the trend. The farther edge, where a bearish trend would become bullish or the reverse, is not shown. No point SHALL be shown while `regime` or `regimeTippingCloses` is `null`. The page SHALL NOT explain the rule's internals; they belong on a future About page. `<level>` is the tipping close in the view's currency.

#### Scenario: a bearish trend (GGAL)

- **WHEN** GGAL is `bearish`, its bearish tipping close is 4.62 MEP dollars with peso equivalent 7,109, and its bullish tipping close is 4.77
- **THEN** its ARS view shows "Con cierres por encima de 7.109 pesos, la tendencia dejaría de ser bajista." and its USD view the same with "US$ 4,62"
- **AND** not the bullish close

#### Scenario: a bullish trend (XP)

- **WHEN** XP is `bullish`, its bullish tipping close is 4.95 MEP dollars with peso equivalent 7,619, and EMA50 is not below EMA200
- **THEN** its ARS view shows "Con cierres por debajo de 7.619 pesos, la tendencia dejaría de ser alcista." without the 50-session sentence

#### Scenario: a mixed trend (PATH)

- **WHEN** PATH is `mixed` and EMA50 is above EMA200
- **THEN** its page shows "… la tendencia pasaría a ser alcista." and "… la tendencia pasaría a ser bajista.", and the 50-session sentence only on the bearish point

## REMOVED Requirements

### Requirement: peso lines show peso equivalents first

**Reason**: Each currency view now shows only its own currency; the pairing of a peso price with its MEP-dollar price goes away.

**Migration**: See "each currency view shows only its own currency", which keeps the Event rule (each Structure Break's prices at its own session's rate) and the rule that the page converts nothing.
