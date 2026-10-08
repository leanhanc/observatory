# Provider bad bars

Measured on Thursday 2026-10-08 from the Open BYMADATA daily 24HS responses cached for
[Large one-session moves](./large-one-session-moves.md): the 173 catalog lines plus AL30 and AL30D,
through session 2026-10-06. No new requests were made. This note describes the Daily Bars that fail
domain validation and counts candidate repairs for each one. It does not choose a repair.

It is input for the five lines the dry run through 2026-10-06 reported as `invalid-bars`: TGNO4,
HUT, SATL, XLP and ARM. Since commit `4031085` (`drop-invalid-analysis-bars`) the Analysis Run no
longer drops these lines. It drops the invalid bars one by one and records them in
`droppedBarSessions` (`src/modules/analysis-run/analysis-run.ts:371`). Bar History acquisition still
rejects a whole line for one invalid bar (`openspec/specs/bar-history/spec.md:54`).

## Method

- **Data:** the raw responses in the git-ignored `.snapshots/research/large-moves/raw/`. GFVA
  returned `no_data`, so 174 files have rows. Each row's timestamp was converted to a Buenos Aires
  session date, as the adapter does (`src/modules/bar-history/adapters/open-bymadata/open-bymadata.ts:244`).
- **Raw rows:** every row is checked before the adapter. It is then checked again after
  `createOpenBymadataAdapter` has dropped Continuity Data and applied the 1% range repair, and
  `validateDailyBars` is run on the result.
- **Gap:** the distance from the nearest bound, as a percentage of that bound. For a close below the
  low it is `(low − close) / low`, the same ratio the repair uses (`open-bymadata.ts:133`).
