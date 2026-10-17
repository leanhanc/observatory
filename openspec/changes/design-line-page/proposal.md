# Design the line page

## Why

The line page says the right things but has no design: browser-default HTML, no chart, and every measure as a bare sentence. Lean approved a minimalist-ui design with the Pastel scheme. Building it needs three things the product does not have yet:

- **A price chart.** Candlesticks need each line's daily bars in pesos, MEP dollars and CCL dollars, corrected for Corporate Actions and converted at each session's own rates. Only the analysis has them, and AGENTS.md keeps calculations out of the UI.
- **Figures the visuals draw.** The 200-session average ruler needs the average itself, and the "Qué observar" ruler needs how far each level is from the close. The snapshot has neither.
- **A first island.** The chart is the first client JavaScript, so the "no script" rule and the build's output guard must allow exactly that script and nothing else.

## What Changes

- **Chart Series (new).** For each available line, the run publishes about two years of corrected daily candles in pesos, MEP dollars and CCL dollars, ending on the latest State's session. Each session is converted at its own MEP or CCL Rate, and a session without that rate is missing from that currency's series. No other session's rate fills it. There is no volume.
- **Snapshot v13.**
    - Each available line carries its `chartSeries`.
    - The Instrument State gains `longTermEma`, the 200-session average, and the peso and CCL equivalents carry it too.
    - Each available line gains `watchDistances`: how far the close would have to move, in percent, to reach each watch level and tipping close.
    - Keys move to `analysis-snapshots/v13/`.
- **A static chart file per line.** The build writes `/lines/<id>/chart.json`, with the candles and the support and resistance prices of each offered currency view. The chart island fetches it, so the HTML stays small and indexable and carries no copy of the data.
- **The chart island.** A custom element, `<line-chart>`, uses lightweight-charts and a module script that Astro bundles. React stays render-only, and no other part of the page runs script. The output guard allows that one bundled module script on available line pages and nothing else.
- **The page design.** The approved tokens, fonts, layout and visuals:
    - the header with the close and its day change;
    - the ARS / USD / CCL segmented control, then the chart;
    - the trend chip and three return bars;
    - the 200-average, support/resistance and "Qué observar" rulers;
    - the RSI meter and the stretch bar;
    - "Últimos cambios" as a timeline.

    The wording stays as it is. The visuals support it.

- **Color rule.** Green and red mark gains and losses only: candles, period returns and the day change. Every other measure uses the foreground, accent or band colors.

## Capabilities

### New Capabilities

- `chart-series`: a line's corrected daily candles in each display currency, for drawing Candlesticks.

### Modified Capabilities

- `instrument-state`: `longTermEma`.
- `analysis-run`: v13 keys, the chart series, `longTermEma` in the equivalents, `watchDistances`, and their validation on read.
- `web-app`:
    - the chart file and the chart island;
    - the output guard's script rule;
    - the page order and tiers;
    - the styled currency control;
    - green and red on the day change and the period returns;
    - the visuals.

## Impact

- `src/analysis`:
    - a new `modules/chart-series`;
    - `instrument-state` (`longTermEma`);
    - `analysis-run` (fields, schema, keys);
    - `lib/config.ts` (`chartSeries.historyMonths`, version 9).
- `src/web`:
    - the components and the stylesheets;
    - a chart island under `src/web/islands`;
    - a `chart.json` endpoint per line;
    - the output guard;
    - the layout (fonts, tokens).
- Dependency: `lightweight-charts` 5.x. Fonts come from Astro's Fonts API with the Fontsource provider and are self-hosted in the build output. No runtime request goes to a third party.
- Deploy: a schema bump. After the push, the web build fails until a run writes v13, and the old site stays live meanwhile. Then trigger a manual run and check the "at commit" log line.
- Bucket: each dated snapshot grows by roughly 20 MB (the chart series).
