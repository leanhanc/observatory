# Add the leading-panel stocks to the Instrument Catalog

## Why

The Analysis Run analyzes the BYMA peso line of every stock and CEDEAR in the Instrument Catalog, but the catalog holds only Galicia, YPF and the Apple CEDEAR. BYMA's leading panel (the S&P Merval constituents, see `docs/research/byma-instrument-universe.md`) is the natural first universe of Argentine stocks: liquid, domestic, and a list BYMA itself maintains. Membership rebalances about twice a year, after the March and September index reviews, so a hand-kept list would drift. The list should come from the provider and be reviewed like code.

## What Changes

- A catalog generator, `bun run generate:catalog` (`scripts/instrument-catalog-generator.ts`), requests the `leading-equity` panel from Open BYMADATA with `{"excludeZeroPxAndQty":false,"T1":true,"T0":false,"page_size":5000}`. With `excludeZeroPxAndQty: false` the panel lists its lines on any day, including weekends when every price is zero, so membership is readable whenever the generator runs.
- It keeps the peso 24-hour rows (`denominationCcy: "ARS"`, `settlementType: "2"`) and merges them into `instrument-catalog.v1.json`:
    - A stock that already owns a BYMA ARS Trading Line with the row's symbol is kept unchanged, with its Instrument and Trading Line ids. `galicia-stock` (`GGAL`) and `ypf-stock` (`YPFD`) keep their ids, and so do `apple-stock`, `apple-cedear` and `al30-bond`.
    - A leader without such a stock is added as a `stock` Instrument with one BYMA ARS Trading Line.
    - Nothing is deleted. Every catalog stock with a BYMA ARS line whose symbol is not in the panel is reported for a person to decide on. While the catalog's BYMA ARS stocks are exactly the leaders, as they are after this change, that report lists the departed leaders. Once general-panel or hand-added local stocks exist, it lists them too, so it stops identifying departures on its own until panel membership is recorded.
    - **Symbol changes.** When one run both adds stocks and reports absent ones, one of the added stocks may be an absent company trading under a changed symbol (for example `TGN` replacing `TGNO4`). The generator cannot tell, so it prints a reminder. The reviewer checks before committing, and if it is a symbol change, updates the existing Trading Line's symbol instead of keeping a second Instrument for the same company.
    - Existing Instruments keep their order and new ones are appended in symbol order, so the output is deterministic and re-running on an unchanged panel changes nothing.
- The merged catalog is validated with the catalog's own validation before it is written. A malformed, paginated, incomplete or empty panel response, a symbol that is not uppercase letters, digits and dots, a symbol listed twice, or a merge that would produce an invalid catalog fails and writes nothing. A successful write goes to a temporary file in the same directory and is then renamed over the catalog.
- The generated JSON is committed data. The runtime still loads only the stored file and never calls the generator.

### Identifiers for new Instruments

The panel's `description` and `securityDesc` fields are empty strings, and no record carries an issuer name, so a name-based id such as `galicia-stock` cannot come from the panel. Names are available one symbol at a time from the technical-sheet endpoint, but they are free text (`"BANCO DE GALICIA Y BUENOS AIRES S.A.U."`) that would still need a hand-chosen short form. New ids therefore come from the BYMA symbol: lowercased, with any run of characters outside `a-z0-9` replaced by `-` and any leading or trailing `-` removed, plus `-stock`. The Trading Line id is the Instrument id plus `-byma-ars`. For example `TECO2` becomes `teco2-stock` with line `teco2-stock-byma-ars`, a dot-padded `BMA.` would become `bma-stock`, and `BYMA` (the exchange operator's own share) becomes `byma-stock` with line `byma-stock-byma-ars`.

Symbol-derived ids are stable for as long as the symbol is, and they are deterministic. The cost is a mixed convention: the two original stocks keep their name-based ids (`galicia-stock`, `ypf-stock`) because Trading Line ids must stay stable for stored Bar Histories and snapshots. The id names the Instrument; the symbol remains the Trading Line fact, so a future symbol change is a catalog edit, not an id change.

### Leader is not stored

Panel membership is not recorded in the catalog. For now every generated stock is a leader. The catalog describes Instruments, not provider panels or acquisition cadence.

## Spec changes

- The "initial catalog" requirement listed the exact five v1 Instruments. It becomes a rule: the original Instruments keep their ids and lines, and the repository catalog contains a stock with a BYMA ARS Trading Line for every peso 24-hour row of the leading panel at the time the catalog was generated.
- Because the catalog does not record membership, the requirement's leading-panel part is checked as a property of generation: re-merging the committed catalog with a panel built from its own BYMA ARS stock symbols adds nothing, reports nothing, and reproduces the committed file byte for byte.
- A new requirement describes the generator's merge contract.

## Scope

- Only the leading panel's peso 24-hour lines. No `D`, `C`, `B` or `X` lines and no CEDEARs.
- No schema change. No new field for panel membership, issuer name or settlement.
- No change to the Analysis Run. It picks up the new stocks because it already analyzes every catalog stock's BYMA ARS line.

## Follow-ups

- **Record panel membership.** Needed before any non-leader local stock enters the catalog, because the absent-stock report only identifies departed leaders while every catalog BYMA ARS stock is a leader. Then update leaders daily and other panels every two or three days.
- **CEDEAR selection.** Waits on the liquidity-eligibility decision.
- **General panel.** `general-equity` and its suffix families (`B`, `X`, numeric, `…F`), which are not yet understood.
- **CEDEAR underlyings.** A likely ADR to replace "a CEDEAR references a stock Instrument" with a descriptive underlying (market, ticker, kind), because underlyings include ADRs, ETFs, non-US shares and IBIT.
- **Ratios, update cadence and the large-move safeguard** from `handle-provider-adjusted-history`.
- **Departed leaders.** Decide what happens to a stock that leaves the panel: keep analyzing it, or remove it and its stored history by hand.
- **GFVA has no provider history.** GFVA is a current leader, but the history endpoint returns `no_data` for `GFVA 24HS`, so the Analysis Run correctly reports the line unavailable. Open question: is the series under another name, or is it a recent listing? The generator stays panel-only and does not call the history endpoint.
- **TGNO4's 2025-01-17 bar.** The provider's bar closes below its own low (low 2795.808, close 2762.7). That is beyond the 1% range-repair rule, so the line is correctly left invalid. GGAL's known range artifact falls on the same date, which suggests a provider-wide artifact. Survey 2025-01-17 across all leaders before changing any threshold, and never raise the threshold just to admit TGNO4. The bar leaves the roughly two-year window around early 2027.
