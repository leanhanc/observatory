# Add the leading CEDEARs to the Instrument Catalog

## Why

The Analysis Run covers the 21 leading-panel stocks and one CEDEAR, Apple. CEDEARs are most of what a local investor can trade: BYMA's `cedears` panel listed 523 peso 24-hour lines on 2026-10-04 once the `B` variants were dropped, and 412 on 2026-10-05, after BYMA removed 136 legacy symbols, almost all with no trades in six months. Most of those lines trade too thinly to describe, though, and about 95 have no history at all. `add-liquidity-eligibility` gave Observatory a rule for which lines trade enough. This change uses that same rule to choose which CEDEARs enter the catalog, so the Analysis Run starts describing them.

Adding CEDEARs in bulk also breaks a catalog rule: every CEDEAR must reference a `stock` Instrument as its underlying. The real underlyings include ADRs, ETFs, commodity and bitcoin funds, and shares listed on XETRA or in London. [ADR 0008](../../../docs/adr/0008-describe-cedear-underlyings.md) replaces the reference with a description.

## What Changes

### CEDEAR underlying as a description (ADR 0008)

- A CEDEAR's `underlyingInstrumentId` is replaced by `underlying: { market, ticker }`. Both are non-blank strings, taken from the technical sheet's `mercadoOrigen` and `simboloMercado` and stored as BYMA writes them (`NASDAQ`, `NASDAQ GM`, `NYSE Arca`).
- The catalog no longer validates a CEDEAR-to-Instrument relationship, and the `invalid-underlying` issue code goes away.
- `apple-stock` and its NASDAQ line are removed. They existed only to satisfy the reference. `apple-cedear` keeps its id and line, and its underlying becomes `{ market: 'NASDAQ', ticker: 'AAPL' }`, from its technical sheet.
- The ratio is not recorded.

**No schemaVersion bump.** The catalog stays `schemaVersion: 1` and `instrument-catalog.v1.json`. A schema version protects a reader from data written by different code. Bar Histories and Analysis Snapshots live in a bucket and outlive the code that wrote them, so their versions matter. The catalog is a JSON file imported by the module that validates it and committed in the same tree as that module and its generator. No stored catalog exists outside the repository, so the file and its reader can never disagree. A bump would rename the file and touch every reference without protecting anyone. If the catalog ever moves to storage, its version starts to matter, and the bump belongs to that change.

### The generator adds liquidity-eligible CEDEARs

`bun run generate:catalog [--through-session YYYY-MM-DD]` merges the leading panel as before, then:

1. **Candidates.** It requests the `cedears` panel with the same body as the leading panel and keeps the ARS 24-hour rows. It drops each `B` variant: a symbol ending in `B` whose base, with the `B` and any trailing dots removed, is also an ARS 24-hour row (`AAPLB` → `AAPL`, `C...B` → `C`, and `BB` → `B` when `B` is listed). A `…B` symbol without a listed base (`ABNB`, `BRKB`, or `B` itself) is kept. This is the rule the research used. Lean preferred confirming each pairing by ISIN, but the panel rows carry no ISIN; the only per-symbol ISIN source is the technical sheet, one paced request per symbol. So the set rule stays, and the report lists every dropped variant with its base, so that a mistaken drop is visible.
2. **Existing CEDEARs.** A candidate that a catalog CEDEAR already owns as a BYMA ARS line is left unchanged and not fetched. A catalog CEDEAR whose symbol is no longer a candidate is reported, not deleted. That includes one owning a dropped `B` variant.
3. **Conflicts, before any fetch.** A candidate is skipped and reported, without requesting its history, when its symbol is already another Instrument's BYMA ARS line, when its derived id or line id is already in the catalog, or when another candidate derives the same id (`BA.C` and a hypothetical `BA..C`). In the 2026-10-04 panel no candidate would have conflicted. Final validation would catch a conflict too, but only after the whole run.
4. **Liquidity.** It fetches the MEP rate source pair (AL30, AL30D) and validates it exactly as the Analysis Run does, with `validateMepRateSourceBars`. That function moved from the run into `dollarized-series`, so both share it, including the zero-open exception. Generation therefore fails wherever a run could not publish. It then fetches each remaining candidate's full history through the through-session. Each candidate is evaluated with the same `selectLiquidityWindow` and `evaluateLiquidityEligibility` the Analysis Run uses, at the latest MEP session on or before the through-session.
5. **Underlying.** For each eligible candidate it requests the technical sheet. It adds the candidate only when the sheet has exactly one row with a non-blank `mercadoOrigen` and `simboloMercado`, both trimmed.
6. **Bar validity.** An eligible candidate's bars are validated as a Daily Bar history. A line with an invalid bar is still added, because eligibility reads only dates, closes and volumes, but it is listed as "added with invalid bars", because the Analysis Run will report it as `invalid-bars`, as it does for TGNO4. ORLY's `close = 0` is an example. The large-move safeguard is where such lines get handled.
7. **Records.** Each added CEDEAR is a `cedear` Instrument with one BYMA ARS Trading Line. Its id follows the leaders' slug rule plus `-cedear`: `MELI` becomes `meli-cedear` with line `meli-cedear-byma-ars`, and `BA.C` becomes `ba-c-cedear`.

