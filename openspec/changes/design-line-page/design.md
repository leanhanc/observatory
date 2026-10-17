# Design

## Settled

- **minimalist-ui with the Pastel scheme.** Dark is the bare `:root`, and light sits under `@media (prefers-color-scheme: light)`. The page follows the OS, with dark as the fallback. There is no theme toggle or scheme switcher.
- **Tokens.**

    | Token   | Dark                      | Light                   |
    | ------- | ------------------------- | ----------------------- |
    | bg      | #181716                   | #ffffff                 |
    | surface | #201f1d                   | #f7f6f3                 |
    | fg      | #ece9e3                   | #2f3437                 |
    | muted   | #9b968e                   | #787774                 |
    | line    | #302e2b                   | #eaeaea                 |
    | accent  | #d9b766                   | #956400                 |
    | up      | oklch(0.79 0.09 145)      | oklch(0.46 0.09 145)    |
    | down    | oklch(0.73 0.11 25)       | oklch(0.46 0.13 27)     |
    | band    | rgba(217, 183, 102, 0.13) | rgba(149, 100, 0, 0.12) |
    | track   | #2a2826                   | #efeeeb                 |

- **Fonts.** Newsreader for display, Geist for body, Geist Mono for figures.
- **CSS.**
    - Plain CSS, with `@layer` as the scoping mechanism. No Tailwind and no CSS modules.
    - Unlayered CSS beats every layer. The theme tokens and the `html`/`body` ground stay unlayered, and any third-party CSS is imported into a layer.
    - The no-JavaScript currency toggle (radios, `:has()` inside `@supports`) stays, restyled as the segmented control.
- **Color rule.** Gains are green and losses red, on candles, period returns and the day change. Every other measure uses fg, accent or band.
- **Layout.**
    1. Header: ticker, type, "Datos al cierre del …", and the close with its day change.
    2. The ARS / USD / CCL control, then the chart.
    3. "Qué está haciendo", with the 200-average ruler under its sentence.
    4. "Soporte y resistencia".
    5. "Qué observar".
    6. "Últimos cambios".
    7. "Detalle".

    On a phone, the chart runs full width with a 16px gutter.

- **Visuals.**
    - The trend is a neutral chip, and the period returns are three filled bars around zero.
    - The 200-average, support/resistance and "Qué observar" scales are rulers: a hairline track, a thin needle for the close, and a caret with a small gap. There are no round thumbs.
    - RSI is a 0–100 meter with 30 and 70 marked, and the stretch is a small accent bar around zero.
    - "Últimos cambios" is a vertical timeline. There are no doughnuts.
    - Every visual keeps its sentence.
- **Chart.**
    - Candles drawn with lightweight-charts, the only JavaScript on the page. Up candles are hollow and down candles filled.
    - Support and resistance are the only lines, at today's rate in each currency.
    - No volume, crosshair, tooltip, EMA lines or event markers.
    - Ranges 1m · 3m · 6m · 1a · Todo, opening on 1a. The mouse wheel does not zoom.
    - The chart follows the currency radios, and keeps the attribution the library's license requires.
- **Chart data comes from the analysis.** It is corrected for Corporate Actions, and each session is converted at its own rate. A session without a rate is missing from that currency's series.

## Chart Series

### What it is

A **Chart Series** is a display series. It holds one available line's corrected daily candles, in each currency, for drawing Candlesticks. No analysis reads it.

| Currency    | A session's candle                                     | A session is in the series when             |
| ----------- | ------------------------------------------------------ | ------------------------------------------- |
| Pesos       | the corrected peso bar's open, high, low and close     | the line has a corrected peso bar           |
| MEP dollars | the Dollarized Series bar: the peso bar ÷ its MEP Rate | it has a MEP Rate (a Dollarized Series bar) |
| CCL dollars | the corrected peso bar ÷ that session's CCL Rate       | it has a CCL Rate                           |

