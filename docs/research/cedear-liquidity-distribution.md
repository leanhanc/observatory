# CEDEAR liquidity distribution

Measured on Sunday 2026-10-04 from Open BYMADATA daily 24HS history through session 2026-10-02.
This note describes how regularly and how heavily BYMA CEDEAR peso lines trade, using the 21
leading-panel stocks as the reference. It is meant to inform a liquidity eligibility rule; it does
not choose thresholds. Only the liquidity distribution was looked at. No indicators, States, Events,
or outcomes were computed. Only BYMA lines were used ([ADR 0006](../adr/0006-separate-research-lab-from-product.md)).

It builds on [BYMA instrument universe](./byma-instrument-universe.md) and
[Open BYMADATA provider observations](./open-bymadata-provider.md).

## Method

### Universe

- **CEDEARs:** the ARS, settlement `2` (24HS) rows of the `cedears` panel, requested with
  `excludeZeroPxAndQty: false`. That gave 687 rows. The 164 `B` variants were dropped: a symbol
  ending in `B` whose base, with trailing dots trimmed, is also an ARS row (`AAPLB`, `C...B`).
  523 symbols remain, which matches the universe note. The 20 `…B` symbols without such a base were
  kept (`ABNB`, `BRKB`, `ITUB`, `SLB`, `KB`, …).
- **Leading stocks:** the 21 ARS rows of `leading-equity`.
- **MEP source:** AL30 and AL30D.

### Requests

- One history request per symbol (548 symbols), sequential, at least 2.1 s apart, with
  `from` = 2000-01-01 and `to` = 2026-10-03. Two panel requests came first.
- Raw responses were cached outside the repository.
- One request failed: `EBR` timed out once and succeeded on its automatic retry. No symbol ended
  without a response.
- The provider returned 485 sessions for AL30, from 2024-10-04 to 2026-10-02. That is the
  "provider window" below, roughly two years.

### Measures

Bars went through the repository's own `createOpenBymadataAdapter`, fed from the cache, so
Continuity Data rows (zero volume, retained close, missing open/high/low) are dropped exactly as in
production. A session without trading is therefore a missing bar, and participation counts
against market sessions, not against returned bars.

- **Market sessions:** the sessions with a MEP rate from `calculateMepRates(AL30, AL30D)`. There
  were 485, the same set as the union of AL30 and AL30D bars.
- **Traded session:** a market session on which the line has a bar with `volume > 0`.
- **Participation:** traded sessions ÷ market sessions in the window.
- **Participation since listing:** traded sessions ÷ market sessions from the line's first bar to the
  end of the window. Both versions are recorded.
- **Median daily traded value (USD MEP):** the median, over traded sessions, of
  `volume × close`, using bars from `dollarizeBarHistory`. Equivalently, it is the peso traded
  value ÷ that session's MEP rate.
- **Windows:**
    - **2y:** all 485 market sessions.
    - **6m:** the last 125, which is 2026-04-06 to 2026-10-02.

A line with no traded session in a window has participation 0 and no median; it is counted as 0 in
value quantiles.

## Data checks

- **Volume unit:** shares or CEDEARs, not nominal value or pesos.
    - GGAL: median volume 2.59 M shares × median close USD 5.04 gives USD 13.5 M a day.
    - SPY: 100 k CEDEARs × USD 11.10 gives USD 1.1 M.
    - The sum of the per-line medians, about USD 35 M for leaders and 65 M for CEDEARs, is a
      plausible order of magnitude for BYMA equity turnover.
    - Bond volume is nominal, but bonds only feed the rate here, and the rate uses closes only.
- **AL30 on 2025-10-13:** AL30 and AL30D both have `open = 0` with large volume and normal
  high, low, and close. The adapter keeps the bars, because the volume is not zero, and
  `calculateMepRates` reads only closes, so the session has a normal rate. 355 lines traded that
  day, compared with 359 the next day, so it was a full session. No stock or CEDEAR bar had a zero
  open that day. The defect affects only the bonds' opens. It would fail range validation if those
  bars were ever analyzed as price series.
- **Off-calendar bars:** 10 bars on 4 lines (BYMA 3, ORLY 3, ECOG 2, XLP 2) fall on 2024-11-12,
  2025-06-11, and 2025-07-10. AL30, AL30D, and GGAL have no bar on those dates. They have no MEP
  rate, so they are excluded. Inference: these were partial or anomalous sessions, not missing bond
  data.
- **Zero-volume bars the adapter keeps:** 74 bars on 35 lines have `volume = 0` with non-zero
  open, high, and low (ARM 11, IWDA 11, SWKS 6, TJX 5, …). They count as not traded.
