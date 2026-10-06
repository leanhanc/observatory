# BYMA instrument universe

Observed on Sunday 2026-10-04, a non-trading day, against the public endpoints used by the official
[Open BYMADATA site](https://open.bymadata.com.ar/) and against the issuers' and BYMA's own
publications. This note extends [Open BYMADATA provider observations](./open-bymadata-provider.md)
and gathers facts for a generated Instrument Catalog. It does not repeat the historical endpoint,
Continuity Data, or Trading Line mapping findings recorded there. The interface is undocumented, so
none of this is a stability guarantee.

Fifteen Open BYMADATA requests were made, at least two seconds apart. Raw responses were kept
outside the repository and are not reproduced beyond the trimmed examples below.

## How the web app finds its panels

The site is an Angular application (`main.cd077c72f0dab8d2.js`, served from
<https://open.bymadata.com.ar/>). Panel URLs are not hard-coded in the bundle. Each page renders a
server-configured "pane" by key. The bundle maps routes to keys, for example
`local-stocks-adrs` and `nyse-nasdaq-cedears`. It then loads the pane with:

```text
POST /vanoms-be-core/rest/api/bymadata/free/ui/configuration/pane/large
{"key":"local-stocks-adrs"}
```

The response lists every widget the free site can show, each with its data `url`, refresh rate,
filters, and columns. The response also embeds account metadata for the user who authored the
layout. That metadata has nothing to do with Observatory and is not reproduced here.

The free table endpoints listed there, all under `/vanoms-be-core/rest/api/bymadata/free`, are:

| Group                    | Paths                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equities and CEDEARs     | `leading-equity`, `general-equity`, `cedears`, `etf`, `corporate-governance`, `corporate-governance-plus`                                                                                                                                                                                                                                   |
| Fixed income and finance | `public-bonds`, `negociable-obligations`, `lebacs`, `linked-bond`, `green-bond`, `social-bond`, `sustainability-bond`, `senebi-bonds`, `senebi-letras`, `senebi-obligaciones-negociables`, `bnown/financial-trusts`, `cauciones`, `plazo-lote`, `loans-liquidation`, `loans-short-sale`, `index-bonds`, `bnown/seriesHistoricas/iamc/bonos` |
| Derivatives              | `options`, `index-future`                                                                                                                                                                                                                                                                                                                   |
| Indices and dashboard    | `index-price`, `getBymaIndexsMep`, `main-ups-downs`, `total-negotiated`, `getColocacionesPrimarias`                                                                                                                                                                                                                                         |
| Notices                  | `bnown/relevant-facts`, `bnown/byma-ads`                                                                                                                                                                                                                                                                                                    |

The bundle also calls per-symbol endpoints, including
`bnown/fichatecnica/especies/general` (described below) and a cross-panel
`get-market-data`. It also calls `instrumentproduct/instrument/all-instrument-select` and
`instruments-for-header-search`, which were not requested in this session.

There is no `panel-general` path. The general panel is `general-equity`. The `local-stocks-adrs`
pane places `leading-equity` and `general-equity` side by side.

Source: [pane configuration endpoint](https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/ui/configuration/pane/large),
[web app bundle](https://open.bymadata.com.ar/main.cd077c72f0dab8d2.js).

### Request parameters the web app uses

The pane configuration declares three toggles for `leading-equity`, `general-equity`, `cedears`, and
`etf`: `T0` (off by default), `T1` (on), and `excludeZeroPxAndQty` (on). The bundle's
`get-market-data` call uses the same body shape, with `page_number: 1` and `page_size: 5000`.

The web app's HTTP interceptor adds `Token` and `Options` headers (`Options: renta-variable` for
these panels). Every request in this session omitted both headers and still succeeded.

Settlement codes come from the bundle's own mapping: `"ci"` → `"1"`, `"24hs"` → `"2"`,
`"48hs"` → `"3"`. Live responses matched this mapping. `T1: true` returned only
`settlementType: "2"` rows, and a `leading-equity` request with only `T0: true` returned the same 21
symbols with `settlementType: "1"`. The inference is that `T0` selects CI and `T1` selects 24HS.

The web app's own label file, <https://open.bymadata.com.ar/assets/api/langs/es.json>, confirms
this: it labels `T0` "Cdo", `T1` "24hs" and `T2` "48hs", and settlement codes `"1"`, `"2"` and
`"3"` as "Cdo", "24hs" and "48hs". A `leading-equity` request with only `T2: true` returned
`total_elements_count: 0` and an empty `data` array, consistent with the same file's notice that
market settlement is now only CI and 24 hours.

## Panel response shape

All four equity-like panels return the same record fields. `leading-equity` and `general-equity`
wrap the records in `{content, data}` with `content.total_elements_count`. `cedears` and `etf`
return a bare array.

Trimmed example from `cedears`, Sunday 2026-10-04:

```json
{
	"symbol": "AAPLD",
	"settlementType": "2",
	"denominationCcy": "USD",
	"securityType": "CD",
	"securitySubType": "",
	"market": "BYMA",
	"openingPrice": 0.0,
	"tradingHighPrice": 0.0,
	"tradingLowPrice": 0.0,
	"closingPrice": 0.0,
	"previousClosingPrice": 0.0,
	"volume": 0.0,
	"vwap": 0.0
}
```

Also present: `bidPrice`, `offerPrice`, `quantityBid`, `quantityOffer`, `trade`, `tradeVolume`,
`volumeAmount`, `numberOfOrders`, `imbalance`, `settlementPrice`, `previousSettlementPrice`,
`description`, and `securityDesc`. `description` and `securityDesc` were empty strings. The
pane's column list names a `tradeHour` column, but no record contained that field on this day.

No record carries an ISIN, issuer, underlying, ratio, or panel-membership flag.

| Field             | Observed values                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `securityType`    | `CS` on `leading-equity` and `general-equity`; `CD` on `cedears` and `etf`                          |
| `securitySubType` | `M` on all 21 `leading-equity` rows, `G` on all `general-equity` rows, empty on `cedears` and `etf` |
| `denominationCcy` | `ARS`, `USD` (MEP, the `D` lines), `EXT` (cable, the `C` lines)                                     |

Inference: `M` and `G` mark the Merval and General panels. The bundle does not label them.

### Settlement terms and currencies

Each settlement term and currency is a separate row with its own symbol. Settlement is a request
filter and a row field, not part of the symbol. Currency is encoded in the symbol and repeated in
`denominationCcy`.

The symbols cannot be derived reliably from the peso symbol:

- `AAPL` → `AAPLD` / `AAPLC`, but `ABEV3` → `ABE3D` / `ABE3C` and `ACHHY` → `ACHYD` / `ACHYC`.
  Inference: the symbol appears limited to five characters.
- Short tickers are padded with dots: `BMA` → `BMA.D`, `BMA.B`; `BA.C`; `BA..B`; `C...B`.
- Leading-panel lines keep only their peso 24HS row in `leading-equity`. Their `D`, `C`, and other
  variants (`GGALD`, `GGALC`, `GGALB`, `GGALX`) appear in `general-equity`. A catalog generator
  must therefore join both panels to assemble one Argentine stock's Trading Lines.

Unexplained suffixes:

- `B` suffix lines, for example `AAPLB`, `GGALB`, and `AAPDB`. They are denominated in ARS. The
  technical sheet for `AAPLB` returned the same ISIN (`ARDEUT116183`) as `AAPL`, so it is the same
  security on another line. No BYMA or issuer source explaining `B` was found.
- `X` suffix lines in the general panel: `GGALX`, `CARCX`, `IEBX`, `MORIX`, `PATYX`, `SAMIX`.
- Numeric variants such as `BMA.5`, `CELU5`, and `CELU6`, and a large family of `…F` symbols
  (`ALAAF`, `MELIF`, `VALFF`) on `general-equity` with `securityType: "CS"`.

Until these are explained, the generator should whitelist the plain peso, `D`, and `C` lines rather
than ingest every row.

## Counts (24HS, 2026-10-04)

| Panel            | Rows | ARS rows | USD (`D`) | EXT (`C`) | Notes                                                                                        |
| ---------------- | ---: | -------: | --------: | --------: | -------------------------------------------------------------------------------------------- |
| `leading-equity` |   21 |       21 |         0 |         0 | Peso lines only                                                                              |
| `general-equity` |  413 |      237 |       100 |        76 | 237 ARS rows include 37 `B` and 6 `X` variants; 194 remain                                   |
| `cedears`        | 1621 |      687 |       474 |       460 | 687 ARS rows include 164 `B` variants (counting dot-padded ones such as `C...B`); 523 remain |
| `etf`            |   36 |       18 |         9 |         9 | 9 ETFs × {base, `B`, `C`, `D`}; all 36 symbols also appear in `cedears`                      |

The 21 leading-panel peso lines were ALUA, BBAR, BMA, BYMA, CEPU, COME, ECOG, EDN, GFVA, GGAL,
LOMA, METR, PAMP, SUPV, TECO2, TGNO4, TGSU2, TRAN, TXAR, VALO, and YPFD.

The 194 remaining general-panel peso rows are not all Argentine companies. They include foreign
issuers listed directly on BYMA, such as APBR, PETR, TS, TEF, STD, and REP, plus the
unexplained `…F` family. Among the 523 remaining CEDEAR peso rows, two keep a dot in the ticker itself (`AKO.B`, `BA.C`), and many
`D…`-prefixed symbols (`DJNJ2`, `DABT1`) look like old or alternate series. These counts are an
upper bound on catalogable instruments, not the number of tradable companies.

The 2026-09-04 observation recorded 197 `general-equity` rows. This Sunday response had 413. That
difference is unexplained. See open questions.

## Full membership, zero rows, and paging

- With `excludeZeroPxAndQty: false`, every panel returned rows on a Sunday, but every numeric field
  in every row was `0`. That includes `closingPrice` and `previousClosingPrice`. On a weekend, a
  panel does not show the last trading session's data.
- With `excludeZeroPxAndQty: true`, the same `general-equity` request returned
  `total_elements_count: 0` and `data: []`. The flag drops rows without price and quantity. On a
  non-trading day that is every row. The web app enables it by default, so the public site
  presumably shows empty tables on weekends. This is an inference.
- Inference: `false` returns the panel's listed lines regardless of trading activity, so it is the
  setting to use for membership. Whether it also lists lines suspended for a whole session was not
  observed.
- With `page_size: 5000`, every response was a single page, with `page_count: 1` where reported.
  The earlier note's rule still applies: compare the row count with `total_elements_count`.
- Panel snapshots fetched on a weekend are usable for membership but not for prices.

## Leading panel and general panel membership

- BYMA identifies the leading panel with the S&P Merval. Describing the dollarized index, BYMA
  writes that it "refleja el desempeño del panel líder local"
  ([BYMA newsroom, 2026-05-06](https://www.byma.com.ar/en/newsroom/sp-merval-usd-una-nueva-forma-de-seguir-el-principal-indice-del-mercado-accionario-argentino)).
- The S&P Merval and the S&P BYMA General Index are co-administered by BYMA and S&P Dow Jones
  Indices. They were moved to S&P DJI methodology after a 2018 consultation. That consultation
  proposed:
    - an S&P Merval universe of domestic shares only;
    - liquidity screens, including MDVT and a minimum share of trading days;
    - a minimum of 20 constituents;
    - semiannual composition rebalances effective after the third Friday of March and September,
      with quarterly share and weight updates in June and December.

    For the General Index, the same document proposed domestic shares traded on at least 20% of the
    sessions in the prior 12 months
    ([BYMA/S&P DJI consultation, 2018-11-05](https://data-widgets.byma.com.ar/wp-content/uploads/2018/11/BYMA-Methodology-Consultation-Spanish-11.5.2018-1.pdf)).
    The current S&P DJI methodology PDF returned HTTP 403 to automated requests, so the adopted
    rules were not verified from it.

- BYMA's official account announced the March 2025 semiannual S&P Merval changes, effective
  2025-03-25, and a 22-stock composition
  ([BYMA on X](https://x.com/BYMAOficial/status/1901717905760305564),
  [BYMA on X](https://x.com/BYMAOficial/status/1904985958266860005)).
- Per-symbol membership is exposed by the technical-sheet endpoint. `GGAL` returned `"lider":"Si"`
  together with ISIN, issuer, share class, and `insType: "EQUITY"`
  ([technical sheet endpoint](https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/bnown/fichatecnica/especies/general),
  POST `{"symbol":"GGAL"}`).
- Inference: membership changes roughly twice a year, after the March and September rebalances.
  Today's 21 lines do not match the 22-stock count from March 2025, which is consistent with the
  composition having changed since. A generator should therefore treat the `leading-equity`
  response as the membership source, not a hand-kept list, and expect changes around those
  months.
- The general panel's own BYMA definition was not found in a primary source. Observed behavior:
  `general-equity` holds every non-leading `CS` line, plus the non-peso and variant lines of the
  leaders.

## CEDEARs

### What Open BYMADATA provides

Per symbol, `bnown/fichatecnica/especies/general` returns the underlying's market and ticker, and
the issuer, but no conversion ratio:

```json
{
	"codigoIsin": "ARDEUT116183",
	"tipoEspecie": "Cedears",
	"mercadoOrigen": "NASDAQ",
	"simboloMercado": "AAPL",
	"denominacion": "APPLE INC.",
	"emisor": "BANCO COMAFI S.A.",
	"fechaAutorizada": "2010-07-08 00:00:00.0",
	"valorRepresentado": "ordinarias",
	"maxAdmitido": 1799612000
}
```

`SPY` returned `mercadoOrigen: "NYSE Arca"` and `emisor: "Caja de Valores S.A."`. Its
`valorRepresentado` was empty, so the sheet does not distinguish an ETF from a share. The endpoint
takes one symbol per request, so enriching about 523 CEDEARs would take hundreds of paced requests.

### Official ratio sources

CEDEARs have more than one issuer. At least Banco Comafi and Caja de Valores issue them, and each
publishes its own programs. No consolidated BYMA or CNV machine-readable list was found.

- **Banco Comafi** publishes an XLSX titled "LISTA TOTAL DE CEDEARS AL 30.9.2026" from
  [its programs page](https://www.comafi.com.ar/custodiaglobal/programas.aspx)
  ([XLSX](https://www.comafi.com.ar/custodiaglobal/Multimedios/otros/14779.xlsx?v=190),
  `Last-Modified: 2026-10-01`). It is machine-readable, with one sheet and 362 numbered programs.
    - **Columns:** program name, local ticker ("Identificación Mercado"), Caja de Valores code,
      CEDEAR ISIN, underlying ISIN, CUSIP, ratio ("Ratio Cedear/Acción ó ADR", for example `20:1`),
      maximum amount, trading market, underlying type ("Valor Subyacente"), payment frequency,
      country, industry, and eligible market.
    - **Footnotes:** `**` marks a program disabled for issuance, and `***` one disabled for issuance
      and cancellation.
    - **Data quality:** tickers have trailing spaces (`"ABBV "`). Some tickers differ from BYMA's
      (`BRK/B` vs `BRKB`, `BAYN GR` vs `BAYN`). Labels are inconsistent (`Acción ordinaria` /
      `Accion ordinaria`, `NYSE` / `NYSE `), and country values mix names with codes (`UR`, `GB`,
      `SW`).
    - **Second download:** the page's other download (`17061.xlsx?v=91`) has the same 362 rows
      and differed only in the `CCL` row.
- **Coverage gap:** 335 of the 523 remaining BYMA CEDEAR peso symbols matched a Comafi ticker
  after trimming whitespace, and 188 did not. Some of the 188 are naming mismatches. Others belong to Caja de Valores
  programs (SPY, QQQ, DIA, and similar ETFs) or are old series.
- **Caja de Valores** publishes a CNV-authorized prospectus PDF for each batch of programs. For
  example, the [2025-09-23 prospectus](https://cajadevalores.com.ar/uploads/CVSA_23_09_2025.pdf)
  covers 3 ETF programs authorized by RESFC-2025-23284-APN-DIR#CNV. Ratios appear in tables inside
  each PDF. A consolidated Caja de Valores list was not found.

### How ratio changes are announced

The issuer announces, BYMA relays, and Caja de Valores credits:

1. The issuer notifies holders that it has asked the CNV to change ratios. Comafi did this on
   2023-11-30 for 30 programs, for example MMM from 5:1 to 10:1
   ([Comafi notice](https://www.comafi.com.ar/custodiaglobal/Multimedios/pdfs/11646.pdf?v=3)).
2. After CNV authorization, here RESFC-2023-22529-APN-DIR#CNV of 2023-11-29, the issuer
   announces the dates to the exchange
   ([Comafi to BCBA, 2024-01-08](https://www.comafi.com.ar/custodiaglobal/Multimedios/pdfs/11879.pdf)):
    - **Ex-date (2024-01-24):** BYMA trading uses the new ratios from this date.
    - **Record date (2024-01-25).**
    - **Settlement (2024-01-26):** Caja de Valores credits the additional CEDEARs.
3. BYMA publishes an operational notice. For example, on 2020-10-19 it announced ratio changes for
   39 programs, with trading at adjusted prices from 2020-10-22
   ([BYMA newsroom](https://www.byma.com.ar/en/newsroom/byma-announces-news-for-cedears)).

Ratios can also be fractional, meaning one CEDEAR represents several shares. ADGO and BIOX moved
from `1:2` to `1:1` in the same batch.

Inference for ADR-0005 and ADR-0007: a ratio change is a discontinuity in the peso series on the
ex-date. The catalog cannot detect it from the panel. It would need the issuer's announcements, or
a diff of the issuer XLSX between runs.

### Underlyings that are not US common stock

The catalog currently requires a CEDEAR's underlying to be a `stock`. Comafi's 362 programs break
down as follows:

- **Underlying type:**
    - 189 `Common Stock` and 47 `Acción ordinaria` / `Accion ordinaria`;
    - 88 `ADR`, including BABA, BIDU, TSM, VALE, SAP, SONY, ABEV, and VIST;
    - 36 `ETF`, including IVV, XLK, XLV, IBIT, GDX, SLV, USO, and IWDA;
    - 1 `Acciones registradas en NY`;
    - 1 `Corp`.
- **Non-US trading markets:** XETRA (`BAYN GR`, `MBG GR`, `BSN GR`, `ADS`), the London Stock
  Exchange (`IWDA`), and OTC US (11, for example `NSANY`, `SIEGY`, `TELFY`).
- **Country of origin:** 230 United States; the rest include Brazil 19, United Kingdom 13,
  China 10, Canada 10 (plus 2 listed as `Canada`), Mexico 8, and Japan 7.

The BYMA `etf` panel lists 9 ETFs (ARKK, DIA, EEM, EWZ, IWM, QQQ, SPY, XLE, XLF) whose programs
are not in Comafi's list. SPY's technical sheet names Caja de Valores as issuer. Some ETFs track
commodities (SLV, USO, CORN, SOYB) or bitcoin (IBIT), so "underlying stock" is not a universal
shape.

## Rate limits and terms of use

- The web app states that open access provides local market data "con 20 minutos de demora" and
  that this access "es abierto e ilimitado" (FAQ text in the
  [bundle](https://open.bymadata.com.ar/main.cd077c72f0dab8d2.js)). Real-time data requires paid
  plans. No published request quota, redistribution clause, or API terms for the free endpoints
  were found.
- Responses carried no rate-limit headers. They did carry
  `cache-control: no-cache, no-store, max-age=0, must-revalidate` and `x-server-id: OPEN-BYMADATA-03`.
- Inference: "unlimited" describes access for site visitors, not permission for automated or
  redistributed use. BYMA's paid [Market Data products](https://www.byma.com.ar/byma-apis) remain
  the licensed route. Their terms have not been checked against Observatory's use.

## Open questions

- Why `general-equity` returned 197 rows on 2026-09-04 and 413 on this Sunday. On trading days, the
  panel might list only lines with a book or quote, or its membership might have changed. One
  trading-day sample with `excludeZeroPxAndQty: false` would settle this.
- What the `B`, `X`, numeric (`5`, `6`), and `…F` suffixes mean, and whether `B` lines are a
  separate trading segment that Observatory should ignore.
- Whether the Open BYMADATA ISIN can join BYMA symbols to Comafi rows where tickers differ. One
  technical-sheet request per symbol is needed for that.
- Where Caja de Valores, and any other issuer, publishes a consolidated machine-readable program
  list with ratios.
- Which rules the current S&P DJI methodology actually uses. The PDF was not retrievable from
  this environment.
- Whether `excludeZeroPxAndQty: false` lists lines suspended for a full session, and how delisted
  lines disappear.