Each series covers the sessions from `historyMonths` calendar months before the latest State's session (24, in `ANALYSIS_CONFIGURATION.chartSeries`) through that session. The start date uses the period returns' month-end rule, so 2026-03-31 minus a month is 2026-02-28. The series end on the latest State's session, the session the page says it describes, even when the peso line has a later bar without a MEP Rate. A chart never shows a candle newer than "Datos al cierre del …".

The peso series keeps the sessions without a MEP Rate. A peso bar is a market fact and needs no rate. The MEP and CCL series skip those sessions. So the three series can differ in length, and the chart shows each one's own sessions. A missing session leaves no gap on lightweight-charts' business-day axis, which is also how the provider's own chart reads.

The prices are rounded to 6 significant digits when the snapshot is serialized. That is enough to draw and to label the axis in every currency, and it halves the file. No reader compares them with the State's figures.

### Where it lives

| Option                                      | For                                                                                                            | Against                                                                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. A field of each line in the snapshot** | One object, one write order, one validated read, so it is consistent by construction. The dry run is unchanged | The snapshot grows by about 20 MB, and so does every dated copy                                                                                                  |
| B. A companion object per run               | The snapshot stays small, and dated copies could drop old chart objects                                        | A second key and a second read. Write order: chart object, then the dated snapshot, then latest. The dry run needs a second file, and two documents can disagree |

**Recommendation: A.** Each available line carries `chartSeries: { peso, mep, ccl }`, and each candle is an object `{ sessionDate, open, high, low, close }`, the same shape in the module, the snapshot and `chart.json`. A tuple would be about 45% smaller, but TypeScript cannot tell its four prices apart, so a swapped high and low would type-check. The bucket grows by about 20 MB a day, roughly 7 GB a year. That is cheap, and a retention rule for dated snapshots can come later if it matters.

Size: about 500 sessions × 3 currencies × about 85 bytes is about 130 KB per line raw, and about 25 KB gzipped, since gzip removes most of the repeated keys (Caddy already encodes gzip and zstd).

### How the page gets it

| Option                                      | For                                                                                                                          | Against                                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fetch a static `/lines/<id>/chart.json`** | The HTML stays small and is the only thing a search engine reads. The page embeds no data copy, as the spec already requires | One more request, made after the island starts                                                                                               |
| Embed it in the page                        | No extra request                                                                                                             | About 130 KB of JSON in every line's HTML, which breaks "a page SHALL NOT embed a copy of its data". It also slows the first paint on phones |

**Recommendation: fetch.** An Astro static endpoint, `src/web/pages/lines/[tradingLineId]/chart.json.ts`, writes one file per available line from the snapshot. The file holds `{ currencyViews: { ars?, usd, ccl? } }`, and each entry is `{ candles, support, resistance }`, keyed by the page's currency view IDs, so the island maps a radio's value straight to a view.

A view the page does not offer has no entry. The levels use the same selection as the "Soporte y resistencia" text, `selectCurrencyLevels` in the line wording, so the chart and the text name the same levels. Support is the last confirmed low while the close is at or above it, and Resistance the last confirmed high while the close is at or below it; otherwise `null`. Their prices come from `pesoEquivalents`, the State or `cclEquivalents`, as the text's do. The web converts nothing.

The island fetches an absolute URL, `/lines/<id>/chart.json`. The page is served with and without a trailing slash, so a relative URL would resolve to two different paths.

## The island

The chart is a custom element, `<line-chart>`, defined by `src/web/islands/line-chart.ts`. Astro bundles it into one `<script type="module" src="/_astro/…">`.

**Loading.** The page's script is small. It defines the element and fetches `chart.json` right away, on page load, so the data is ready when the chart draws. Only the library loads lazily: when the chart box comes within about one screen of the viewport, an `IntersectionObserver` starts a dynamic `import()` of the chunk that holds lightweight-charts (about 50 KB gzipped). Vite splits that chunk out by itself; it is not a second `<script>` tag. The box reserves its height from the start, so nothing shifts when the chart appears. If either load fails, the box shows the same note as without JavaScript.

