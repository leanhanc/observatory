# Large one-session moves

Measured on Wednesday 2026-10-07 from Open BYMADATA daily 24HS history through session 2026-10-06.
This note describes the largest one-session moves on the 173 analyzed catalog lines. It is input
for the large-move safeguard in
[handle-provider-adjusted-history](../../openspec/changes/handle-provider-adjusted-history/proposal.md)
(decision 4): flag a one-session move that is probably an unadjusted corporate action, such as a
split or a CEDEAR ratio change, so it does not become a false Structure Break, Volatility Expansion,
or Regime flip. It describes the data and counts candidate rules. It does not choose a rule. Only
BYMA price data was used ([ADR 0006](../adr/0006-separate-research-lab-from-product.md)). News and
issuer notices were read only to label dates.

It builds on [CEDEAR liquidity distribution](./cedear-liquidity-distribution.md) and
[BYMA instrument universe](./byma-instrument-universe.md).

## Method

### Universe and requests

- **Lines:** the 173 non-bond Trading Lines in `instrument-catalog.v1.json`: 21 leading-panel stocks
  and 152 CEDEARs, all peso 24HS lines. The bond pair AL30/AL30D was fetched only for the MEP rate.
  The rest of the CEDEAR panel was not fetched, so CRWD, ORLY and TEFO, which are not catalog lines,
  were not measured again (see [the three lines from the liquidity note](#crwd-orly-and-tefo)).
- **Requests:** 175 history requests, sequential and at least 2.1 s apart, with `from` = 2000-01-01
  and `to` = end of 2026-10-06. None failed. Raw responses are cached in the git-ignored
  `.snapshots/research/large-moves/raw/`, next to the measurement scripts.
- **Window:** the provider returned about two years. The MEP rate exists for 486 sessions, from
  2024-10-07 to 2026-10-06.

### Pipeline

The cache was fed into the repository's own `createOpenBymadataAdapter`, so Continuity Data rows are
dropped as in production. Rates come from `calculateMepRates(AL30, AL30D)` and dollarized bars from
`dollarizeBarHistory` ([ADR 0005](../adr/0005-analyze-dollarized-local-series.md)). No validation
was run on top.

### Measures

Each measure is taken for every pair of consecutive dollarized bars of a line. Session `i` is a bar
and `i − 1` is the line's previous bar. A day the line did not trade is not a bar.

- **Close ratio:** `r = close_i / close_{i−1}`, in MEP dollars (`r_usd`) and in pesos (`r_ars`).
  The size of a move is `|ln r|`.
- **ATR multiple:** `|close_i − close_{i−1}| / ATR14_{i−1}` on the dollarized bars, using
  `calculateAtr`. The ATR is the one known at the previous close. It is undefined for a line's first
  14 bars.
- **Volume ratio:** `v = volume_i / median(volume of the previous 20 bars)`.
- **Volume-level step:** `median(volume_i … volume_{i+19}) / median(volume_{i−20} … volume_{i−1})`.
  A ratio change that multiplies the number of CEDEARs by `k` divides the price by `k`. If volume is
  left unadjusted, the step should be about `1/r`.
- **Next-session ratio:** `close_{i+1} / close_i`, used to detect a spike that reverts.
- **Cross-section:** for each session, the median `ln r_usd` of the stocks and of the CEDEARs that
  traded on consecutive sessions, together with the MEP change.

### Classification

Every line-session with `|ln r_usd| ≥ ln 1.25` or an ATR multiple of at least 5 was labelled. That
gave 114 line-sessions.

- **(a) Corporate action:** a confirmed or likely split or ratio change.
- **(b) Real move:**
    - **Market-wide:** the median move of the line's own group (stocks or CEDEARs) that day had the
      same sign and was at least 8% in log terms.
    - **News:** a public report ties the move to a news event.
    - **Single-name (`b?`):** none of the other tests applied. There was no market-wide move, no
      reversal the next session, and no volume step near `1/r`. These were not checked against news,
      so they are real only by inference.
- **(c) Glitch or thin print:** the next session reverses at least 70% of the move in log terms.

## Data checks

- **ARM's first ten bars are all zeros.** Ten raw rows from 2024-10-07 to 2024-10-24 have open, high,
  low, close and volume all equal to 0. The adapter keeps them, because the Continuity Data rule
  requires a retained close above 0. They produce infinite close ratios. The repository validator
  rejects non-positive prices, so this is a validation matter, not a large move. ARM rows before
  2024-11-20 are excluded from the statistics, because their ATR window touches these bars.
- **Sessions without a rate:** BYMA (3), ECOG (2) and XLP (2) have bars on 2024-11-12, 2025-06-11
  and 2025-07-10, which have no MEP rate. They drop out of the dollarized series, as in the liquidity
  note.
- **Line-sessions measured:** 75,654, of which 9,626 are on stocks and 66,028 on CEDEARs.

## Distribution

### Quantiles of |ln r| and the ATR multiple

| Quantile | All, \|ln r_usd\| | All, \|ln r_ars\| | Stocks, \|ln r_usd\| | CEDEARs, \|ln r_usd\| | ATR multiple, all |
| -------- | ----------------- | ----------------- | -------------------- | --------------------- | ----------------- |
| p50      | 0.014 (×1.014)    | 0.016             | 0.020                | 0.014                 | 0.36              |
| p90      | 0.050 (×1.05)     | 0.051             | 0.056                | 0.048                 | 1.03              |
| p99      | 0.118 (×1.13)     | 0.116             | 0.128                | 0.117                 | 2.24              |
| p99.9    | 0.234 (×1.26)     | 0.222             | 0.320                | 0.220                 | 4.58              |
| p99.99   | 0.377 (×1.46)     | 0.350             | 0.397                | 0.351                 | 7.95              |
| max      | 1.007 (×2.74)     | 1.010             | 0.658 (×0.518)       | 1.007                 | 31.1              |

Only three line-sessions in two years move by more than ×1.8 or less than ×0.55 in either currency.
The 99.99th percentile is ×1.46.

### Top 40 moves by |ln r_usd|

`v` is the volume ratio, `step` the 20-session volume-level step, and `next` the next-session
ratio.

| #   | Line  | Date       | r_usd | r_ars | ATR× | v     | step  | next  | Class            |
| --- | ----- | ---------- | ----- | ----- | ---- | ----- | ----- | ----- | ---------------- |
| 1   | MRNA  | 2026-08-19 | 2.738 | 2.747 | 31.1 | 106.6 | 6.44  | 0.764 | b, news          |
| 2   | LAC   | 2025-09-24 | 1.973 | 1.924 | 15.9 | 34.1  | 4.62  | 1.230 | b, news          |
| 3   | BYMA  | 2025-05-26 | 0.518 | 0.519 | 10.6 | 2.6   | 1.20  | 0.998 | **a, confirmed** |
| 4   | SPCE  | 2026-06-02 | 0.611 | 0.617 | 4.8  | 3.3   | 1.30  | 0.921 | b?               |
| 5   | LAR   | 2024-10-24 | 0.619 | 0.618 | —    | 10.2  | 0.83  | 0.948 | b?               |
| 6   | SPCE  | 2026-06-12 | 0.654 | 0.654 | 2.6  | 4.7   | 0.58  | 0.841 | b?               |
| 7   | SUPV  | 2025-10-27 | 1.473 | 1.369 | 5.4  | 3.8   | 0.84  | 1.061 | b, market        |
| 8   | METR  | 2025-10-27 | 1.463 | 1.361 | 4.5  | 2.9   | 0.81  | 1.021 | b, market        |
| 9   | TGNO4 | 2025-10-27 | 1.455 | 1.353 | 5.3  | 5.6   | 1.03  | 1.042 | b, market        |
| 10  | LAR   | 2024-10-23 | 0.695 | 0.695 | —    | 4.3   | 1.10  | 0.619 | b?               |
| 11  | JMIA  | 2025-02-20 | 0.704 | 0.706 | 4.9  | 12.9  | 1.16  | 1.000 | b?               |
| 12  | UPST  | 2024-11-08 | 1.419 | 1.412 | 7.0  | 11.4  | 1.32  | 0.959 | b?               |
| 13  | BBAR  | 2025-10-27 | 1.408 | 1.310 | 5.6  | 3.3   | 1.52  | 1.047 | b, market        |
| 14  | HUT   | 2025-01-27 | 0.718 | 0.722 | 3.1  | 3.2   | 0.74  | 1.054 | b?               |
| 15  | TRAN  | 2025-10-27 | 1.392 | 1.295 | 4.1  | 3.9   | 1.86  | 1.050 | b, market        |
| 16  | SATL  | 2025-10-16 | 0.719 | 0.735 | 3.3  | 8.5   | 2.66  | 0.915 | b?               |
| 17  | ECOG  | 2025-10-27 | 1.391 | 1.293 | 4.5  | 2.7   | 1.45  | 1.016 | b, market        |
| 18  | SPCE  | 2026-05-29 | 1.390 | 1.392 | 5.2  | 9.0   | 3.21  | 1.214 | b?               |
| 19  | SATL  | 2026-03-23 | 1.390 | 1.383 | 4.0  | 3.7   | 2.28  | 1.236 | b?               |
| 20  | TECO2 | 2025-10-27 | 1.384 | 1.287 | 6.5  | 5.1   | 1.06  | 1.013 | b, market        |
| 21  | BMA   | 2025-10-27 | 1.383 | 1.286 | 6.0  | 2.8   | 0.73  | 1.038 | b, market        |
| 22  | CEPU  | 2025-10-27 | 1.382 | 1.285 | 5.5  | 3.4   | 1.28  | 1.025 | b, market        |
| 23  | SNOW  | 2026-05-28 | 1.377 | 1.380 | 8.1  | 14.8  | 0.52  | 1.066 | b?               |
| 24  | EDN   | 2025-10-27 | 1.375 | 1.278 | 5.0  | 5.8   | 1.11  | 1.069 | b, market        |
| 25  | GGAL  | 2025-10-27 | 1.374 | 1.277 | 5.9  | 2.3   | 0.89  | 1.053 | b, market        |
| 26  | ANF   | 2026-08-26 | 1.373 | 1.377 | 9.2  | 18.1  | 1.21  | 0.978 | b?               |
| 27  | SATL  | 2024-12-05 | 1.371 | 1.353 | 4.3  | 8.8   | 2.29  | 1.261 | b?               |
| 28  | UNH   | 2025-04-21 | 0.731 | 0.703 | 5.5  | 4.8   | 3.87  | 1.007 | b?               |
| 29  | METR  | 2025-09-22 | 1.368 | 1.259 | 2.7  | 1.7   | 1.15  | 1.136 | b, market        |
| 30  | TGSU2 | 2025-10-27 | 1.367 | 1.271 | 5.8  | 3.7   | 1.64  | 1.001 | b, market        |
| 31  | RBLX  | 2026-07-31 | 0.733 | 0.738 | 4.6  | 18.3  | 1.61  | 1.028 | b?               |
| 32  | GLOB  | 2025-02-24 | 0.734 | 0.735 | 5.5  | 54.2  | 27.05 | 1.006 | b?               |
| 33  | ORCL  | 2025-09-10 | 1.358 | 1.356 | 10.1 | 17.1  | 6.51  | 0.930 | b?               |
| 34  | COME  | 2025-10-27 | 1.340 | 1.246 | 4.1  | 6.5   | 5.00  | 1.105 | b, market        |
| 35  | IBM   | 2026-07-14 | 0.747 | 0.741 | 6.2  | 19.0  | 2.28  | 0.978 | b?               |
| 36  | HUT   | 2026-05-06 | 1.333 | 1.331 | 5.7  | 5.4   | 1.18  | 0.942 | b?               |
| 37  | LAR   | 2024-10-22 | 1.329 | 1.323 | —    | 2.3   | 1.34  | 0.695 | c-like           |
| 38  | SLV   | 2026-01-30 | 0.754 | 0.755 | 4.3  | 15.1  | 0.87  | 0.943 | b?               |
| 39  | RKLB  | 2026-05-08 | 1.325 | 1.324 | 4.5  | 7.3   | 2.11  | 1.123 | b?               |
| 40  | BIOX  | 2025-10-15 | 1.319 | 1.307 | 3.3  | 8.5   | 2.80  | 0.921 | b?               |

Over all 114 labelled line-sessions, the counts are:

| Class                    | Count |
| ------------------------ | ----- |
| (a) corporate action     | 1     |
| (b) market-wide          | 28    |
| (b) news-confirmed       | 2     |
| (b?) single-name         | 79    |
| (c) reverts next session | 4     |

GLOB 2025-02-24 is one of the single-name moves. It came after a session in which GLOB did not
trade.

## Classification evidence

### (a) BYMA 2025-05-26: confirmed 1:1 share distribution, not adjusted by the provider

- **Price:** the close went from 375.90 to 195.10 (r = 0.519). The nearest factor is 1/2, at a log
  distance of 0.037. The open was already at the new level, so 104% of the move happened at the
  open. The bar's range does not overlap the previous bar's. The next session was flat (0.998).
- **Market:** stocks moved +1.1% that day, so the move was BYMA's alone.
- **Volume:** the volume ratio was 2.6. The level step was 1.20 over 20 sessions, 1.54 over 60 and
  1.61 over 120. That is below the 1.93 expected if volume were left unadjusted. Turnover in pesos,
  the 60-session median of `volume × close`, fell from ARS 1.38 B to 0.96 B. Volume either fell in
  real terms after the distribution or is partly adjusted. The data cannot tell which.
- **Primary source:** BYMA's newsroom, ["BYMA anuncia pago en acciones"](https://www.byma.com.ar/newsroom/byma-anuncia-pago-en-acciones),
  dated 2025-05-22, announces one share of VN$1 per share held, with ex-date 2025-05-26 and payment
  on 2025-05-27. The distribution was approved by BYMA's 8th shareholders' meeting
  ([BYMA newsroom](https://www.byma.com.ar/en/newsroom/novedades-byma-8va-asamblea-de-accionistas-importante-dividendo-nuevas-autoridades),
  found by search, not opened).
- **Provider:** BYMA's pre-split prices are fractional, for example 375.904. That suggests the
  provider has adjusted them for cash dividends. More than 16 months later, the provider still serves
  them unadjusted for the share distribution. This is the case decision 4 says to watch for: the
  provider failing to adjust a split.

### (b) The two largest moves are real single-name news

- **MRNA, 2026-08-19, ×2.74.** The ATR multiple is 31 and volume was 107 times the 20-session median.
  The ratio is within 0.088 of 3, but volume rose about sixfold afterwards, where a ratio change
  would cut it to about 1/3. The next session was ×0.764. Public reports describe the record one-day
  gain on 2026-08-19 as a reaction to Phase 3 results for the Moderna–Merck mRNA melanoma vaccine,
  and describe a drop of about a quarter the next day
  ([Finviz](https://finviz.com/news/383766/moderna-stock-eyes-best-day-ever-after-cancer-vaccine-breakthrough),
  [The Daily Guardian](https://thedailyguardian.com/business/moderna-shares-double-as-cancer-vaccine-data-rekindles-investor-hopes-749436/),
  [ms-aktuell](https://ms-aktuell.de/?p=152840); found by search, not opened). The CEDEAR followed
  its underlying. This is the largest move in the dataset, and it is real.
- **LAC, 2025-09-24, ×1.97.** The nearest factor is 2, at a log distance of 0.039. Volume was 34
  times the median, and the level step was ×4.6 rather than about ½. Reports tie it to news that the
  US government sought a stake in Lithium Americas
  ([Nasdaq](https://www.nasdaq.com/articles/why-lithium-americas-stock-almost-doubled-today),
  [Seeking Alpha](https://seekingalpha.com/news/4498586-lithium-americas-surges-95-on-report-of-possible-us-government-stake-but-clock-is-ticking);
  found by search, not opened).

Both sit close to a simple factor (3 and 2). A real move can therefore land near a split factor.

### (b) Argentine macro days

| Session    | Stocks, median ln r_usd | CEDEARs, median | MEP ln change | Reading (inference)                          |
| ---------- | ----------------------- | --------------- | ------------- | -------------------------------------------- |
| 2025-10-27 | +0.318 (×1.37)          | +0.011          | −0.073        | first session after the 2025-10-26 midterms  |
| 2025-09-22 | +0.202 (×1.22)          | +0.001          | −0.083        | US Treasury support announcement             |
| 2025-09-08 | −0.172 (×0.84)          | +0.004          | +0.037        | after the 2025-09-07 Buenos Aires vote       |
| 2025-10-09 | +0.120                  | −0.008          | −0.059        |                                              |
| 2025-04-14 | +0.112                  | +0.010          | −0.062        | first session after the exchange-band regime |

The political readings come from general knowledge and were not checked in this session.

- **Size:** on 2025-10-27, 14 of the 20 leading stocks that traded rose by ×1.29 to ×1.47 in dollars (the smallest rise was ×1.075). The
  largest was SUPV at ×1.473, with an ATR multiple of 5.4.
- **Currency:** in pesos the same moves are smaller (×1.25 to ×1.37), because the MEP rate fell that
  day.
- **Dispersion:** these moves are many lines in the same direction. The cross-section identifies
  them, but a one-line rule does not.

### (b?) Single-name CEDEAR moves

Most of the rest are single-name CEDEAR moves between ×1.25 and ×1.42, or between ×0.70 and ×0.80.
Examples are UPST, JMIA, SNOW, ORCL, UNH, GLOB, RBLX, IBM, ANF and XP.

- They show the shape of earnings gaps: a large volume ratio, no reversal, and no volume step near
  `1/r`.
- They were not checked one by one against news, so they are real only by inference.
- **SPCE and LAR** are speculative runs in thin lines that rose and then reversed over several
  sessions:
    - SPCE rose from 7,390 to 22,610 ARS between 2026-05-20 and 2026-06-01, then fell 39% on
      2026-06-02.
    - LAR rose from 4,500 to 10,250 between 2024-10-07 and 2024-10-22, then fell back to 4,400 by
      2024-10-24.
    - Each bar's range overlaps the previous bar's, so the price traded through the move. A split or
      ratio change does not produce that.
- Inference: these are local CEDEAR premium swings or underlying news, not corporate actions.

### (c) Spikes that revert

- **MRVL 2025-01-20:** the close was 13,107 against 10,570 the session before and after, on volume
  of 792 against a usual 1,000 to 11,000. That date was a US market holiday, so this is a thin local
  print.
- **LAR 2024-10-22 and SPCE 2026-06-11:** both meet the reversal test but belong to the multi-session
  swings above.
- No zero or near-zero close survived in the 173 lines once ARM's all-zero rows were set aside.

### No likely CEDEAR ratio change appears as a price step

None of the 152 CEDEAR lines has a move near a factor of 2 or more that also has a reciprocal volume
step. Within this window, CEDEAR ratio changes and underlying splits are absent from the served
prices, or already back-adjusted.

- **ServiceNow, a 5-for-1 underlying split that does not show in the price.**
    - The split was approved on 2025-12-05 and traded split-adjusted from 2025-12-18
      ([ServiceNow press release](https://newsroom.servicenow.com/press-releases/details/2025/ServiceNow-Shareholders-Approve-5-for-1-Stock-Split/default.aspx),
      found by search, not opened).
    - A search result says the NOW CEDEAR was enabled in May 2025 at 172:1
      ([BYMA newsroom](https://www.byma.com.ar/newsroom/19-nuevos-cedears-habilitados-en-byma),
      not opened).
    - The NOW peso line's daily ratios in December 2025 stay between ×0.90 and ×1.04. There is no
      ×0.2 step.
    - Volume steps up sharply: from 290 to 742 a day before 2025-12-15, to 28,820 on 2025-12-15 and
      16,000 to 30,000 a day after. The 20-session level step is ×31.
    - Which of two things happened is ambiguous. Either the provider back-adjusted prices but not
      volume, or the issuer changed the ratio so the price stayed put. This is the "adjusted price,
      unadjusted volume" pattern, and it is unconfirmed.
- **Other volume steps without a price step:** similar steps appear on GLW 2026-01-15 (×53), BAK,
  STNE, GPRK and PAGS in November and December 2024, and PETR3 2025-10-17. These were not
  investigated. They could be ratio changes adjusted in price only, new market-makers, or panel
  changes.

## CRWD, ORLY and TEFO

These three lines are not among the 173 catalog lines. The refetch was limited to catalog lines, so
they were not measured again. What is known:

- **CRWD, 2026-07-02, ×0.25 with unchanged volume** (from the liquidity note).
    - A factor of exactly 1/4 with no change in volume is the shape of an unadjusted ratio change or
      split.
    - A secondary source lists CrowdStrike among 13 Comafi CEDEARs the CNV enabled on 2026-05-06
      ([Rankia](https://www.rankia.com.ar/noticias/cedears/7323219-nuevos-cedears-cnv-mayo-2026),
      not opened), so the program was weeks old.
    - Two searches found no Comafi or CNV notice of a CRWD ratio change. Unconfirmed.
- **ORLY, 2025-06-05, `close = 0`.** This is a data glitch, and validation rejects non-positive
  prices. ORLY also had a bar on the off-calendar session 2025-06-11. The underlying was widely
  reported to split 15-for-1 around that time. That comes from general knowledge, was not checked
  here, and is an inference only.
- **TEFO, 2026-01-20, near-zero close.** This is a data glitch on a stale line.

Measuring these three needs three more requests, one per symbol. Whether the provider now serves
CRWD adjusted would show whether it repairs ratio changes after the fact.

## Candidate rules

Counts are over all 75,654 line-sessions:

- **Flagged:** line-sessions the rule flags, with the number of distinct lines in brackets.
- **Real:** flagged moves labelled (b) or (b?). These would be false alarms.
- **Glitch:** flagged moves labelled (c).
- **BYMA caught:** whether the rule flags BYMA 2025-05-26.

BYMA 2025-05-26 is the only corporate action that shows as a price step in this data. Because of
that, "misses" can only be judged against one confirmed case.

| Rule                                                            | Flagged | Real | Glitch | BYMA caught |
| --------------------------------------------------------------- | ------- | ---- | ------ | ----------- |
| \|ln r_usd\| ≥ ln 1.5                                           | 6 (5)   | 5    | 0      | yes         |
| \|ln r_usd\| ≥ ln 1.8                                           | 3 (3)   | 2    | 0      | yes         |
| \|ln r_usd\| ≥ ln 2                                             | 1 (1)   | 1    | 0      | **no**      |
| \|ln r_ars\| ≥ ln 1.5                                           | 6 (5)   | 5    | 0      | yes         |
| \|ln r_ars\| ≥ ln 1.8                                           | 3 (3)   | 2    | 0      | yes         |
| r_ars within 0.05 (log) of a factor ≥ 2 or its inverse          | 2 (2)   | 1    | 0      | yes         |
| r_ars within 0.10 of a factor ≥ 2 or its inverse                | 3 (3)   | 2    | 0      | yes         |
| r_ars within 0.05 of a factor, including 1.5                    | 4 (4)   | 3    | 0      | yes         |
| near factor (tolerance 0.10) and volume step within ×1.5 of 1/r | 0       | 0    | 0      | **no**      |
| near factor (tolerance 0.10) and volume step within ×2 of 1/r   | 1 (1)   | 0    | 0      | yes         |
| \|ln r\| ≥ ln 1.5 and volume step within ×1.5 of 1/r            | 1 (1)   | 1    | 0      | **no**      |
| ATR multiple ≥ 5                                                | 53 (43) | 50   | 2      | yes         |
| ATR multiple ≥ 8                                                | 8 (7)   | 7    | 0      | yes         |
| ATR multiple ≥ 10                                               | 4 (4)   | 3    | 0      | yes         |

- **Factors:** 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 50 and 100, plus 1.5 where stated.
  Tolerance is `|ln r − ln k|`.
- **Volume step:** measured over 20 sessions on each side, and requires at least 10.
- **Rules flagged at ln 1.8:** BYMA, LAC and MRNA.
- **Rules flagged at ln 1.5:** those three, plus LAR 2024-10-24 and SPCE 2026-06-02 and 2026-06-12.
- **Near-factor rule:** at tolerance 0.05 it flags BYMA and LAC. At 0.10 it adds MRNA.
- **ATR rules:**
    - At ×10 they flag BYMA, LAC, MRNA and ORCL 2025-09-10.
    - At ×8 they add ANF, SNOW (twice) and XP 2026-10-05.
    - At ×5, 9 of the 53 are leading stocks on macro days.
    - The ATR is undefined for a line's first 14 bars, where LAR's 2024 swing sits.
- **Absolute thresholds in either currency:** dollars and pesos give the same counts at ln 1.5 and
  ln 1.8. The largest market-wide real move is ×1.47 in dollars and ×1.37 in pesos. At these
  thresholds, the currency choice does not change which lines are flagged.

## Largest real dollarized moves

These set how far down an absolute threshold can go before it flags real trading.

- **Single-name news:** MRNA ×2.74 and LAC ×1.97. Both are above every symmetric threshold up to ln 2.
- **Argentine macro days:** up to ×1.47 (SUPV, 2025-10-27) and down to ×0.765 (SUPV, 2025-09-08).
  Inference: a threshold above about ln 1.5 clears every macro-day move seen in this window, though
  that window has only two years and one midterm.
- **Thin-line speculative swings:** SPCE ×0.611 and LAR ×0.619. These fall between ln 1.5 and ln 1.8.
- **Other single-name CEDEAR moves:** up to ×1.42 (UPST) and down to ×0.70 (JMIA).

## Reading (inference, not a decision)

- **No one-session feature separates the cases.** BYMA's 2:1 is indistinguishable from MRNA's and
  LAC's news moves by close ratio, factor proximity or ATR multiple. All three are near a simple
  factor, above ×1.8, and above ten ATRs.
- **Volume separates them in this sample, but only loosely.** The real news moves had volume level
  steps of ×4.6 to ×6.4 upward, while ratio arithmetic would predict about ×0.5 and ×0.36. The
  confirmed split stepped ×1.2 against an expected ×1.93. A reciprocal-volume test needs a tolerance
  of about ×2 to catch it. With one confirmed case, that tolerance is not established.
- **The safeguard seems to need forward data or an outside source.** A rule that sees only the
  session itself cannot tell these apart. Volume after the session, or an issuer or exchange notice,
  is needed for that. Using volume after the session means the flag can only be confirmed with a lag.
  Holding back or annotating a flagged move until the next sessions are known avoids look-ahead.
- **The absolute threshold only has to be high enough to clear real moves.** The flagged set at
  ln 1.8 is tiny: 3 line-sessions in two years over 173 lines. If the safeguard's job is to stop an
  automatic Event and ask a question, two false alarms in two years may be an acceptable cost. A
  threshold at ln 2 would have missed the one real split.
- **Price adjustment is uneven.** The provider back-adjusted cash dividends and, apparently, at least
  one CEDEAR split (NOW), but not BYMA's share distribution. Volume shows no sign of being adjusted
  anywhere. This weakens decision 4's assumption that splits and ratio changes come from the
  provider, at least for local stocks.

## Caveats

- **Short window:** about two years and one split. Every rule count rests on a single confirmed
  corporate action.
- **Unchecked labels:** the 79 single-name (b?) moves were not checked against news. They are labelled
  real because nothing points to a corporate action.
- **Limited web checking:** nine web requests were made. Several sources were read only through
  search-result summaries, and each is marked "not opened". The iProfesional article on a MELI ratio
  change could not be read. The MELI peso series shows no step in June or August 2026.
- **Partial universe:** CRWD, ORLY and TEFO, and the rest of the CEDEAR panel, were not measured.
  The earlier note's 12 jumps beyond ×1.8 or ×0.55 across 544 lines included some on lines outside
  the catalog.
- **What volume measures:** the volume-level step mixes a changed unit with changed interest. A
  split often brings more trading, and news always does.
- **The rate:** the dollarized ratio depends on a single MEP rate per session, so it carries
  AL30/AL30D noise. Peso and dollar results agree at the thresholds that matter here.

## Open questions

- Does the provider adjust CEDEAR ratio changes after the fact? Refetching CRWD around 2026-07-02 is
  the cheapest test.
- Is volume ever adjusted? The NOW and GLW volume steps suggest it is not. An issuer notice for one of
  them would settle it.
- How many local-stock share distributions or splits occurred in the window besides BYMA's? A list
  of CNV hechos relevantes for the 21 leaders would turn one case into a sample.
- Should the safeguard use a lagged volume check, or an issuer feed such as a diff of Comafi's XLSX
  between runs, or both? This is a product decision for Lean.