- **Empty histories:**
    - 95 of the 523 CEDEAR symbols returned `no_data` for the whole window. Examples are YHOO, TWTR,
      TWX, UTX, RDS, SNE, and the `D…` series (DJNJ2, DABT1, DWMT1). These are legacy symbols still
      listed on the panel.
    - One leader, **GFVA**, also returned `no_data`. It is on today's leading panel but has no 24HS
      history under that symbol. This is unexplained; see open questions.
- **Ratio changes:** only 12 day-over-day close jumps beyond ×1.8 or ×0.55 appear across all 544
  lines, so ratio changes look back-adjusted in prices. Whether volume is adjusted too is unknown.
  Some jumps look like data or corporate actions, not trading:
    - ORLY has a `close = 0` bar on 2025-06-05;
    - TEFO has a near-zero close on 2026-01-20;
    - CRWD fell ×0.25 on 2026-07-02 with unchanged volume.
- **Dividend adjustment:** prices are the provider's adjusted prices
  ([ADR 0007](../adr/0007-follow-provider-adjusted-prices.md)), so older traded values are slightly understated. This is negligible
  compared with the spreads below.

## Distributions

### Quantiles (all lines, including empty histories)

| Group, window | Measure                     |   p10 |   p25 |    p50 |    p75 |    p90 |
| ------------- | --------------------------- | ----: | ----: | -----: | -----: | -----: |
| Leaders, 2y   | participation               | 99.8% | 99.8% | 100.0% | 100.0% | 100.0% |
| Leaders, 2y   | median value, USD           |  306k |  564k |   880k |  1.51M |  2.62M |
| Leaders, 6m   | participation               |  100% |  100% |   100% |   100% |   100% |
| Leaders, 6m   | median value, USD           |  240k |  341k |   638k |  1.22M |  2.07M |
| CEDEARs, 2y   | participation               |    0% | 12.1% |  91.3% | 100.0% | 100.0% |
| CEDEARs, 2y   | participation since listing |    0% | 77.7% |  99.8% | 100.0% | 100.0% |
| CEDEARs, 2y   | median value, USD           |     0 |   676 |  10.5k |  64.0k |   270k |
| CEDEARs, 6m   | participation               |    0% | 18.4% | 100.0% | 100.0% | 100.0% |
| CEDEARs, 6m   | participation since listing |    0% | 78.9% | 100.0% | 100.0% | 100.0% |
| CEDEARs, 6m   | median value, USD           |     0 |   580 |  12.3k |  97.1k |   391k |

GFVA counts as 0 in the leader rows above. Without it, the lowest leader is ECOG at USD 215k (2y)
and ALUA at USD 240k (6m).

### CEDEARs ranked by median traded value

| Rank | 2y line | 2y value | 2y participation (since listing) | 6m line | 6m value | 6m participation |
| ---: | ------- | -------: | -------------------------------: | ------- | -------: | ---------------: |
|   10 | NU      |    1.49M |                      100% (100%) | GOOGL   |    2.40M |             100% |
|   25 | ASTS    |     704k |                     45.6% (100%) | NBIS    |    1.14M |            77.6% |
|   50 | ASML    |     292k |                     70.1% (100%) | JPM     |     423k |             100% |
|  100 | AAL     |     110k |                      100% (100%) | XLU     |     157k |             100% |
|  150 | CSCO    |    48.3k |                     38.4% (100%) | HL      |    69.8k |             100% |
|  200 | ITA     |    22.9k |                     51.3% (100%) | IBB     |    30.8k |             100% |
|  250 | AMGN    |    12.2k |                      100% (100%) | TRIP    |    15.0k |             100% |
|  300 | SDA     |     4.7k |                    99.8% (99.8%) | MGLU3   |     6.0k |             100% |

The 2y top 10 is VIST, SNDK, MELI, TSLA, SPCX, NVDA, MSTR, IBIT, EWZ, and NU. Three of these, SNDK
and SPCX listed in May–June 2026 and IBIT in December 2024, have medians from a shorter history.

`log10(median USD)` at every 25th rank of the CEDEARs that have bars:

```text
6.62 5.84 5.47 5.16 5.04 4.86 4.67 4.50 4.36 4.24 4.08 3.92 3.67 3.52 3.29 3.03 2.64
```

### Participation histograms, CEDEARs

| Bin    | 2y raw | 2y since listing¹ | 6m raw | 6m since listing¹ |
| ------ | -----: | ----------------: | -----: | ----------------: |
| < 10%  |    131 |                15 |    119 |                24 |
| 10–30% |     23 |                 4 |     22 |                 2 |
| 30–50% |     30 |                 5 |      1 |                 1 |
| 50–70% |     29 |                10 |      6 |                 6 |
| 70–80% |     16 |                 7 |     18 |                 5 |
| 80–90% |     27 |                 8 |      9 |                 9 |
| 90–95% |     21 |                17 |     13 |                10 |
| 95–98% |     24 |                27 |     15 |                15 |
| ≥ 98%  |    222 |               336 |    320 |               357 |