**Through which session.** `--through-session` is optional. Without it the generator uses the scheduled Analysis Run's default: the calendar date before today in Buenos Aires, from `resolvePreviousMarketDate` in the analysis-run module. That depends on `schedule-analysis-run` landing first, or with this change. An explicit date wins, and today or a later date is rejected. On a weekend or holiday, eligibility is measured at the latest earlier session with a MEP Rate, and the report states which session that was.

**Failures.**

- A candidate whose history request fails, or that has no technical sheet usable for its underlying, is not added and is listed in the report. One bad symbol out of hundreds should not throw away a long run.
- A failed or non-JSON panel request, a malformed or possibly truncated panel, the MEP rate source failing to fetch or validate, or fewer than 125 market sessions fails the whole generation, and nothing is written.
- The `cedears` panel is a bare array without `total_elements_count`. A response with as many rows as the requested page size (5000) is treated as possibly truncated.

**Pacing.** Every request is sequential, with exactly one 2 s pause between the end of one and the start of the next, across panels, histories and technical sheets. The pacing lives in one place, `generateCatalog`. The first real generation, on 2026-10-05 through 2026-10-02, made about 570 requests and took about 45 minutes, because it paused twice, 4 s, between requests. With one pause, the same work is about 25–30 minutes: about 570 × (2 s + response time). That is acceptable for a manual tool, but not for a daily job.

The same merge rules as the leaders apply: existing ids stay stable, nothing is deleted automatically, absent entries are reported, added Instruments follow the existing ones in symbol order, the merged catalog is validated before writing, and the file is replaced atomically.

## Trade-offs

- **Eligible at generation, gated again at every run.** The catalog records CEDEARs that were eligible when it was generated. Each Analysis Run re-applies the gate at its own session, so a CEDEAR that thins out shows as `insufficient-liquidity` without a catalog change. A CEDEAR that becomes liquid after generation is missed until the next generation. Cadence is a follow-up.
- **Description, not identity.** Two CEDEARs on the same underlying, for example a share and its ADR, are not linked. Nothing needs that yet.
- **Run time.** The Analysis Run grows from 22 to 173 analyzed lines. The dry run on 2026-10-06 took about 15 minutes. That still fits a daily morning schedule.

## Scope

- ADR 0008, the CEDEAR record shape, the removal of `apple-stock`, and the generator's CEDEAR stage.
- Glossary: Underlying Instrument becomes Underlying, a description rather than an Instrument.
- No ratios, no `D`, `C` or `B` lines, no general panel, and no recording of panel membership.
- **NASDAQ stays in the exchange picklist.** The repository catalog no longer has a NASDAQ line, but the analysis-run spec's scenario "peso lines of stocks and CEDEARs are analyzed" and its tests still use a NASDAQ stock to prove that only BYMA peso lines are analyzed. Removing the value would mean rewriting that scenario for no behavioral gain. It can go when the catalog schema next changes.

## Dry-run notes

- The 2026-10-06 dry run (173 lines) had one `no-provider-bars` entry, `gfva-stock`, the leader with no 24HS history since the leading-panel change. No CEDEAR came back without provider bars.
- Five lines were `invalid-bars`:
    - TGNO4, HUT and SATL have a close below the low on 2025-01-17, which looks provider-wide;
    - XLP's close is about 3% above its high on 2025-04-21;
    - ARM has 10 all-zero bars from 2024-10-07 to 2024-10-24 that the adapter does not drop.

## Follow-ups

- **Large-move safeguard, next and soon.** CEDEAR ratio changes can produce false Events. Check CRWD (×0.25 on 2026-07-02 with unchanged volume), ORLY (`close = 0` on 2025-06-05) and TEFO (near-zero close on 2026-01-20).
- **Cadence and panel membership.** Leaders daily, the rest every 2–3 days, and record panel membership.
- **The general panel.**
- **Ratios.**
- **Technical-sheet quirks.** The sheet's ticker is stored as given. On 2026-10-05 it carried a trailing dot (`GLW.`, `LLY.`, `LMT.`, `NKE.`), a market suffix (`PBR US`, `TS US`, `VIST US`), a typo (`WMY` for Walmart), and VIST under `NASDAQ` although Vista trades on the NYSE. The description is readable but not a clean join key. Decide whether to normalize, or correct by hand, before anything joins on it.
- **Re-evaluating catalog CEDEARs.** The generator does not re-measure existing CEDEARs. Pruning is a person's decision, informed by the Analysis Run's `insufficient-liquidity` entries.