- React stays render-only (`renderReactStatically`). A React island would ship the React runtime, about 45 KB gzipped, for a component that has no React state. Base UI is not needed: the only interactive parts are radios.
- `components/line-chart.tsx` renders the element's static markup: the chart box, the range radios, the legend and the credit. `components/line-chart-script.astro` carries the `<script>`, and the route renders it only on an available line's page.
- The range radios show only once the element is defined: `line-chart:not(:defined) .chart-range { display: none }`. Without JavaScript, the box shows a short note instead (wording below), and the rest of the page reads fully.
- **Options.**
    - `handleScroll.mouseWheel: false` and `handleScale.mouseWheel: false`.
    - `handleScroll.vertTouchDrag: false`, so a vertical swipe scrolls the page on a phone.
    - Pinch and axis drag stay on.
    - The crosshair is hidden, with no labels.
    - `layout.attributionLogo: false`, with the credit line under the chart in its place. The license (Apache 2.0) asks for the NOTICE's attribution notice and a link to https://www.tradingview.com/ on the page; nothing in the code enforces it, and the library meets it by default with its logo. The credit line meets it instead: "Gráfico: TradingView Lightweight Charts™, © 2025 TradingView, Inc.", linked to https://www.tradingview.com/, at 12px.
- **Look.**
    - No vertical grid and a hairline horizontal grid in `--line`.
    - No scale borders, and axis labels in Geist Mono.
    - Up candles hollow (body `--bg`, border and wick `--up`), down candles filled `--down`.
    - Support and resistance as dashed price lines in `--accent`, titled "Soporte" and "Resistencia". The axis label shows the view's price.
- **Colors.** lightweight-charts takes colors, not CSS variables, so the island resolves each token from the computed style through a 1×1 canvas, which turns `oklch()` into `rgb()`. It does this again when `prefers-color-scheme` changes.
- **Currency.** It listens for `change` on the page's currency radios, sets that view's candles and level lines, and keeps the selected range.
- **Range.** 1a, 6m, 3m and 1m set the visible range from the last candle back that many calendar months. Todo fits all the content. This is view state, not a measure.

### The output guard

The `<script` ban becomes a rule:

- An available line page has exactly one `<script type="module" src="/_astro/<name>.js"></script>`.
- An unavailable line page, the home page and 404 have none.
- No page has an inline script or a `modulepreload` link to anything else.

Every other marker stays: the storage variable names and the bucket host, now checked in the `chart.json` files too.

## Data the visuals need

| Visual                        | Needs                                                                     | In the v12 snapshot?                                                                |
| ----------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Day change color              | the change's printed sign                                                 | yes (`latestClose`)                                                                 |
| Return bars                   | the three percent changes per currency                                    | yes                                                                                 |
| 200-average ruler             | the close, the average, both band edges, the distance in %                | the average is **missing**; the edges are the tipping closes; the distance is there |
| Support/resistance ruler      | the close, both swings, their positions                                   | yes                                                                                 |
| "Qué observar" ruler and list | the break level, the tipping close(s), and how far each is from the close | the distances are **missing**                                                       |
| RSI meter                     | RSI                                                                       | yes                                                                                 |
| Stretch bar                   | price relative to EMA20 in ATR                                            | yes                                                                                 |
| Chart                         | candles in three currencies, the levels                                   | the candles are **missing**                                                         |

What the analysis adds:

- **`latestState.longTermEma`**: EMA(200) of the Dollarized Series' closes, under the EMA warm-up rule, or `null`. `pesoEquivalents.longTermEma` and `cclEquivalents.longTermEma` convert it at the latest session's rate, like the other levels. The midpoint of the two tipping closes happens to equal it, since they are EMA200 ± 0.5 ATR. Reading the average off that midpoint would make the web rebuild a domain value from a coincidence of today's band.
- **`watchDistances`**, per available line: `{ lastConfirmedSwingHigh, lastConfirmedSwingLow, bullishCloseAbove, bearishCloseBelow }`. Each is `(level − close) / close × 100`, the move from the close that reaches the level, or `null` when the level is. Every currency converts the close and its levels at one session's rate, so the figure is the same in all three. (design.md, Answered 1).