¹ Only the 429 lines that have at least one bar in the provider window.

### Participation since listing × median value, CEDEARs, 2y (429 lines with bars)

| Participation since listing | < 1k | 1–10k | 10–50k | 50–100k | ≥ 100k |
| --------------------------- | ---: | ----: | -----: | ------: | -----: |
| < 50%                       |   16 |     1 |      4 |       0 |      3 |
| 50–90%                      |   18 |     7 |      0 |       0 |      0 |
| 90–98%                      |   12 |    30 |      2 |       0 |      0 |
| ≥ 98%                       |    3 |    78 |    110 |      40 |    105 |

The 6m table has the same shape: 128 lines at ≥ 98% and ≥ 100k, and one line at ≥ 100k below 50%.

## Candidate rules

The table counts CEDEARs passing out of 523. "Raw" counts participation over the whole window, and
"since listing" counts it from the first bar. The leader count is out of 21, so GFVA always fails.

| Window | Participation ≥ | ≥ USD 10k raw / since listing | ≥ USD 50k raw / since listing | ≥ USD 100k raw / since listing | Leaders, raw |
| ------ | --------------: | ----------------------------: | ----------------------------: | -----------------------------: | -----------: |
| 2y     |             80% |                     188 / 257 |                     104 / 145 |                       79 / 105 |        20/21 |
| 2y     |             90% |                     176 / 257 |                     101 / 145 |                       77 / 105 |        19/21 |
| 2y     |             95% |                     171 / 257 |                      96 / 145 |                       72 / 105 |        19/21 |
| 2y     |             98% |                     169 / 255 |                      96 / 145 |                       72 / 105 |        19/21 |
| 6m     |             80% |                     248 / 268 |                     152 / 166 |                      118 / 128 |        20/21 |
| 6m     |             90% |                     248 / 268 |                     152 / 166 |                      118 / 128 |        20/21 |
| 6m     |             95% |                     243 / 267 |                     150 / 166 |                      117 / 128 |        20/21 |
| 6m     |             98% |                     243 / 267 |                     150 / 166 |                      117 / 128 |        20/21 |

For reference, a floor at the lowest leader's level, USD 200k, passes 45–48 CEDEARs (2y raw, 61
since listing) and 81 (6m raw, 86 since listing).

**Lowest leader against each candidate.** Every leader with data has a median of at least USD
215k (2y) and 240k (6m), so every value floor up to 100k passes them all. The only leader failures
are on participation:

- **ECOG**, first bar 2025-01-21: 85.4% raw over 2y, which fails 90–98%; 100% since listing and
  100% in 6m.
- **GFVA**: no history.

Lines with 99.8% raw participation (BBAR, BYMA, CEPU, TXAR) miss exactly one session and pass
every candidate.

### Boundary examples (2y, since-listing participation ≥ 95%)

- **≈ USD 10k:** DOCU 10.5k (6m 12.3k), DEO 10.5k (6m 7.3k), SONY 9.9k (6m 20.1k), BMY 10.1k
  (listed 2026-01; raw 38%), FISV 9.8k (listed 2026-05; raw 20%).
- **≈ USD 50k:** EBAY 50.6k (6m 113k), LMT 51.5k, TXR 51.8k (6m 44.1k), MRK 47.2k (6m 38.1k),
  BA.C 53.1k, CSCO 48.3k (listed 2026-01).
- **≈ USD 100k:** CVX 100k (6m 179k), BIDU 102k (6m 63.1k), IBM 96.7k (6m 718k), KLAC 100k
  (listed 2026-09-02, 23 sessions), GDX 100k (listed 2025-07).
- **2y raw participation 85–95% on a full-window line:** ASR 94.2%, DD 94.0%, GRMN 94.8%, MUFG
  94.4%, ING 92.0%, IFF 91.1%, EA 91.1% (stopped 2026-08-03), IP 88.9%. Most of these sit at
  USD 1–10k.

## Stability between windows

- The top 100 overlaps by 83 lines.
    - **Only in the 2y top 100:** GOLD, PAGS, FXI, SH, IWM, JD, UPST, DELL, EWY, GEV, BIOX, WDC,
      PFE, MP, SPXL, PYPL, AAL.
    - **Only in the 6m top 100:** HUT, IBM, SMH, NFLX, MRVL, NOW, VST, ADGO, CAT, USO, RBLX, AMAT,
      STNE, CVX, ARM, MA, XLU.
- The top 25 overlaps by 21 lines, the top 50 by 38, and the top 200 by 182.
- Spearman rank correlation of 2y and 6m median value across all 523 is 0.95. This is
  approximate, with ties broken by order.
- 6m medians are generally higher than 2y medians in the CEDEAR tail: p75 is 97k against 64k, and
  p90 is 391k against 270k. Leader medians are lower in 6m than in 2y. The windows describe
  different market periods, not only different lengths.