- **Scripts and outputs:** `.snapshots/research/bad-bars/` holds `measure.ts` (per-bar checks and the
  adapter pass), `dates.ts` (the 2025-01-17 and 2025-04-21 cross-sections), `stale.ts` (repeated
  closes and ARM's rows) and `nextopen.ts` (next-open baselines), with their JSON and text outputs.

The relevant rules are:

| Rule                                                               | Code                                         |
| ------------------------------------------------------------------ | -------------------------------------------- |
| Continuity Data: volume 0, close > 0, and a zero open, high or low | `open-bymadata.ts:153-159`, applied at `:93` |
| Range repair: widen low or high when open or close is ≤ 1% outside | `open-bymadata.ts:19`, `:117-151`            |
| Prices must be > 0                                                 | `bar-history-validator.ts:71-74`             |
| `low ≤ high`, and open and close inside `[low, high]`              | `bar-history-validator.ts:96-121`            |
| Duplicate or unsorted sessions                                     | `bar-history-validator.ts:231-277`           |

## Findings

### 1. Range violations

On the raw rows there are 21 range violations, all on the close, on three dates. No open lies
outside `[low, high]`, apart from the zero opens counted in section 3, and no row has `low > high`.

| Date       | Lines affected                         | Direction                          | Gap range     | Fixed by the 1% repair |
| ---------- | -------------------------------------- | ---------------------------------- | ------------- | ---------------------- |
| 2025-01-17 | 18 catalog lines + AL30, of 140 traded | 18 below the low, 1 above the high | 0.054%–1.184% | 16 (15 lines + AL30)   |
| 2025-04-21 | 1 (XLP), of 142 traded                 | above the high                     | 2.951%        | 0                      |
| 2025-06-05 | 1 (ECOG)                               | below the low                      | 0.269%        | 1                      |

After the adapter, four range violations remain, and they are the four range-invalid lines:

| Line  | Date       | Field | Provider bar (o / h / l / c, volume)           | Gap     |
| ----- | ---------- | ----- | ---------------------------------------------- | ------- |
| TGNO4 | 2025-01-17 | close | 2972.385 / 3071.71 / 2795.808 / 2762.7, 330427 | −1.184% |
| HUT   | 2025-01-17 | close | 6488 / 6960 / 6488 / 6414, 19614               | −1.141% |
| SATL  | 2025-01-17 | close | 3420 / 3550 / 3360 / 3325, 25038               | −1.042% |
| XLP   | 2025-04-21 | close | 5393.931 / 5528.3 / 5336.345 / 5691.461, 43125 | +2.951% |

The lines that pass today on 2025-01-17, with the gap the 1% repair absorbs:

| Line | Gap    | Line | Gap    | Line | Gap                 |
| ---- | ------ | ---- | ------ | ---- | ------------------- |
| VIST | 0.765% | LOMA | 0.395% | MA   | 0.133%              |
| RBLX | 0.641% | CEPU | 0.326% | JPM  | 0.122% (above high) |
| RIOT | 0.552% | GGAL | 0.255% | IWM  | 0.093%              |
| LLY  | 0.481% | VALO | 0.222% | HPQ  | 0.065%              |
| SPCE | 0.409% | AL30 | 0.192% | TEN  | 0.054%              |
| XLV  | 0.173% |      |        |      |                     |

### 2. 2025-01-17

- **Provider-wide, but not universal.** 18 of the 138 catalog lines that traded that day are
  affected: 5 of the leading stocks (GGAL, CEPU, LOMA, VALO, TGNO4) and 13 CEDEARs, plus the AL30
  bond. AL30D is not. No other date in the two years has more than one line with a close outside its
  range.
- **The pattern is consistent.** It is always the close, never the open. It is below the low in 18
  of 19 rows. JPM is the exception, 0.12% above its high.
- **Closes at the low are unusually common.** 25 of 140 traded rows (17.9%) close within 2% of the
  range from the low, or below it. That is the highest share of any session in the cache; the next is
  2025-10-09 at 13.1%. Seven more lines close exactly at the low (ADGO, LAR, OXY, PANW, SAP, UPST,
  VEA).
- **No common adjustment factor.** `close / low` runs from 0.98816 (TGNO4) to 0.99946 (TEN) and is
  spread evenly in between. It does not cluster around one value.
- **Not the previous close.** `close / previous close` runs from 0.917 to 1.025 on the affected lines.
- **Next session's open, weakly.** The 2025-01-20 open is within 0.1% of the 2025-01-17 close on 7
  of 19 affected rows. The baseline over all 76,643 consecutive pairs is 13.9%, and 19.3% over every
  line on 2025-01-17. It is within 0.1% of the 2025-01-17 low on 5 of 19, against a 2.9% baseline.
  TGNO4's next open, 2795.808, equals its 2025-01-17 low exactly. With 19 rows, this is suggestive,
  not established.
- **Many affected prices are unadjusted.** HUT, SATL, LOMA, RBLX, RIOT, SPCE and VIST have round
  tick prices on that bar, for example HUT's low 6488 and close 6414. Back-adjusted prices are
  fractional (see BYMA in [Large one-session moves](./large-one-session-moves.md)). The
  `handle-provider-adjusted-history` proposal reads GGAL's gap as a rounding artifact of adjustment.
  That does not explain gaps above 1% between two unadjusted round prices. Inference: the close and
  the range on that date come from different calculations, and the mechanism is unknown.
- **Nothing shared beyond the date.** The affected rows include Argentine banks and utilities,
  US-stock CEDEARs, ETF CEDEARs (IWM, XLV) and a sovereign bond. Leading stocks fell that day (GGAL
  ×0.937, TGNO4 ×0.917 against the previous close); most CEDEARs did not move much. No dividend or
  issuer notice was checked, because this survey made no network requests. No single corporate event
  spans that set.
- **Bound for a date-specific rule.** The gaps go from 0.05% to 1.18% with no gap in the
  distribution. Every row would fit under a 1.25% bound on that date. Only TGNO4, HUT and SATL
  need more than the current 1%.

### 3. Zero prices

| Pattern                      | Volume | Rows | Lines                                                    | Adapter |
| ---------------------------- | ------ | ---- | -------------------------------------------------------- | ------- |
| All four prices 0            | 0      | 10   | ARM, 2024-10-07 to 2024-10-24                            | kept    |
| All four prices 0            | > 0    | 0    | —                                                        | —       |
| Open, high, low 0; close > 0 | 0      | 22   | GLW 9, NOW 4, ARM 2, HL 2, PATH 2, ETHA 1, SAP 1, SPCE 1 | dropped |
| Only the open 0              | > 0    | 2    | AL30 and AL30D on 2025-10-13                             | kept    |

- **Why ARM's rows are kept.** Continuity Data requires a retained close above zero,
  `const hasRetainedClose = bar.close > 0;` (`open-bymadata.ts:155`). ARM's all-zero rows fail that
  test, so they reach validation and fail on four non-positive prices each.
- **ARM's rows are placeholders before the first trade.** They are sporadic: there are no rows at all
  for 2024-10-16, 10-18, 10-21 and 10-25. The first traded bar is 2024-10-28 (6800 / 6800 / 6700 /
  6700, volume 93). Every row before that is all zeros.
- **No all-zero row has volume.** Every zero-price row in the cache, except the two AL30/AL30D zero
  opens, has zero volume.
- **AL30 and AL30D** are the MEP rate source, whose run accepts a zero open
  (`analysis-run.ts:353`). Bar History validation would reject them.

### 4. XLP 2025-04-21

- **Isolated as a range violation.** On 2025-04-21, 142 rows traded and no other line has a close
  outside its range. The next five lines by close position sit exactly at their high.
- **The close is stale.** XLP's close is 5691.461 on 2025-04-16, 2025-04-21 and 2025-04-22: three
  sessions in a row with the same close. 2025-04-17 and 2025-04-18 were not sessions. The 2025-04-21
  range (5336.345–5528.3) sits entirely below that close. The 2025-04-22 bar has the same close
  inside its range (5480.311–5739.45), so it passes validation, but its close is probably also stale.
- **Repeated closes alone are common.** 1,416 of 76,643 traded bars (1.8%) repeat the previous close
  exactly, mostly on thin lines quoted in round ticks. XLP 2025-04-21 is the only one outside its
  range.
- **Context:** XLP was listed on 2025-01-14, so it was three months old. Volume that day was 43,125,
  against about 9,000 in the sessions before.

### 5. Other validator failures

None. There are no duplicate or unsorted sessions, no negative values and no `low > high`. After the
adapter, `validateDailyBars` rejects exactly TGNO4, HUT, SATL, XLP and ARM, plus the AL30 and AL30D
zero opens that the run accepts for the MEP rate source.

## Candidate repairs

| Option | Rule                                                            | Bars changed                   | Recovers                                    | Risk added                                                                                                                             |
| ------ | --------------------------------------------------------------- | ------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| (a)    | Treat all-zero, zero-volume rows as Continuity Data             | 10 dropped (ARM)               | ARM                                         | Low. No all-zero row has volume. The rule still needs `volume = 0`, so an all-zero row with volume would still fail.                   |
| (b)    | Accept a close up to 1.25% outside the range on 2025-01-17 only | 3 widened (lows by 1.04–1.18%) | TGNO4, HUT, SATL                            | A date written into the adapter for a cause that is unknown. It becomes dead code once the date leaves the window on about 2027-01-18. |
| (c) 2% | Raise the general tolerance to 2%                               | 3 widened                      | TGNO4, HUT, SATL                            | Applies to every future bar. Nothing in the cache sits between 1.18% and 2.95%, so it admits nothing else today.                       |
| (c) 3% | Raise it to 3%                                                  | 4 widened                      | TGNO4, HUT, SATL, XLP (2.951%, just inside) | XLP's high would rise 2.95% to a stale close: part of the range is invented, and that range enters True Range.                         |
| (c) 5% | Raise it to 5%                                                  | 4 widened                      | the same four                               | Same as 3%, with more room for future stale closes or misprints.                                                                       |
| (d)    | Leave the bars invalid until they leave the provider window     | 0                              | none now; each one on its exit date below   | The bars stay out (dropped in the run, rejected in Bar History) until then.                                                            |

Gaps above 1% are rare. In two years there are four bars: three on 2025-01-17, plus XLP. Raising
the tolerance changes no other bar in the cache.

### Window exit dates for (d)

A request through 2026-10-06 returned bars from 2024-10-07. Earlier observations had the same
offset: through 2026-09-08 from 2024-09-09, and through 2026-09-11 from 2024-09-12
([Open BYMADATA provider](./open-bymadata-provider.md)). Inference: a bar dated D is last returned on
about D + 2 years, plus or minus a day.

| Line  | Last bad session | Out of the window from about |
| ----- | ---------------- | ---------------------------- |
| ARM   | 2024-10-24       | 2026-10-25 (in ~2.5 weeks)   |
| TGNO4 | 2025-01-17       | 2027-01-18                   |
| HUT   | 2025-01-17       | 2027-01-18                   |
| SATL  | 2025-01-17       | 2027-01-18                   |
| XLP   | 2025-04-21       | 2027-04-22                   |

## Not established

- Why the close and the range disagree on 2025-01-17. Adjustment rounding does not explain gaps
  between unadjusted round prices.
- Whether the provider still serves the same 2025-01-17 and 2025-04-21 values on a fresh request.
- XLP's true 2025-04-21 close, or whether its 2025-04-22 close is also stale.
