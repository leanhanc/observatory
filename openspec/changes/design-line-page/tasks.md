## 1. Plan

- [x] Proposal, design, tasks and spec deltas; `openspec validate design-line-page --strict`.
- [x] Lean answers the design questions (design.md, Answered).
- [x] Lean approves the new wording and the chart history (design.md, Answered).
- [x] Wait for `main` clean with the currency fix landed, then create `feature/line-design` from `main`.

## 2. Analysis

- [x] `instrument-state`: `longTermEma`, with tests for warm-up `null`, a readable value equal to EMA(200), and causality.
- [x] `chart-series` module: `buildChartSeries`, with tests for:
    - a window of 24 calendar months and the month-end rule;
    - ending on the latest State's session when a later peso bar has no MEP Rate;
    - a session without a MEP Rate kept in pesos and missing in MEP and CCL dollars;
    - a session without a CCL Rate missing only in CCL dollars, never filled from a neighbor;
    - a Corporate Action corrected in all three series;
    - every candle at its own session's rates.
- [x] `ANALYSIS_CONFIGURATION.chartSeries.historyMonths` = 24, and version 9.
- [x] Analysis Run: `chartSeries`, `watchDistances`, `longTermEma` in both equivalents; serialization rounds candles to 6 significant digits.
- [x] Snapshot v13: the keys, the schema and the read checks (chart series ordered, ending on the State's session, CCL ending there exactly when `cclEquivalents` exists; `longTermEma` present exactly when the State has it; watch distances `null` exactly when their level is), with failing-read tests for each.
- [x] `CONTEXT.md`: **Chart Series**.

## 3. Web

- [x] Tokens, base and layer order; fonts through Astro's Fonts API (Fontsource); the layout loads them on every page.
- [x] `visual-scale` positions, with tests that it maps published values only and clamps the fixed scales.
- [x] Wording: direction (`gain` / `loss` / none) of the day change and of each period return from the printed sign; tests for "−0,0 %", "U$S 0,00, +0,3 %" and "0,0 %".
- [x] Restructure `src/web` as the design's file structure: routes in `pages/`, `views/home-view.tsx` and `views/line-view/` with one file per section, atoms and molecules in `components/`; move the page tests to `line-view.test.tsx` and the section tests.
- [x] Components: segmented control, chart markup, trend chip, return bars, ruler, meter, timeline. Sections: header, price, trend, levels, watch, recent changes, detail; tier 2 headed blocks, tier 3 closed `<details>`.
- [x] `chart.json` endpoint and its levels, with tests: entries match the offered currencies, support and resistance are the levels the text names, no CCL entry without `cclEquivalents`, a non-peso line has only `usd`.
- [x] `<line-chart>` island with lightweight-charts: fetch on load, lazy library (observer, dynamic import), reserved height, failure note, options, colors from tokens, currency radios, range radios, theme change.
- [x] Output guard: exactly one bundled module script on available line pages, none elsewhere, no inline script; tests.
- [x] Color-rule tests: `--up` / `--down` only under `[data-direction]` rules and on candles.
- [x] Currency-view tests still pass; the no-JavaScript text toggle still works.

## 4. Verification

- [x] `bun test`, `bun run typecheck`, `bun run lint`, `oxfmt --check`, `openspec validate --all --strict`.
- [x] Build against a local v13 snapshot from a dry run (`--output`), with no bucket writes. The build reads a local file through `OBSERVATORY_SNAPSHOT_FILE` (Lean chose an env var).
- [x] Browser pane: GGAL, a CEDEAR, a line without CCL, an unavailable line; dark and light; phone width; without JavaScript.
- [x] Opus adversarial review; fixes in this session.
- [ ] Lean reviews the diff.
- [ ] Archive.
