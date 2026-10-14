## MODIFIED Requirements

### Requirement: a line page renders the approved wording

A line page SHALL render the wording of the approved line-page wording table (in this change's design.md) from the snapshot's facts, and SHALL NOT compute domain values: every number it shows SHALL be read from the snapshot, and the page only rounds, signs, takes absolute values for wording that names the side, and chooses wording from the facts. A part that is `null` SHALL NOT be shown as a number or as `0`.

The page SHALL identify the line from the Instrument Catalog: its symbol as the ticker, its type as "Acción argentina" for a stock or "CEDEAR", and for a CEDEAR its Underlying as "Subyacente: <ticker> · <market>". A line the Catalog does not list SHALL show its Trading Line ID and no type.

For an available line, the page SHALL render:

- **Trend** from `regime`: "Tendencia alcista. Se confirmó con el precio y la media de 50 ruedas por encima de la de 200.", the mirror "por debajo" for "Tendencia bajista.", "Tendencia indefinida." with the table's sentence. A settled Regime lags the close by its confirming sessions, so the sentence says what confirmed it, not where the price is today. For `null` it SHALL show "Sin historia suficiente para leer la tendencia (hacen falta unas 200 ruedas)."
- **Period returns** on one line, each window named ("en un mes", "en tres meses", "en un año" for windows of 1, 3 and 12 months) with its signed percent change, and "(en dólares MEP)" for `priceUnit` `mep-dollar`. A `null` change SHALL show as "— … (sin historia suficiente)".
- **Distance from the 200-session average** from `priceRelativeToLongTermEmaInPercent`, as "El cierre está x % por debajo|por encima de su media móvil de 200 ruedas.", omitted when `null`.
- **Support and resistance** as described in the Situation label requirement, with "Todavía no hay máximos ni mínimos confirmados." when neither swing is confirmed, and "Todavía no hay un mínimo confirmado." or "Todavía no hay un máximo confirmado." when only one is.
- **Pattern** from `structure`, naming what its level changes. A `downtrend` SHALL read "Un cierre por encima de <level> rompería el patrón descendente: los máximos dejarían de ser cada vez más bajos.", with the last confirmed swing high as the level, and an `uptrend` "Un cierre por debajo de <level> rompería el patrón ascendente: los mínimos dejarían de ser cada vez más altos.", with the last confirmed swing low. Either SHALL add "La tendencia seguiría siendo <alcista|bajista|indefinida>." naming the current `regime`, and nothing when `regime` is `null`. A break makes Structure undefined and does not change Regime, so the page SHALL NOT say that a close reverses the pattern or the trend. A trending pattern without its level SHALL read "Patrón descendente: máximos y mínimos cada vez más bajos." or "Patrón ascendente: máximos y mínimos cada vez más altos." The other patterns name no level: "Patrón lateral:", "Sin patrón claro:" for `undefined`, and "Sin patrón todavía:" for `null`, each with the table's sentence.
- **Trend tipping points** as described in their requirement.
- **Trend change in progress** from `pendingRegimeTransition`: "Posible cambio a tendencia <alcista|bajista|indefinida> en curso (n de m ruedas).", and nothing when `null`.
- **Recent changes** as described in their requirement.
- **Detail:** RSI as "Momentum: n sobre 100. En las últimas ruedas, las subas fueron el n % del movimiento total.", omitted when `null`; `priceRelativeToEmaInAtr` as "x movimientos diarios típicos por debajo|por encima de su media móvil de 20 ruedas."; the swing dates as "Mínimo del <date>, confirmado el <date> · Máximo del <date>, confirmado el <date>."; and the raw evidence: the peso close and the MEP Rate of `pesoEquivalents` on a peso line, and the exact analyzed prices of the swings and tipping closes.

Events SHALL be worded as:

- Structure Break: "<date> · Se rompió el patrón ascendente." for a prior `uptrend` or "descendente" for a prior `downtrend`, then "Cerró en <close>, por debajo del último mínimo confirmado (mínimo del <date>, confirmado el <date>)." or the mirror with "por encima del último máximo confirmado". The close SHALL be in the snapshot's price unit, since the snapshot has no peso equivalent for Event prices.
- Regime Transition: "<date> · Tendencia: <from> → <to>. Se confirmó tras n ruedas (<confirming dates>)."
- Volatile Session: "<date> · Rueda volátil: el rango del día fue x veces su rango diario típico."
- An Event that coincides with a Large One-Session Move SHALL add "⚠ Movimiento inusual en una sola rueda; suele deberse a un split u otro evento corporativo."

For an unavailable line it SHALL render "Sin analizar: opera muy poco volumen." with the table's sentence for `insufficient-liquidity`, "Sin datos." with the table's sentence for `no-provider-bars`, and "Sin analizar." with a sentence saying the prices could not be analyzed in the last update for any other reason. An `insufficient-liquidity` line SHALL also show its participation and median daily traded value in USD in tier 3, showing a `null` median as no trades in the period.

#### Scenario: GGAL, between its levels in a downtrend

- **WHEN** GGAL's State on 2026-10-09 is `bearish` and `downtrend`, its last confirmed swing low is 3.68 with the close 4.9% above it and `closePosition` `at-or-above`, its last confirmed swing high is 4.04 with the close 4.5% below it and `closePosition` `at-or-below`, its peso equivalents are 5,662 and 6,223, its returns are −16.5%, −24.9% and +18.5%, and it is 17.8% below its 200-session average
- **THEN** its page shows "Tendencia bajista.", "−16,5 % en un mes · −24,9 % en tres meses · +18,5 % en un año (en dólares MEP)" and "El cierre está 17,8 % por debajo de su media móvil de 200 ruedas."
- **AND** "Soporte en 5.662 pesos (US$ 3,68): el cierre está 4,9 % por encima." and "Resistencia en 6.223 pesos (US$ 4,04): el cierre está 4,5 % por debajo."
- **AND** "Un cierre por encima de 6.223 pesos (US$ 4,04) rompería el patrón descendente: los máximos dejarían de ser cada vez más bajos. La tendencia seguiría siendo bajista."

#### Scenario: a short history

- **WHEN** a line's Regime, Structure and price relative to the long-term EMA are `null` and its twelve-month return is `null`
- **THEN** its page shows "Sin historia suficiente para leer la tendencia", "Sin patrón todavía:" and "— en un año (sin historia suficiente)"
- **AND** no distance from the 200-session average

#### Scenario: a pending trend change (PATH, TECO2)

- **WHEN** PATH has a pending transition to `bullish` with 2 of 3 confirmations and TECO2 one to `mixed` with 1 of 3
- **THEN** PATH's page shows "Posible cambio a tendencia alcista en curso (2 de 3 ruedas)."
- **AND** TECO2's page shows "Posible cambio a tendencia indefinida en curso (1 de 3 ruedas)."

#### Scenario: Events

- **WHEN** a line has a downward Structure Break on 2026-10-09 from an `uptrend`, closing at 3.50 against a low that occurred 2026-10-01 and was confirmed 2026-10-06, and a Regime Transition from `bullish` to `mixed` on 2026-09-29 confirmed on 2026-09-25, 2026-09-26 and 2026-09-29
- **THEN** its page shows "9 oct · Se rompió el patrón ascendente. Cerró en US$ 3,50, por debajo del último mínimo confirmado (mínimo del 1 oct, confirmado el 6 oct)."
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
- **THEN** its page shows "Un cierre por debajo de 5.662 pesos (US$ 3,68) rompería el patrón ascendente: los mínimos dejarían de ser cada vez más altos. La tendencia seguiría siendo indefinida."

#### Scenario: a pattern without a level to break

- **WHEN** a line's Structure is `range` or `undefined`
- **THEN** its page shows "Patrón lateral:" or "Sin patrón claro:" with the table's sentence and no "rompería" sentence

### Requirement: the line page reads in a fixed order with tiers

A line page SHALL render, in order:

0. identity: the ticker, the type, the data date, and in tier 2 the CEDEAR's Underlying and, on an available peso line, the currency note;
1. what the line is doing: the trend and the period returns, then the distance from the 200-session average in tier 2;
2. support and resistance;
3. what would change it: the pattern with its break level, the trend tipping points and the trend change in progress;
4. "Últimos cambios";
5. detail: momentum in tier 2, and the short-term stretch, the swing dates and the raw evidence in tier 3.

Tier 1 SHALL always be visible. Tier 2 SHALL be visible and collapsible, as an open `<details>` element with a `<summary>`. Tier 3 SHALL be collapsed by default, as a closed `<details>` element. The page SHALL NOT use client JavaScript for collapsing.

The currency note SHALL read "Precios analizados en dólares MEP. Los valores en pesos son aproximados: equivalen al dólar MEP del último día y cambian con él." It is the only place the page says that peso figures are approximate.

#### Scenario: tiers without JavaScript

- **WHEN** the build writes GGAL's page
- **THEN** the distance from the 200-session average and the momentum are inside open `<details>` elements
- **AND** the swing dates and the full history are inside closed `<details>` elements
- **AND** the page has no `<script` tag

#### Scenario: a CEDEAR's identity

- **WHEN** the build writes LAC's page
- **THEN** it shows "LAC", "CEDEAR" and, in tier 2, "Subyacente: LAC · NYSE" and the currency note

#### Scenario: an unavailable line has no currency note

- **WHEN** a peso line is unavailable
- **THEN** its page shows no currency note, since it shows no prices

### Requirement: peso lines show peso equivalents first

On a line traded in pesos, as its Trading Line's currency in the Instrument Catalog says, each level the page names (a swing, a break level or a tipping point) SHALL show its peso equivalent from `pesoEquivalents` first, as "5.662 pesos", then the analyzed price in parentheses, as "(US$ 3,68)". Peso figures are equivalents at the session's MEP Rate. They SHALL NOT carry an approximation sign, which Argentine readers do not use; the tier-2 currency note says once that they are approximate. The page SHALL NOT convert any value: a level without a peso equivalent, or a line not traded in pesos, SHALL show the analyzed price alone. Event prices SHALL show the analyzed price alone, since the snapshot has no peso equivalent for them.

#### Scenario: a peso line

- **WHEN** GGAL's last confirmed swing low is 3.68 MEP dollars and its peso equivalent is 5,662
- **THEN** its support shows "5.662 pesos (US$ 3,68)", without an approximation sign

#### Scenario: a line not traded in pesos

- **WHEN** a line's Trading Line currency is not ARS
- **THEN** its levels show only "US$ 3,68"

### Requirement: trend tipping points name the nearest change

The page SHALL show the Regime tipping close at which the trend would change soonest:

- for a `bearish` Regime, the bearish close, as "Con cierres por encima de <level>, la tendencia dejaría de ser bajista.";
- for a `bullish` Regime, the bullish close, as "Con cierres por debajo de <level>, la tendencia dejaría de ser alcista.";
- for a `mixed` Regime, both, as "Con cierres por encima de <level>, la tendencia pasaría a ser alcista." and "Con cierres por debajo de <level>, la tendencia pasaría a ser bajista.", each adding "Además, la media de 50 ruedas tendría que pasar por encima de la de 200." for the bullish point, or "por debajo" for the bearish point, when that side's `isFastEmaAligned` is `false`.

Leaving a trend needs only its price condition to fail, so the bearish and bullish points carry no 50-session sentence; entering one from `mixed` needs both conditions. Each point SHALL be its own line, apart from the pattern's break level, since the two levels change different things: the pattern level changes Structure, the tipping point changes Regime. A point speaks of closes, in the plural, because a single close does not change the trend. The farther edge, where a bearish trend would become bullish or the reverse, is not shown. No point SHALL be shown while `regime` or `regimeTippingCloses` is `null`. The page SHALL NOT explain the rule's internals; they belong on a future About page.

#### Scenario: a bearish trend (GGAL)

- **WHEN** GGAL is `bearish`, its bearish tipping close is 4.62 MEP dollars with peso equivalent 7,109, and its bullish tipping close is 4.77
- **THEN** its page shows "Con cierres por encima de 7.109 pesos (US$ 4,62), la tendencia dejaría de ser bajista."
- **AND** not the bullish close

#### Scenario: a bullish trend (XP)

- **WHEN** XP is `bullish`, its bullish tipping close is 4.95 MEP dollars with peso equivalent 7,619, and EMA50 is not below EMA200
- **THEN** its page shows "Con cierres por debajo de 7.619 pesos (US$ 4,95), la tendencia dejaría de ser alcista." without the 50-session sentence

#### Scenario: a mixed trend (PATH)

- **WHEN** PATH is `mixed` and EMA50 is above EMA200
- **THEN** its page shows "… la tendencia pasaría a ser alcista." and "… la tendencia pasaría a ser bajista.", and the 50-session sentence only on the bearish point