The web computes **positions only**: where a value sits on a ruler or bar, by linear interpolation between published values in one currency, or on a fixed display scale (RSI 0–100, stretch ±3 ATR, clamped). It never prints a figure it computed. Every printed number is a snapshot field, formatted. A positions module in `src/web/lib/utils/visual-scale` holds the interpolation and the clamping, and its tests pin that it only maps values.

## The visuals, with the technical-analysis idea behind each

**200-session average ruler.** The 200-session exponential average is the line's slow "fair level". The Regime rule ignores closes within half a typical daily move (0.5 ATR) of it, the noise band, so a close needs to clear the band before the price half of the rule counts. The ruler draws the average as a tick and the band as a shaded strip, with the close's needle. The tipping point that matters for the current trend is a stronger tick in accent, so the reader sees how far the close is from the band edge that would change the reading. A close inside the strip is noise to this rule, not a signal.

**RSI meter.** RSI(14) compares the size of recent gains with recent losses, on a 0–100 scale. 50 means they balanced. Readings beyond 70 or below 30 are the conventional "stretched" zones, where moves have been one-sided. The meter shades those zones in band and draws the reading as a needle. The zones are a convention, not a prediction: a line can stay above 70 for weeks in a strong rise. The 30 and 70 marks are display constants in the web; the analysis uses no RSI threshold.

**Support/resistance ruler.** Support is the last confirmed swing low the close is still above, and Resistance the last confirmed high it is still below. The ruler places the close between them, so the reader sees which level is nearer, without a "%" that suggests a target. With only one level, the ruler shows that level and the close. With neither, it is not drawn, and the sentence says why.

**"Qué observar" ruler.** It starts at the close and marks, in the direction of each change, the pattern's break level (a thin tick) and the trend tipping point (an accent tick), each labeled with its distance in percent. It shows that the pattern can break long before the trend changes, which is the sentence's own point: "Por sí solo, no cambia la tendencia."

**Stretch bar.** Price relative to the 20-session average in ATR units: how many typical daily moves the close sits from its short-term average. It is drawn from zero in accent, because a stretch is neither a gain nor a loss.

## File structure

Each folder under `src/web` has one job:

- **A route** in `pages/` answers which page it is and from which data. It reads the snapshot, picks the view and wraps it in the layout.
- **The layout** in `layouts/` is the HTML shell: fonts, tokens and `<body>`.
- **A view** in `views/` answers what is on the page and in what order. A section belongs to one view, so it lives in that view's folder.
- **A component** in `components/` is an atom or a molecule. It draws something and knows no page.

