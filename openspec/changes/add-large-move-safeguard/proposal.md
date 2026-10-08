# Add the large-move safeguard and confirmed corporate actions

## Why

A split, a share distribution or a CEDEAR ratio change multiplies the number of shares and divides the price by the same factor. Nothing about the company changed, but a price series that is not adjusted for it shows a step: BYMA's close went from ARS 375.90 to 195.10 on 2025-05-26, the ex-date of a 1:1 share distribution. Every indicator reads that step as a market fact. ATR and True Range see a session ten times larger than usual, so the session is a Volatility Expansion; a close that far below the last swing low can be a Structure Break; and a halved price can flip Regime once the averages catch up. Observatory would describe a bookkeeping change as a crash.

[ADR 0007](../../../docs/adr/0007-follow-provider-adjusted-prices.md) follows the provider's adjusted prices, and decision 4 of [handle-provider-adjusted-history](../handle-provider-adjusted-history/proposal.md) assumed the provider adjusts splits and ratio changes too: "no ratio table is built until the provider is seen failing to adjust one". [docs/research/large-one-session-moves.md](../../../docs/research/large-one-session-moves.md) now shows that failure. More than 16 months after BYMA's share distribution, Open BYMADATA still serves the pre-distribution prices unadjusted, while those same prices carry fractional cash-dividend adjustments. CEDEAR ratio changes look different: ServiceNow's 5-for-1 underlying split does not appear in NOW's peso price, but NOW's volume jumps about thirtyfold, so the price looks adjusted and the volume does not.

The research also shows that no one-session feature tells a corporate action from a real move. BYMA's ×0.52 is indistinguishable by close ratio, factor proximity or ATR multiple from MRNA's ×2.74 and LAC's ×1.97, which were real news. So Observatory cannot detect corporate actions automatically yet. It can do two weaker, honest things: correct the ones that are confirmed by a primary source, and flag every remaining move large enough that it might be one.

## What Changes

### Confirmed Corporate Actions

A committed, validated data file, `src/modules/corporate-actions/data/corporate-actions.v1.json`, lists Corporate Actions that are confirmed by a primary source and that the provider was observed not to adjust. Each entry has `tradingLineId`, `exDate`, `priceFactor`, `kind` (`share-distribution`, `split` or `reverse-split`) and `sourceUrl`. The source is required, because an entry rescales history, and a reader must be able to check why. It starts with two entries:

- **BYMA** (`byma-stock-byma-ars`): ex-date 2025-05-26, price factor 0.5, a 1:1 share distribution, sourced from [BYMA's newsroom](https://www.byma.com.ar/newsroom/byma-anuncia-pago-en-acciones).
- **ETHA** (`etha-cedear-byma-ars`): ex-date 2026-10-06, price factor 3, a reverse split. The underlying iShares Ethereum Trust ETF combined every three shares into one, effective at the open of 2026-10-06 ([SEC 8-K](https://www.sec.gov/Archives/edgar/data/0002000638/000143774926025654/etha20260803_8k.htm)). Caja de Valores' notice to the Bolsa de Comercio of 2026-10-06 gives the same ex-date in Argentina, credits 0.3333334 CEDEAR per CEDEAR held, and keeps the CEDEAR ratio at 5:1, so the CEDEAR's price triples with the underlying's. No public URL for that notice was found, so the entry cites the issuer's filing, the source for an ETF's own corporate action. Open BYMADATA serves ETHA's earlier prices unadjusted: the peso line closed at 6,550 on 2026-10-05, did not trade on 2026-10-06, when BYMA halted it, and closed at 18,730 on 2026-10-07 (×2.86, the factor 3 with an ordinary move).

**The price factor.** It is what a pre-ex-date price must be multiplied by to be on the post-ex-date scale. A 1:1 share distribution gives each holder one new share per share, so each share is worth half: factor 0.5. A 2-for-1 split is also 0.5, and a 3-for-1 split is 1/3. A 1-for-3 reverse split turns three shares into one, so each is worth three times as much: factor 3. Validation ties the direction to the kind: below 1 for a share distribution or a split, above 1 for a reverse split.

**How a correction is applied.** The run applies each entry to the line's peso bars before anything else reads them: before liquidity eligibility, dollarization, State and Events. Every bar with `sessionDate < exDate` has its open, high, low and close multiplied by the factor and its volume divided by it. Volume is a share count: a holder who traded 100 shares before a 1:1 distribution traded what are now 200 shares, and 300 CEDEARs traded before ETHA's reverse split are now 100. Traded value, `volume × close`, is unchanged by the correction, so it cannot move liquidity eligibility; applying it first is a matter of every consumer seeing the same bars. The MEP rate source is never corrected: a bond's price is not affected by a stock's share count.

**The double-adjustment guard.** If the provider later adjusts the history itself, applying the entry again would halve the earlier prices a second time and create the very step it removed. So an entry is applied only when the fetched data still shows the step. The run takes the peso close ratio across the ex-date, `r = close(first bar on or after exDate) / close(last bar before exDate)`, and applies the entry only when both are true:

- `|ln r − ln priceFactor| ≤ ln 1.25`: the observed step is within ×/÷1.25 of the factor. In the research, a one-session move of 1.25 or more happens about once per thousand line-sessions (p99.9 of `|ln r|` is 0.234), so a real move of that size coinciding with the ex-date is unlikely. BYMA's observed 0.519 is 0.037 from ln 0.5.
- `|ln r − ln priceFactor| < |ln r|`: the observed ratio is closer to the factor than to "no step". For factors near 1, a ×/÷1.25 band would otherwise include 1, which is what an already-adjusted history looks like.

When the step is absent, the entry is skipped, recorded as `already-adjusted` and logged as a warning, so someone can remove the stale entry. When the fetched window has no bar before the ex-date, or no bar on or after it, the step cannot be observed, and nothing needs correcting: the entry is recorded as `outside-window`. Each available line's snapshot entry lists every Corporate Action for it with its status and the observed ratio.

The tolerance, 1.25, goes into `ANALYSIS_CONFIGURATION.corporateActions.maximumStepDeviation`.

### Large One-Session Moves

A session whose dollarized close satisfies `|ln(close_i / close_{i−1})| ≥ ln 1.8` is a **Large One-Session Move**. `close_{i−1}` is the line's previous dollarized bar: a session the line did not trade, or that had no MEP Rate, is not a bar. The measure reads only sessions `i − 1` and `i`, so it is known at the close of `i`. It is measured after Corporate Action corrections, so a corrected step is no longer flagged. The threshold goes into `ANALYSIS_CONFIGURATION.largeMove.minimumCloseRatio: 1.8`, and both bounds are inclusive.

Each available line lists its Large One-Session Moves within the analyzed window as `largeMoves: [{ sessionDate, closeRatio }]`, where `closeRatio` is the raw `close_i / close_{i−1}` so its direction is visible. Every Event carries `coincidesWithLargeMove`, which is `true` when its session is flagged and `false` otherwise.

The flag is descriptive. It says that the session moved by a factor large enough to be a corporate action, and nothing more. It never hides the line, removes an Event or claims that a corporate action happened. A reader of an Event marked this way should ask whether the move was real before reading anything into it.

**Why ln 1.8.** In the research's two years over 173 lines, ln 1.8 flags three line-sessions: BYMA (corrected by this change), MRNA 2026-08-19 and LAC 2025-09-24, both real news. The first dry run through 2026-10-07 then flagged ETHA's reverse split on the day it reached the data, which is how it was found and added to the list. The largest market-wide move, the 2025-10-27 midterm rally, was ×1.47 in dollars, so no macro day is flagged. ln 2 would have missed BYMA's 1:1 distribution, which landed at ×0.52, and ln 1.5 would add the speculative SPCE and LAR swings. The research measured dollars and pesos; at this threshold they flag the same sessions. The flag uses the dollarized close because that is the series the Events are computed on.

### Versions

- `ANALYSIS_CONFIGURATION.version` becomes `3`: corrections change the bars every result is computed from, and the flag adds a new reading.
- The snapshot `schemaVersion` becomes `3`, and its key prefix `analysis-snapshots/v3/`. Available entries gain `largeMoves` and `corporateActions`, and Events gain `coincidesWithLargeMove`.

### Documentation

- [ADR 0009](../../../docs/adr/0009-correct-confirmed-unadjusted-corporate-actions.md) records the exception to ADR 0007. It is a new ADR rather than an amendment, because ADR 0007 still holds for everything the provider adjusts and the exception has its own evidence and trade-offs.
- Decision 4 of `handle-provider-adjusted-history` is updated with the BYMA and NOW evidence.
- `CONTEXT.md` gains **Corporate Action** and **Large One-Session Move**.

## Trade-offs

- **The list is manual.** A corporate action that nobody has added is not corrected. It is flagged when its factor reaches ×1.8, and it is not even flagged below that: a 5-for-4 split (factor 0.8) moves the price by ×0.8. The flag catches the common factors, 2 and above.
- **Two false alarms in two years.** MRNA and LAC are flagged although they were real. That is acceptable for a flag whose purpose is to ask a question, not to change results.
- **Corrected prices are not traded prices**, the same cost ADR 0007 accepts for cash distributions. BYMA's swing levels before 2025-05-26 are half what actually traded.
- **A historical State before the ex-date uses the correction**, which is known only after the ex-date. That is the same back-adjustment convention as the provider's for cash distributions. Indicators are ratios of prices, so scaling a whole earlier segment by one factor does not change any State or Event before the ex-date; it only changes the price levels they carry, such as a Structure Break's `closePrice`.
- **The guard reads one session.** A real move of 1.25 or more on an ex-date that the provider did adjust would be corrected again. The research suggests it is rare, and the snapshot records the observed ratio so it can be checked.
- **Volume is assumed unadjusted for listed corrections.** BYMA's volume step was ×1.2 rather than the ×1.93 an unadjusted count predicts, so the data cannot confirm it. Dividing by the factor follows the definition of a share count.

## Out of scope

- Detecting or confirming Corporate Actions automatically: volume steps after the session, diffs of issuer lists.
- Volume adjustment for CEDEAR ratio changes the provider adjusted in price only, such as NOW.
- The GGAL 2025-01-17 data artifact, and dropping all-zero bars such as ARM's first ten.
