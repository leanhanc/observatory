## ADDED Requirements

### Requirement: the line page follows the approved design

The line page SHALL follow the approved minimalist-ui design with the Pastel scheme (this change's design.md lists the tokens).

- The page SHALL follow the operating system's color scheme. The dark tokens SHALL be the bare `:root`, and the light tokens SHALL apply under `@media (prefers-color-scheme: light)`, so a browser that states no preference gets dark. The page SHALL offer no theme or scheme switcher.
- The tokens, `color-scheme` and the `html` and `body` ground SHALL be unlayered. Every other rule SHALL sit in a cascade layer, and any third-party CSS SHALL be imported into one.
- The stylesheets SHALL be plain CSS, with no utility framework and no CSS modules.
- The fonts SHALL be Newsreader for display, Geist for body text and Geist Mono for figures, self-hosted in the build output. A page SHALL make no request to a font host at runtime.
- On a viewport narrower than 40rem, the chart SHALL run the full width of the page with a 16px gutter.

#### Scenario: dark by default

- **WHEN** a browser that states no color-scheme preference opens GGAL's page
- **THEN** the page uses the dark tokens

#### Scenario: light on request

- **WHEN** a browser that prefers light opens GGAL's page
- **THEN** the page uses the light tokens, and the chart redraws in them when the preference changes

#### Scenario: no font host

- **WHEN** the build writes GGAL's page
- **THEN** every font file the page uses is served from the build output

### Requirement: green and red mark only gains and losses

Green (`--up`) and red (`--down`) SHALL mark gains and losses only: the chart's candles, the period returns and the day change. A figure SHALL be a gain when the sign printed on its percentage is `+` and a loss when it is `−`; a percentage printed without a sign SHALL take no color. Every other measure, the distance from the 200-session average, RSI, the short-term stretch, the support and resistance ruler, the "Qué observar" ruler and the trend chip, SHALL use the foreground, accent or band colors, never green or red.

On the chart, an up candle, closing above its open, SHALL be hollow, with a `--up` border and wick, and a down candle SHALL be filled with `--down`.

#### Scenario: a falling day

- **WHEN** GGAL's peso view shows "$ 5.880 (−$ 60, −1,0 %)"
- **THEN** the change is marked as a loss and drawn in red

#### Scenario: a change that rounds away

- **WHEN** the USD view shows "U$S 4,00 (U$S 0,00, 0,0 %)"
- **THEN** the change takes no color

#### Scenario: a measure that is not a return

- **WHEN** the close is 17.7 % below its 200-session average
- **THEN** the 200-session ruler uses no green or red

#### Scenario: only returns are marked

- **WHEN** the build writes GGAL's page
- **THEN** only the day change and the period returns carry a gain or loss mark
- **AND** the stylesheets use `--up` and `--down` only in rules for those marks and for the chart legend's up and down candle keys

### Requirement: the line chart draws the analysis's candles and levels

An available line's page SHALL show a candlestick chart drawn by the chart island with lightweight-charts. The island SHALL fetch `/lines/<tradingLineId>/chart.json`, an absolute path, since the page is served with and without a trailing slash. The island SHALL request `chart.json` as soon as it starts, on page load. Only the charting library SHALL load lazily: the page's script defines the island and fetches the data, and the library's chunk SHALL be requested only when the chart's box nears the viewport. The box SHALL keep its height before and after the chart draws. When either request fails, the box SHALL show the same note as without JavaScript.

`chart.json` SHALL hold `currencyViews`, with one entry per currency view the page offers, keyed `ars`, `usd` and `ccl`, each with:

- `candles`: the line's `chartSeries` in that currency, unchanged: `peso` for ARS, `mep` for USD and `ccl` for CCL;
- `support`: the last confirmed swing low while its `closePosition` is `at-or-above`, at the price the view's text names: from `pesoEquivalents` in ARS, the State in USD and `cclEquivalents` in CCL; otherwise `null`;
- `resistance`: the last confirmed swing high while its `closePosition` is `at-or-below`, chosen and priced the same way; otherwise `null`.

The levels SHALL be chosen with the same selection the "Soporte y resistencia" text uses, so the chart and the text name the same levels. The web SHALL NOT convert, fill or recompute a candle or a level.

The chart SHALL draw the view's candles and its support and resistance as the only lines, labeled "Soporte" and "Resistencia" with their price on the axis. It SHALL show no volume, crosshair, tooltip, moving average or event marker. It SHALL offer the ranges 1m, 3m, 6m, 1a and Todo, open on 1a, and show the range control only once the island runs. The mouse wheel SHALL NOT zoom or scroll it. Pinch, axis drag and the range control SHALL change the range. A vertical swipe on a phone SHALL scroll the page. Under the chart it SHALL show the attribution the library's Apache 2.0 license requires: its NOTICE's attribution notice and a link to https://www.tradingview.com/, at 12px. The chart SHALL NOT show the library's attribution logo, since that line meets the requirement.

Without JavaScript, the page SHALL show a short note in the chart's place, and the rest of the page SHALL read in full.

#### Scenario: GGAL's chart in pesos

- **WHEN** GGAL's page opens with ARS checked
- **THEN** the chart draws GGAL's `chartSeries.peso` candles with its support and resistance at their `pesoEquivalents` prices
- **AND** the visible range starts a calendar year before the last candle

#### Scenario: a view without a CCL Rate on the latest session

- **WHEN** a peso line's `cclEquivalents` is `null`
- **THEN** its `chart.json` has `ars` and `usd` entries and no `ccl` entry

#### Scenario: the chart and the text name the same levels

- **WHEN** the build writes GGAL's page and its `chart.json`
- **THEN** each view's `support` and `resistance` are the prices that view's "Soporte y resistencia" names, and `null` where it names none

#### Scenario: the close is beyond a level

- **WHEN** the close is below the last confirmed swing low
- **THEN** that view's `support` is `null` and the chart draws no support line

#### Scenario: a line not traded in pesos

- **WHEN** a line's Trading Line currency is not ARS
- **THEN** its `chart.json` has only a `usd` entry

#### Scenario: the wheel does not zoom

- **WHEN** a reader scrolls the mouse wheel over the chart
- **THEN** the page scrolls and the chart's range stays the same

#### Scenario: a chart below the fold

- **WHEN** a reader opens GGAL's page on a phone and does not scroll toward the chart
- **THEN** `chart.json` is requested and the charting library's chunk is not

#### Scenario: a failed load

- **WHEN** the request for `chart.json` fails
- **THEN** the chart's box shows the note and keeps its height, and the rest of the page is unchanged

#### Scenario: without JavaScript

- **WHEN** GGAL's page opens without JavaScript
- **THEN** the chart's place shows the note, no range control shows, and every section after it reads in full

### Requirement: the visuals draw only published values

Each visual SHALL keep its sentence, unchanged, and SHALL draw only values the snapshot publishes:

- the trend as a neutral chip with the trend's name;
- the period returns as three filled bars around zero, one per window, on one scale per view;
- the 200-session average as a ruler with the close, the `longTermEma`, the noise band between the two tipping closes, and the tipping point that the trend tipping points requirement names, each at the view's prices;
- support and resistance as a ruler with the close between the levels the section names;
- "Qué observar" as a ruler from the close to the pattern's break level and the named tipping closes, each labeled with its `watchDistances` entry;
- RSI as a 0–100 meter with 30 and 70 marked;
- the short-term stretch as a bar from zero on a scale of ±3 ATR;
- "Últimos cambios" as a vertical timeline with a mark per Event kind.

A ruler, bar or meter SHALL read as a scale and not as a control: a hairline track, a thin needle for the close and a caret, with no round thumb. The web SHALL compute only where a value sits on a visual, by linear interpolation between published values or on a fixed display scale, clamping at its ends. It SHALL NOT print a figure it computed. A visual whose values are `null` SHALL NOT be drawn, and its sentence says why.

#### Scenario: the 200-session ruler

- **WHEN** GGAL's close is 17.7 % below its `longTermEma`, with tipping closes on either side of it
- **THEN** the ruler places the close left of the band, the average inside it, and marks the bearish tipping close as the trend's tipping point
- **AND** every figure on it is a snapshot value

#### Scenario: a short history

- **WHEN** a line's `longTermEma` is `null`
- **THEN** no 200-session ruler is drawn, and the section shows no distance sentence

#### Scenario: an RSI beyond the scale's zones

- **WHEN** RSI is 82
- **THEN** the needle sits at 82 % of the meter, inside the shaded zone above 70

#### Scenario: a stretch beyond the scale

- **WHEN** the price is 4.2 ATR above its 20-session average
- **THEN** the bar reaches the end of the +3 side and the sentence still says 4,2

### Requirement: a local build can read a snapshot file

When `OBSERVATORY_SNAPSHOT_FILE` names a file, the build SHALL read the snapshot from that file instead of the bucket, with the same validation as `readLatest`, and SHALL need no storage variables. When it is unset or empty, the build SHALL read the bucket as before. It is for building and checking pages locally from a dry run's `--output`; it never writes to the bucket.

#### Scenario: a dry run's file

- **WHEN** `OBSERVATORY_SNAPSHOT_FILE` names a v13 snapshot file and no storage variable is set
- **THEN** the build prerenders the pages from that file

#### Scenario: an invalid file

- **WHEN** `OBSERVATORY_SNAPSHOT_FILE` names a v12 snapshot
- **THEN** the build fails with the read's validation message

#### Scenario: a missing file

- **WHEN** `OBSERVATORY_SNAPSHOT_FILE` names a file that does not exist
- **THEN** the build fails and names the file

## MODIFIED Requirements

### Requirement: the build prerenders a page per analyzed line

The web app SHALL be statically generated. The build SHALL read the latest snapshot once and prerender exactly `/`, `/lines/<tradingLineId>` for each analyzed line in it, available or not, and the not-found page, and SHALL write `lines/<tradingLineId>/chart.json` for each available line in it, the file its chart reads. Each page except the not-found page SHALL be written as `index.html` in a directory named after its path, so that it is served with or without a trailing slash. The page list SHALL be derived from the snapshot; no Trading Line ID SHALL be written in code or configuration.

#### Scenario: two analyzed lines

- **WHEN** the latest snapshot has `ggal-stock-byma-ars` available and `meli-cedear-byma-ars` unavailable
- **THEN** the build writes `index.html`, `lines/ggal-stock-byma-ars/index.html`, `lines/meli-cedear-byma-ars/index.html` and `404.html`, and no other page
- **AND** it writes `lines/ggal-stock-byma-ars/chart.json` and no chart file for `meli-cedear-byma-ars`

#### Scenario: a line not in the snapshot

- **WHEN** the snapshot does not have a Trading Line ID
- **THEN** the build writes no page for it

### Requirement: pages ship no client JavaScript unless a component is an island

A page SHALL be plain HTML and CSS. It SHALL ship client JavaScript only for a component explicitly declared as an island. The only island is the line chart, on an available line's page; the home page, the not-found page and an unavailable line's page have none. Nothing else on a line page SHALL need JavaScript: the currency views, the tiers and every visual other than the chart SHALL work without it. A page SHALL NOT embed a copy of its data for client-side rendering: the chart fetches its static `chart.json`.

#### Scenario: a line page

- **WHEN** the build writes GGAL's page
- **THEN** the page has exactly one `<script`, the chart island's bundled module, no inline script and no serialized copy of the snapshot or of the chart series

#### Scenario: pages without an island

- **WHEN** the build writes the home page, the not-found page and an unavailable line's page
- **THEN** none has a `<script` tag or a modulepreload link

### Requirement: the build fails when the published output could leak or run code

After writing the pages, the build SHALL check every published file and fail, naming the file, when:

- an HTML page other than an available line's page contains `<script`;
- an available line's page, the only kind with a `<line-chart>` element, does not contain exactly one `<script`, a `<script type="module" src="/_astro/…">` with no inline content;
- any page contains a modulepreload link, since the island's own chunks load on demand;
- any published file contains a storage variable name (`OBSERVATORY_STORAGE`) or the bucket endpoint host (`storageapi`).

The rule allows the chart island's bundled script and nothing else.

#### Scenario: a clean build

- **WHEN** each available line page has only the chart's bundled module script and no published file has a storage variable name or bucket host
- **THEN** the build succeeds

#### Scenario: a script reaches the output

- **WHEN** the home page or an unavailable line's page contains `<script`
- **THEN** the build fails and names the page

#### Scenario: an inline script on a line page

- **WHEN** an available line's page contains `<script>hydrate()</script>`, or a second module script
- **THEN** the build fails and names the page

#### Scenario: server configuration reaches the output

- **WHEN** a published file, a `chart.json` included, contains `OBSERVATORY_STORAGE` or `storageapi`
- **THEN** the build fails and names the file

### Requirement: the line page reads in a fixed order with tiers

A line page SHALL render, in order:

0. identity: the "Ver todas" link; the ticker; the type, followed for a CEDEAR by "Subyacente: <ticker> · <market>" on the same line; the data date; and on an available line the last close and its day change;
1. on an available peso line, the currency control and the currency note, always visible; then, on an available line, the chart;
2. what the line is doing: the trend, the period returns, and the distance from the 200-session average with its ruler;
3. support and resistance;
4. what would change it: the pattern with its break level, the trend tipping points and the trend change in progress;
5. "Últimos cambios";
6. detail: momentum and the short-term stretch, then the swing dates and the raw evidence in tier 3.

Tier 1 SHALL always be visible. Tier 3 SHALL be collapsed by default, as a closed `<details>` element: the swing dates and the raw evidence under "Más detalle", the Volatile Sessions under their count, and the full history under "Ver historial". The page SHALL NOT use client JavaScript for collapsing.

The currency note SHALL change with the view:

- ARS: "Precios en pesos. El análisis se hace en dólares MEP; los precios en pesos son aproximados: equivalen al dólar MEP de cada día."
- USD: "Precios en dólares MEP, la moneda en la que se hace el análisis: cada precio en pesos dividido por el dólar MEP de ese día."
- CCL: "Precios en dólares CCL, aproximados: cada precio en pesos dividido por el dólar CCL de ese día. El análisis se hace en dólares MEP."

It is the only place the page says that converted figures are approximate. "De cada día" and "de ese día" cover every rate the page uses: the levels in "Soporte y resistencia" and "Qué observar" are at the last session's rate, and each Event's prices and each candle at its own session's.

#### Scenario: the last close leads the page

- **WHEN** the build writes GGAL's page
- **THEN** the last close comes right after "Datos al cierre del …" and before the currency control
- **AND** the chart comes after the currency control and before "Qué está haciendo"

#### Scenario: tiers without JavaScript

- **WHEN** the build writes GGAL's page
- **THEN** the distance from the 200-session average and the momentum are visible, outside any `<details>` element
- **AND** the swing dates and the full history are inside closed `<details>` elements

#### Scenario: a CEDEAR's identity

- **WHEN** the build writes LAC's page
- **THEN** it shows "LAC" and "CEDEAR · Subyacente: LAC · NYSE", then the currency control and the currency note in each view

#### Scenario: an unavailable line has no currency note

- **WHEN** a peso line is unavailable
- **THEN** its page shows no currency note, no currency control and no chart, since it shows no prices

### Requirement: a line page offers a currency view without JavaScript

An available line traded in pesos, as its Trading Line's currency in the Instrument Catalog says, SHALL offer three currency views: ARS, in pesos; USD, in MEP dollars, the analyzed unit; and CCL, in CCL dollars. The CCL view SHALL be offered only when the line's `cclEquivalents` is not `null`; otherwise the page offers ARS and USD. A line the Catalog does not list as ARS SHALL show only the analyzed prices, in MEP dollars, with no currency control.

The control SHALL be a group of radio inputs, one per offered view, labeled "ARS", "USD" and "CCL" in that order, with a "Moneda" legend, placed after the last close, at the start of the price section, on the chart's range control row. ARS SHALL be checked in the HTML, so the page as built and indexed reads in pesos.

The build SHALL render every view's variant of each phrase that names a price, a price's currency or a currency's return: the period returns, the support and resistance lines, the pattern line, the trend tipping points, the Structure Break Events, the raw evidence and the currency note. Each variant SHALL be marked with its view, and CSS alone SHALL show the variant of the checked view and hide the others, with `:has()` on the checked input. Without that support the ARS variants SHALL show and the USD and CCL variants SHALL stay hidden: the rule that hides them by default SHALL NOT share a selector list with a `:has()` selector, since a browser drops a whole rule over one selector it does not support. Without that support the control SHALL still show which view is checked, with the radio inputs themselves. The page SHALL ship no script for it, and SHALL NOT use a route, a query string or a fragment per view: one URL serves every view. Phrases without a price, such as the trend, the 200-session distance, the pending trend change, Regime Transitions, Volatile Sessions and the momentum, SHALL be rendered once.

The control's CSS SHALL be plain CSS inside the `currency-view` cascade layer: a segmented control of the three labels with the checked one marked, in the page's tokens. The chart SHALL follow the same radio inputs: the island reads the checked view and listens for changes, and the control has no second state of its own.

#### Scenario: GGAL offers three views

- **WHEN** the build writes GGAL's page and its `cclEquivalents` is not `null`
- **THEN** the page has radio inputs labeled ARS, USD and CCL, in that order, with ARS checked
- **AND** each phrase that names a price is rendered three times, once per view
- **AND** switching between them needs no script: the page's only script is the chart island's

#### Scenario: no CCL Rate on the line's session

- **WHEN** a peso line's `cclEquivalents` is `null`, because the run had no CCL Rate or none on the line's last session
- **THEN** its page has only the ARS and USD inputs, with ARS checked, and renders no CCL variant

#### Scenario: a line not traded in pesos

- **WHEN** a line's Trading Line currency is not ARS
- **THEN** its page has no currency inputs and shows its prices in MEP dollars only

#### Scenario: phrases without a price are rendered once

- **WHEN** the build writes GGAL's page
- **THEN** "Tendencia bajista." and its momentum sentence appear once each

#### Scenario: the chart follows the view

- **WHEN** a reader checks USD on GGAL's page with JavaScript
- **THEN** the text shows the USD variants and the chart draws GGAL's MEP-dollar candles and levels

#### Scenario: a browser without `:has()`

- **WHEN** a browser that does not support `:has()` opens GGAL's page
- **THEN** it shows only the ARS variants, and the ARS radio input shows as checked

### Requirement: a line page shows the last close and its day change

An available line's page SHALL show its last close from `latestClose`, in each currency view: the `peso` part in ARS, `mep` in USD and `ccl` in CCL, rendered as a price phrase of the currency-view requirements. It SHALL show the close as a price, with no label, followed, when the part's `change` is not `null`, by the change as a signed absolute figure in the view's currency and a signed percentage: "$ 5.940 (+$ 60, +1,0 %)". Its place under the line's name and data date says it is the last close and its change since the previous session, so the page names neither. A part whose change is `null` SHALL show the close alone, never a change of `0`. The page SHALL read every figure from the snapshot and SHALL NOT compute a change. The sign carries the direction, and the color repeats it: the day change is a gain or a loss by the sign printed on its percentage, as the color requirement says. The close itself takes no color.

A change SHALL be written with exactly the decimals its close is printed with, so the two read at one precision: a peso change whole on a close of a thousand pesos or more and with two decimals below; a dollar change with the decimals the close prints, two from one dollar up and, under one dollar, those of its three significant digits after trailing zeros are dropped: three on U$S 0,343, two on U$S 0,33, four on U$S 0,0237. A change SHALL be written as zero, without a sign, only when it rounds to zero at those decimals; otherwise it SHALL carry its sign. A change smaller than the close's last printed digit reads as zero even when its percentage does not round to zero, as it cannot be written at the close's precision: "U$S 1,18 (U$S 0,00, +0,3 %)".

The percentage SHALL carry the sign of a change that does not read as zero, even when the percentage rounds to zero: "$ 107.775 (−$ 50, −0,0 %)". Next to a change that reads as zero, the percentage SHALL keep its own sign, and none when it rounds to zero.

#### Scenario: GGAL's last close in each view

- **WHEN** GGAL's `latestClose` has a peso close of 5940 up 60 pesos (+1.02 %), a MEP close of 4 with a change of 0, and a CCL close of 3.8077 down 0.0105 (−0.27 %)
- **THEN** the ARS view shows "$ 5.940 (+$ 60, +1,0 %)"
- **AND** the USD view shows "U$S 4,00 (U$S 0,00, 0,0 %)"
- **AND** the CCL view shows "U$S 3,81 (−U$S 0,01, −0,3 %)", at the close's two decimals

#### Scenario: a small change on a close under one dollar

- **WHEN** VALO's `latestClose.mep` has a close of 0.3427 down 0.0023 (−0.67 %)
- **THEN** the USD view shows "U$S 0,343 (−U$S 0,002, −0,7 %)", not a change of "U$S 0,00"

#### Scenario: a close that drops a trailing zero

- **WHEN** BIOX's `latestClose.mep` has a close of 0.3303 down 0.00039 (−0.12 %)
- **THEN** the USD view shows "U$S 0,33 (U$S 0,00, −0,1 %)", at the two decimals the close prints

#### Scenario: a nonzero change on a percentage that rounds to zero

- **WHEN** PLTR's `latestClose.peso` has a close of 107775 down 50 (−0.046 %)
- **THEN** the ARS view shows "$ 107.775 (−$ 50, −0,0 %)"

#### Scenario: a change smaller than the close's last digit

- **WHEN** a line's `latestClose.mep` has a close of 1.1827 up 0.0041 (+0.34 %)
- **THEN** the USD view shows "U$S 1,18 (U$S 0,00, +0,3 %)"

#### Scenario: no rate on the previous session

- **WHEN** the line's `latestClose.mep` has a `null` change
- **THEN** the USD view shows "U$S 4,00" and no change