```text
src/web/
├── pages/
│   ├── index.astro
│   ├── 404.astro
│   └── lines/[tradingLineId]/
│       ├── index.astro             (was lines/[tradingLineId].astro)
│       └── chart.json.ts           static endpoint, one file per available line
├── layouts/
│   └── page-layout.astro           <Font />, tokens and base on every page
├── views/
│   ├── home-view.tsx               (was components/home-page.tsx)
│   └── line-view/
│       ├── line-view.tsx           available or unavailable, then the sections in order (replaces line-page.tsx and available-line-details.tsx)
│       ├── line-view.test.tsx      page order and tiers
│       ├── line-header.tsx         ticker, type and Underlying, data date, close and day change
│       ├── price-section.tsx       currency control, currency note, chart markup
│       ├── trend-section.tsx       "Qué está haciendo"
│       ├── levels-section.tsx      "Soporte y resistencia"
│       ├── watch-section.tsx       "Qué observar"
│       ├── recent-changes.tsx      "Últimos cambios"
│       ├── detail-section.tsx      "Detalle"
│       ├── unavailable-notice.tsx  (was components/unavailable-line-details.tsx)
│       └── *.test.tsx              one per section, the wording inside it
├── components/
│   ├── ruler.tsx                   the 200-average, support/resistance and "Qué observar" rulers
│   ├── meter.tsx                   RSI and the stretch bar
│   ├── return-bars.tsx
│   ├── trend-chip.tsx
│   ├── timeline.tsx                (was event-list.tsx)
│   ├── line-chart.tsx              the island's static markup: box, range radios, legend, credit, note
│   ├── line-chart-script.astro     the island's only <script>
│   ├── currency-control.tsx
│   ├── currency-variants.tsx
│   ├── phrase-text.tsx
│   └── *.test.tsx
├── islands/
│   ├── line-chart.ts               defines <line-chart>: fetch on load, observer, lazy import
│   ├── line-chart-drawing.ts       the lazily imported chunk, the only importer of lightweight-charts
│   └── line-chart.test.ts          options and color mapping
├── lib/utils/
│   ├── visual-scale/               positions only: interpolation and clamping
│   ├── line-chart-data/            each currency view's candles and levels for chart.json
│   └── line-wording/               gains the gain/loss direction
├── integrations/
│   └── published-output-guard.ts   one bundled module script on available line pages
└── styles/
    ├── tokens.css                  unlayered
    ├── base.css
    ├── line-page.css
    ├── line-chart.css
    ├── currency-view.css
    ├── color-rule.test.ts          --up and --down only under [data-direction]
    └── currency-view.test.ts
```

The view stays React, so the page-order tests render `line-view.tsx` with `renderToStaticMarkup`, as `line-page.test.tsx` does today.

## Page structure

- **Header.**
    - Ticker (Newsreader) and type.
    - For a CEDEAR, "Subyacente: <ticker> · <market>" on the type line (Answered 3).
    - "Datos al cierre del …".
    - The close with its day change. The day change is green or red by the sign printed on its percentage (Answered 2), and the close stays fg.
    - "Ver todas" stays as a small muted link above the header.
- **Currency.** The segmented control, then the currency note, always visible under the control. The note keeps its wording.
- **Chart.** Then the legend: "Rueda que cerró arriba de su apertura", "Rueda que cerró abajo", "Soporte y resistencia". Then the credit: "Gráfico: TradingView Lightweight Charts™, © 2025 TradingView, Inc.", linked to https://www.tradingview.com/, at 12px. The legend strings, the no-JavaScript note and the chart's `aria-label` are new wording for Lean to approve (design.md, Answered).
- **Tiers.** Tier 2 (the 200-average distance, momentum) becomes headed blocks: this change drops its open `<details>` and keeps tier 3 closed: "Más detalle", the volatile sessions and "Ver historial". Without JavaScript nothing collapses anyway.
- **"Últimos cambios."** It keeps its content rules (the month of the one-month return, Volatile Sessions under a count, the history by year) as a timeline. Each item has a kind mark: a square for the trend, a diamond for the pattern, a circle for a volatile session. It is rendered at build time.
- **Home and 404.** They get the tokens, fonts and ground, and nothing else in this change.

## CSS layout

- `src/web/styles/tokens.css` is unlayered: the tokens, `color-scheme`, and the `html`/`body` ground. It declares the layer order: `@layer reset, base, components, currency-view, utilities;`.
- `base.css` (reset, base), `line-page.css` (components) and `line-chart.css` are layered.
- `currency-view.css` keeps its layer, its fallback structure and its tests. The control's look moves from `CanvasText`/`Canvas` to the tokens.
- **Color rule in CSS.** `var(--up)` and `var(--down)` appear only in rules for `[data-direction='gain']` and `[data-direction='loss']`. The wording marks only the day change and the period returns with `data-direction`. The island's color mapping puts `--up` and `--down` only on candles. A stylesheet test and a component test pin this.

## Fonts