## Pitfalls observed

- **Recent listings dominate raw 2y participation.** 144 CEDEARs have their first bar more than 10
  sessions after the window start, in waves on:
    - 2024-12-05, 2025-01-14 (ETFs);
    - 2025-02-07 (Brazilian shares);
    - 2025-05-15, 2025-11-07, 2026-01-22, 2026-05-15;
    - 2026-09-02 (13 lines).

    Most trade on 100% of sessions since listing. The whole 30–90% band of the raw 2y histogram is
    mostly listing date, not irregular trading. Raw participation therefore conflates "new" with
    "illiquid".

- **Since-listing participation lets very young lines through.** BBAX, CORN, SOYB, and GSG have 13
  sessions, KLAC and GEV have 23, and all show 100%. Whether a line has enough history is a
  separate question from whether it trades regularly. The indicators' warm-up already demands
  history, and that rule is not settled here.
- **Stale lines.** BRFS, DESP, WBA, X, GOGLB, GOLD, SCHW, EBR, ELP, MMC, TEFO, and others stopped
  trading before September 2026. Since-listing participation over 2y still counts their dead tail,
  so most fail it. They can still have a high median: GOGLB 578k over 21 sessions, GOLD 612k over 1
  session. A 6m window, or any participation rule, removes them.
- **Single-session medians.** GOLD, SCHW, and YZCA each traded on exactly one session in 2y. Their
  "median" is that day's value, so a value floor without a participation floor would admit them.
- **Block trades.** Mean ÷ median over traded sessions has quantiles 1.32 / 1.54 / 2.04 / 3.41 /
  6.62 (p10–p90) across CEDEARs, so means are unreliable and the median matters.
    - **Extreme cases, largest day ÷ median:**
        - SNA: 2,667×, with one day carrying 70% of 2y value;
        - DJNJ3: 5,733×;
        - ELP: 1,766×;
        - NMR: 1,714×;
        - TRVV: 1,015×, with one day carrying 46%;
        - MRNA: 591×, one USD 37 M day.
    - The median is not moved by any of these.

## Reading (inference)

- **Participation is bimodal once listing date is removed.**
    - Of the 429 CEDEARs with bars, 336 trade on ≥ 98% of sessions since listing. The rest spread
      thinly from 0% to 98%, with no cluster around 50%.
    - The lines below 50% are legacy, stale, or one-off symbols, not a population of irregular
      traders.
    - In 6m, the gap is clearer still: 357 at ≥ 98%, and only 8 between 30% and 70%.
- **Above about USD 10k, participation adds almost nothing.**
    - In 2y, only 2 lines with a median of at least USD 10k sit between 90% and 98% since listing:
      ARM 96.5% and UL 97.7%.
    - Only 7 sit below 50%, all stale or single-session lines: BRFS, DESP, GOGLB, GOLD, SCHW, WBA, X.
    - Any participation threshold from 80% to 98% gives nearly the same set. The value floor and the
      handling of listing date decide the count.
- **Median value has no natural elbow.**
    - From rank 25 to about rank 350, `log10(value)` falls fairly evenly, 0.12–0.25 decades per 25
      ranks. Below about USD 1–3k (rank 375 and later) it falls faster.
    - There is no gap that separates "liquid" from "illiquid". A value floor between USD 10k and
      100k is a choice of how many lines to keep, roughly 255 to 105 since listing in 2y, or 267 to
      128 in 6m.
    - The leaders do not constrain that choice. Their minimum is about USD 215k, far above every
      candidate.
- **The 2y and 6m rankings broadly agree, with a Spearman of 0.95 and 83 of the top 100 shared.**
    - The 6m window naturally handles stale lines.
    - It also penalizes lines listed inside the window, because raw 6m participation for a May 2026
      listing is 77.6%.

## Open questions

- Why GFVA, on the current leading panel, returns no 24HS history. Possibilities include a recent
  ticker change or listing, or a different history symbol.
- Whether participation should count from the line's first bar or from the window start. If it
  counts from the first bar, what minimum number of sessions a line needs. That likely belongs to
  the indicator warm-up rule, not to liquidity.
- Whether the rule should use 2y, 6m, or both, for example 6m for currency of trading and a history
  floor for the indicators.
- Whether the provider adjusts volume, and not only price, across CEDEAR ratio changes. If it does
  not, `volume × close` before a ratio change is off by the ratio factor. The few unexplained jumps
  (CRWD, ORLY, TEFO) should be checked against issuer notices.
- What the off-calendar sessions 2024-11-12, 2025-06-11, and 2025-07-10 were, and why only BYMA,
  ECOG, ORLY, and XLP have bars on them.
- Whether to drop the 95 empty-history panel symbols at catalog generation instead of leaving the
  liquidity rule to reject them.