**Astro's Fonts API** (stable in Astro 7) with the Fontsource provider.

- The build downloads the files and serves them from the output, and `<Font />` emits the `@font-face` rules and preloads.
- No runtime request goes to Google, and nothing third-party is unlayered.
- The weights are Newsreader 400–500, Geist 400–600 and Geist Mono 400–500, Latin subset.
- The build needs network access to Fontsource, which Railway builds have.

## Deploy order

The snapshot schema moves from 12 to 13. The order:

1. Push. The web build reads `analysis-snapshots/v13/latest.json`, which does not exist yet, so it fails. The previous deployment keeps serving.
2. Trigger a manual Analysis Run at the pushed commit. It writes v13 and requests the web redeploy pinned to its commit.
3. Check the run's "at commit" log line. It should name the pushed commit.

This change makes no bucket writes, Railway changes or deploys. Lean triggers step 2.

## Answered

1. **"Qué observar" distances.** The analysis publishes `watchDistances`, and "Qué observar" shows the move from the close, "+4,8 %", on its ruler and list. "Soporte y resistencia" keeps its own figure, the close relative to the level ("el cierre está 4,6 % por debajo"). The two describe the same level from different ends, each in its own sentence.
2. **Green and red follow the sign printed on the percentage**, the sign the reader sees, on the day change and the period returns.
    - "$ 107.775 (−$ 50, −0,0 %)" is red.
    - "U$S 1,18 (U$S 0,00, +0,3 %)" is green.
    - "U$S 4,00 (U$S 0,00, 0,0 %)" has no color.
3. **A CEDEAR's Underlying goes on the type line**, "CEDEAR · Subyacente: LAC · NYSE", and the "Sobre esta especie" disclosure goes away. A company name ("Grupo Financiero Galicia") is not in the Instrument Catalog, so the header has none.
4. **The chart's levels come from `chart.json`**, next to the candles, chosen with the text's selection. The island fetches `chart.json` on page load, and only the charting library loads lazily.

5. **Wording.**

    | Where                                  | Text                                                                                                                                                            |
    | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | Chart legend                           | "Rueda que cerró arriba de su apertura" · "Rueda que cerró abajo" · "Soporte y resistencia"                                                                     |
    | Price lines on the chart               | "Soporte" · "Resistencia"                                                                                                                                       |
    | Chart `aria-label`                     | "Gráfico de velas diarias de <ticker> con el soporte y la resistencia"                                                                                          |
    | Without JavaScript, or if a load fails | "El gráfico no está disponible."                                                                                                                                |
    | Credit, 12px                           | "Gráfico: TradingView Lightweight Charts™, © 2025 TradingView, Inc.", linked to https://www.tradingview.com/                                                    |
    | 200-average ruler                      | "cierre" · "media 200" · the tipping point named as its sentence does: "deja de ser bajista", "deja de ser alcista", "pasa a ser alcista", "pasa a ser bajista" |
    | Under the 200-average ruler            | "La franja sombreada es medio movimiento diario típico (0,5 ATR) a cada lado de la media. Mientras el cierre quede adentro la tendencia no cambia por ruido."   |
    | Support/resistance ruler               | "cierre" · "soporte" · "resistencia"                                                                                                                            |
    | "Qué observar" ruler                   | "cierre" · "patrón" · "tendencia"                                                                                                                               |
    | Return bars heading                    | "Cuánto se movió"                                                                                                                                               |

6. **Chart history** is 24 months, so "Todo" shows about two years.

## Open questions

1. **Strings added during implementation**, beyond the approved wording:
    - the return bars' row labels: "1 mes", "3 meses", "1 año";
    - the range control's hidden legend, read by screen readers: "Período del gráfico";
    - the stretch card's heading, "Estiramiento de corto plazo", and its scale tag, "media 20".

    The RSI card keeps the existing "Momentum" heading. The timeline drops the kind legend ("Tendencia · Patrón · Rueda volátil"), since each Event's sentence already names its kind.
