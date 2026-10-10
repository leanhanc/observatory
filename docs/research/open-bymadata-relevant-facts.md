# Open BYMADATA relevant facts

Observed on Friday 2026-10-09 against the notices list used by the official
[Open BYMADATA site](https://open.bymadata.com.ar/#/issuers-negociable-securities-information).
This note feeds a possible corporate-action watch: a daily list of issuer notices about splits,
reverse splits, share distributions and CEDEAR ratio changes for catalog symbols, each with its PDF
link, for Lean to confirm before adding an entry to the committed corporate-actions list
([ADR 0009](../adr/0009-correct-confirmed-unadjusted-corporate-actions.md)). It describes the feed.
It does not choose a design.

The interface is undocumented, so none of this is a stability guarantee. Thirty requests were made,
at least two seconds apart: the index page, the web app bundle, one pane configuration, 22 list
queries (four of them rejected with HTTP 400), and five downloads (two of them rejected with HTTP
503). Scripts and raw responses are in the git-ignored `.snapshots/research/relevant-facts/`.

## Endpoint and request body

```text
POST /vanoms-be-core/rest/api/bymadata/free/bnown/relevant-facts
```

The bundle does not hard-code the body. As with the market panels
([BYMA instrument universe](./byma-instrument-universe.md)), the page loads a server-configured pane:

```text
POST /vanoms-be-core/rest/api/bymadata/free/ui/configuration/pane/large
{"key":"issuers-negociable-securities-information"}
```

The `relevant-facts` widget in that pane declares four filters. The bundle's `getFilter` turns each
one into body fields: a `DualDateContentFilter` contributes its `keyDateFrom` and `keyDateTo` as
`yyyy-MM-dd`, a `ButtonContentFilter` contributes `key: selected`, and a `TextContentFilter`
contributes `key: value`. The widget uses virtual scrolling, so the web app sends no `page_number`.
The resulting body is:

```json
{
	"publishDate": "2026-10-05",
	"publishToDate": "2026-10-07",
	"textFilter": null,
	"filter": true,
	"dateEntryFrom": null,
	"dateEntryTo": null,
	"page_size": 5000
}
```

`page_size` is not part of the web app's body. It was added here, as it is for the panels.

| Field                          | Observed behaviour                                                                                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `publishDate`, `publishToDate` | Inclusive range on the row's `fecha`. The web app defaults to the last seven days (`WEEK_AGO` to `TODAY`).                                                                                                                  |
| Range length                   | More than 31 days returns HTTP 400 `"El rango de fechas es mayor a los 31 días"`. Thirty-day windows were accepted.                                                                                                         |
| Range depth                    | A window in March 2010 or March 2018 returns HTTP 400 `"El rango de fechas es anterior a los 3 años"`. The exact boundary was not probed. Windows back to April 2025 worked.                                                |
| `textFilter`                   | Narrows the rows. `"ETHA"` over 2026-09-10 to 2026-10-09 returned only document 501592. It matches the `referencia` text. Whether it also searches `especie` or `emisor`, and whether it is case-sensitive, was not tested. |
| `filter`                       | No observed effect. `true` and `false` returned the same 41 rows for 2026-10-06.                                                                                                                                            |
| `dateEntryFrom`, `dateEntryTo` | Declared by the pane with an empty key. Sent as `null`. Not tested.                                                                                                                                                         |
| `page_size`                    | Without it the response reports `page_size: 250`. With `5000`, every 30-day window came back in one page, the largest with 1,658 rows.                                                                                      |

The response is:

```json
{
	"content": {
		"page_number": 1,
		"page_count": 1,
		"page_size": 5000,
		"total_elements_count": 137
	},
	"data": [
		{
			"especie": "",
			"fecha": "2026-10-06 15:28:24.0",
			"tipoArchivo": "pdf",
			"descarga": 501592,
			"referencia": "Hecho Relevante de Cedear - ETHA - Ishares Ethereum Trust - Anuncio de Reverse Stock Split",
			"emisor": "Caja de Valores S.A."
		}
	]
}
```

`fecha` is a local wall-clock publication timestamp with no zone. Every row in the crawl had
`tipoArchivo: "pdf"`. A client should compare `data.length` with `total_elements_count`, as the
panel adapter does, and reject a paginated or incomplete response.

A daily run needs one request: a window covering the last few days, so a notice published after the
previous run's cutoff, or on a non-trading day, is not missed. The window can overlap because
`descarga` identifies a row.

## Volume

About 1,000 to 1,650 rows are published per 30 days. The crawl stored 17,167 distinct rows from
2025-04-01 to 2025-05-31 and from 2025-10-09 to 2026-10-09. June to early October 2025 was not
fetched.

The most common title prefixes in that set, the text before the first `" - "`, were:

| Rows  | Prefix                                               |
| ----- | ---------------------------------------------------- |
| 2,627 | Aviso de pago de servicios o renta de Cedear         |
| 2,250 | Aviso de pago de Obligaciones Negociables            |
| 1,705 | Aviso de pago de Fideicomiso Financiero              |
| 1,470 | Hecho relevante                                      |
| 272   | Hecho Relevante de Cedear                            |
| 126   | Informe diario sobre adquisición de acciones propias |
| 103   | Aviso de pago de dividendo en efectivo               |

Most of the feed is fixed income, trusts and assemblies. CEDEAR cash-distribution notices alone
outnumber CEDEAR corporate-event notices by ten to one.

## Coverage of the known cases

All three known cases are in the feed, from three different publishers.

| Case                     | `descarga` | `fecha`             | `especie` | `emisor`                                 | `referencia`                                                                                                                                                 |
| ------------------------ | ---------- | ------------------- | --------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ETHA reverse split       | 501592     | 2026-10-06 15:28:24 | `""`      | Caja de Valores S.A.                     | Hecho Relevante de Cedear - ETHA - Ishares Ethereum Trust - Anuncio de Reverse Stock Split                                                                   |
| ServiceNow 5-for-1 split | 483240     | 2025-12-11 13:27:09 | `BCOM`    | BANCO COMAFI S.A.                        | Hecho Relevante de Cedear - NOW - SERVICENOW INC. - Anuncia Stock Split                                                                                      |
| BYMA share distribution  | 471647     | 2025-05-21 16:32:31 | `BYMA`    | BOLSAS Y MERCADOS ARGENTINOS S.A. (BYMA) | Aviso de pago de Capitalizaciones / Dividendo en acciones - Capitalización de la cuenta Ajuste de Capital correspondiente al ejercicio cerrado el 31/12/2024 |

The three PDFs were downloaded and read:

- **501592 (ETHA).** Caja de Valores announces the underlying's reverse split. Ex-date in Argentina
  2026-10-06, CEDEAR payment 2026-10-07, ratio 5:1 unchanged, and each CEDEAR becomes 0.3333334
  CEDEAR. The notice was published at 15:28 on the ex-date itself, so it gave no advance warning.
- **483240 (NOW).** Banco Comafi announces ServiceNow's 5:1 split. Ex-date 2025-12-18, "Factor de
  ajuste: 5", and CEDEAR holders receive four additional CEDEARs per CEDEAR held. The CEDEARs follow
  the underlying: the ratio does not change. Published seven days before the ex-date.
- **471647 (BYMA).** BYMA's payment notice for the capitalization approved by the 2025-04-10
  assembly: 3,812,500,000 new shares, 100% of the capital, record date Monday 2025-05-26, credited
  from 2025-05-27. The notice does not state an ex-date. Published three business days before the
  record date.

The NOW notice resolves an ambiguity left open in
[Large one-session moves](./large-one-session-moves.md). That note could not tell whether the
provider back-adjusted NOW's prices but not its volume, or whether the issuer changed the ratio so
the price never moved. The notice says the ratio stayed the same and holders' CEDEAR count rose
fivefold. A ×0.2 price step should therefore exist in the raw series. Its absence means the provider
adjusted the price, and the volume rise is consistent with unadjusted volume. ADR 0009 calls the NOW
case a CEDEAR ratio change. By this notice it is a CEDEAR split that follows its underlying.

BYMA's April 2025 assembly notices in the feed (468502, 468504) mention only the cash dividend. The
share distribution appears only in the May payment notice.

## Who publishes what

- **Local stocks.** The issuer publishes its own notices. `especie` is the issuer's ticker, such as
  `BYMA`, `VALO` or `TECO`, and `emisor` is the company name. 3,994 rows had an empty `especie`, mostly
  bond and trust issuers without a listed share.
- **CEDEARs.** The CEDEAR program's issuer publishes, not the underlying company. Among rows whose
  title mentions "Cedear", 2,722 came from BANCO COMAFI S.A. with `especie: "BCOM"`, 232 from Caja de
  Valores S.A. with an empty `especie`, and one from BANCO MACRO S.A. with `especie: "BMA"`. The
  CEDEAR ticker is never in `especie`. It appears only inside `referencia`.

`especie` therefore names the publisher, not the instrument. `BMA` is itself a catalog symbol, so a
Banco Macro CEDEAR notice would match Macro's stock by `especie`.

## Title phrasings

`referencia` is free text typed by each publisher. The usual CEDEAR shape is
`Hecho Relevante de Cedear - <TICKER> - <NAME> - <event>`, but the crawl contains variants:

| Shape                                                      | Example                                                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Usual                                                      | Hecho Relevante de Cedear - NFLX - NETFLIX INC. - Anuncio de Stock Split (480285, double space)                   |
| Colon instead of dash before the event                     | Hecho Relevante de Cedear - SPY - SPDR S&P 500 ETF TRUST: Anuncia cambio de ratio y split (493877)                |
| Plain "Hecho relevante", company name, no ticker           | Hecho relevante - HUT 8 CORP.: Anuncia cambio de ratio y split (493878, Caja de Valores; HUT is a catalog symbol) |
| Several tickers in one notice                              | Hecho Relevante de Cedear - XLK - … - XLY - … - XLB - … - Anuncian Stock Split (482245)                           |
| No ticker or name at all                                   | Hecho Relevante de Cedear - Anuncio de Stock Dividend (480007)                                                    |
| Ticker in parentheses at the end, in a prospectus addendum | Adenda al Suplemento de Prospecto Definitivo … - Cambio de Ratio - Cedear HOWMET AEROSPACE INC (HWM) (499941)     |
| Local stock-dividend payment                               | Aviso de pago de Capitalizaciones / Dividendo en acciones - Pago de dividendo en acciones (479966, SEMI)          |

Sixteen Comafi or Caja de Valores rows used plain "Hecho relevante - <NAME>" without a ticker.

Event phrasings seen in the crawl:

- **Split:** "Anuncio de Stock Split", "Anuncia Stock Split", "Anuncian Stock Split", "Amplía
  información sobre Anuncio de Stock Split". No "desdoblamiento" appeared.
- **Reverse split:** "Anuncio de Reverse Stock Split", "Anuncia Reverse Stock Split", "Reverse Stock
  Split", "Amplía/Actualiza información sobre (Anuncio de) Reverse Stock Split", "… - Rectificativo".
  No "agrupamiento" or "consolidación" of shares appeared.
- **Ratio change:** "Anuncia cambio de ratio y split", "Informa sobre cambio de ratio", "Cambio de
  Ratio". No "modificación de ratio" appeared.
- **Share distribution, local:** "Aviso de pago de Capitalizaciones / Dividendo en acciones". No
  "pago en acciones" appeared.
- **Share distribution, CEDEAR:** "Anuncio de Stock Dividend", "Anuncio Rectificativo de Stock
  Dividend", "Anuncia Dividendo Opcional" (a scrip dividend the holder may elect).
- **Related, not price-scaling by themselves:** "Anuncio de Spin Off", "Distribución de Warrants",
  "Informa cambio de nombre y ticker", "Anuncia proceso de EXCHANGE", "Tender Offer - Take Over",
  "desliste del NYSE".

A single event is often announced more than once: UL's reverse split has seven notices from
2025-10-13 to 2025-12-12, and HON's has five.

## Keyword counts

Counts over the 17,167 crawled rows, matching `referencia` case-insensitively. "Catalog" uses a
first-pass rule: the ticker after `Cedear - ` is a catalog CEDEAR symbol, or `especie` is a catalog
stock symbol.

| Pattern                   | Rows | Catalog | Note                                                           |
| ------------------------- | ---- | ------- | -------------------------------------------------------------- |
| `split`                   | 27   | 9       | Includes reverse splits and amplifications                     |
| `reverse (stock )?split`  | 15   | 1       | ETHA; the rest are UL, HON, DD                                 |
| `cambio de ratio`         | 4    | 1       | SPY; HUT is missed by the first-pass rule                      |
| `\bratio\b`               | 4    | 1       | Same four rows. A bare `ratio` substring matches "CORPORATION" |
| `dividendos? en acciones` | 3    | 1       | BYMA, SEMI, and MORIXE's assembly decision                     |
| `capitaliz`               | 6    | 2       | One catalog hit is a VALO trust's interest capitalization      |
| `stock dividend`          | 9    | 0       | SCCO, ITUB, SBS                                                |
| `spin.?off`               | 25   | 4       |                                                                |
| `canje`                   | 26   | 0       | Bond exchanges and the Boldt tender offer                      |
| `acciones`                | 344  | 78      | Matches "transacciones", "acciones propias", assemblies        |
| `fusi[oó]n`               | 442  | 53      | Merger paperwork, not price-scaling                            |

A combined event pattern (`split`, `cambio de ratio`, `stock dividend`, `dividendos? en acciones`,
`Aviso de pago de Capitalizaciones`, `dividendo opcional`) matched 48 rows. Eleven concern catalog
lines, nine distinct events:

| Line | Notices        | Event                                    |
| ---- | -------------- | ---------------------------------------- |
| BYMA | 471647         | Share distribution, record 2025-05-26    |
| NFLX | 480285         | Stock split                              |
| XLK  | 482245         | Stock split, shared notice with XLY, XLB |
| XLE  | 483021, 483236 | Stock split                              |
| XLU  | 483022, 483064 | Stock split                              |
| NOW  | 483240         | 5:1 stock split, ex 2025-12-18           |
| SPY  | 493877         | Ratio change and split                   |
| HUT  | 493878         | Ratio change and split                   |
| ETHA | 501592         | Reverse split, ex 2026-10-06             |

Of these, only BYMA and ETHA are on the corporate-actions list. Whether the provider adjusted the
other seven was not checked here. That is the question the watch exists to raise. HUT appears in
[Provider bad bars](./provider-bad-bars.md) as one of the five lines with invalid bars, which may or
may not be related.

No notice in the crawl concerns GLW or MELI, the other two cases raised by the large-moves note.

## Matching rules

The rules below are a proposal for review, not a decision.

### Local stocks

Match when `especie` equals the stock line's symbol and `emisor` is not a CEDEAR program issuer.

Risks:

- **Series suffixes.** Catalog symbols such as `TECO2`, `TGSU2`, `TGNO4` and `YPFD` differ from the
  issuer code used in `especie`, which is `TECO` in the crawl. The rule needs a per-instrument issuer
  code, or a prefix match that is reviewed by hand.
- **One issuer, many products.** `VALO` matched a trust notice, "Primera capitalización de intereses
    - Megabono Crédito 326", because Banco de Valores is the trust's fiduciary. `BMA` is both a catalog
      stock and a CEDEAR publisher.
- **Equity words in non-equity notices.** "capitalización de intereses", "capitalización de pasivos",
  "convertibles en acciones", "Canje Voluntario de Acciones", "acciones propias".

### CEDEARs

Match when `emisor` is a CEDEAR program issuer (Banco Comafi, Caja de Valores, Banco Macro), and
`referencia`, split on `" - "`, `":"` and parentheses, contains a token equal to the CEDEAR line's
symbol.

Risks:

- **No ticker in the title.** HUT's ratio change used "HUT 8 CORP." and no ticker, and one Comafi
  stock-dividend notice names nothing. Matching the company name as a fallback would need the
  catalog to carry it, and short names would cause false positives.
- **Several tickers per notice.** The token rule handles XLK, XLY and XLB. A rule that reads only the
  first ticker would miss two of them.
- **Ticker collisions.** Short tickers such as `E`, `X`, `T`, `V`, `C` or `HUT` can equal tokens in
  names. Restricting the token search to CEDEAR program issuers limits this.
- **Ticker changes.** The feed announces them ("Informa cambio de nombre y ticker", ERJ, EBR, MMC,
  BK, BITF). A watch keyed on today's symbol misses notices published under the old one.

### Event filter

Keep a row when, besides matching a line, its `referencia` matches one of `stock split`,
`reverse stock split`, `cambio de ratio`, `stock dividend`, `dividendos? en acciones`,
`Aviso de pago de Capitalizaciones`, or `dividendo opcional`, with word boundaries.

Risks:

- **Cash distributions.** "Aviso de pago de servicios o renta de Cedear" is the largest category,
  2,627 rows, 834 of them for catalog CEDEARs. None matched the event filter, but any broader
  keyword such as "pago" or "dividendo" would pull them in, so excluding the prefix explicitly is
  safer.
- **Bare `acciones` or `ratio`.** Both match unrelated words ("transacciones", "CORPORATION").
- **Repeated notices.** One event produces several rows (announcement, rectification, updates). A
  watch would list each, or group by line and event wording.
- **Title wording that hides the event.** The ETHA title says "Reverse Stock Split", but the
  factor and ex-date are only in the PDF. A title never carries the price factor.
- **Optional dividends and spin-offs.** They change holdings without a clean price factor. Whether
  they belong in the watch is a product question.

## PDF downloads

```text
GET /vanoms-be-core/rest/api/bymadata/free/sba/download/<descarga>
```

The 200 response carried the PDF bytes with no `Content-Type` and no `Content-Disposition` header.
The web app picks the MIME type from the row's `tipoArchivo`. All three PDFs were single-page,
version 1.7 files with extractable text.

Old documents still download. 483240 (December 2025) and 471647 (May 2025, about 17 months old)
both returned their PDFs.

The same URL is already used as a `sourceUrl` in the corporate-actions list. It is a direct link to
a public PDF with no session.

## Rate limits

- **Downloads.** The first download returned 200. The next two, three seconds apart, returned HTTP
  503 with nginx's generic "503 Service Temporarily Unavailable" page, and no `Retry-After` or
  rate-limit header. Retried about 65 seconds apart, both returned 200. The web app shows "Se ha
  superado la cantidad máxima de descargas por minuto" on a status of 0 or 503. The observed limit
  is consistent with one download per minute per client, but the exact allowance was not probed.
- **List queries.** Twenty-two list queries two to three seconds apart, fourteen of them in a row,
  were all answered (200 or a 400 for a rejected range). No throttling was observed.

## Caveats

- **Partial crawl.** June to early October 2025 was not fetched, so counts cover about 14 months.
- **Titles only.** Except for the three PDFs, every finding rests on titles. Rows that mention no
  event in the title were not opened.
- **Exact limits unknown.** The three-year depth boundary, the download allowance, and the effect of
  `filter`, `dateEntryFrom` and `dateEntryTo` were not probed.
- **One sample per publisher.** Each of the three PDF layouts was read once.

## Open questions

- Did the provider adjust NFLX, XLK, XLE, XLU, SPY and HUT around their notices, as it did NOW's
  price? Each answer decides whether a list entry is needed.
- Should the watch match by company name as well as ticker, given HUT? That needs a name in the
  catalog, or a hand-kept alias list.
- Which local issuer codes correspond to `TECO2`, `TGSU2`, `TGNO4`, `YPFD` and the other suffixed
  stock symbols?
- Do Comafi and Caja de Valores publish every CEDEAR event, or only those requiring holder action?
  Is there a CEDEAR program issuer besides the three seen?
- Should spin-offs, optional dividends and warrant distributions appear in the watch even though
  ADR 0009 corrects only events with a price factor?
- ETHA's notice was published on its ex-date, mid-session. Does the watch run after the close, so
  that a same-day notice is listed before the next run analyzes the step?

## Volume adjustment around corporate actions

Checked on 2026-10-09 for the seven catalog CEDEAR events above that are not on the
corporate-actions list. This answers the first open question: did the provider adjust prices,
volume, or both? It describes the served data. It does not choose a fix.

Six notice PDFs were downloaded about 70 seconds apart, all with HTTP 200. NOW's (483240) was
reused from the earlier crawl. Histories are the cached raw Open BYMADATA responses for the 173
catalog lines through 2026-10-06, parsed with `createOpenBymadataAdapter` and dollarized with
`calculateMepRates` and `dollarizeBarHistory`. Nothing was refetched. Scripts, PDFs and outputs are
in the git-ignored `.snapshots/research/volume-adjustment/`.

### Factors and ex-dates from the notices

`F` is the share factor: CEDEARs held after the event per CEDEAR held before. An unadjusted
history would show the price falling to `1/F` and the volume rising to about `F` on the ex-date.

| Line | Notice | Publisher       | What the notice says                                                                                   | Ex-date used | F   |
| ---- | ------ | --------------- | ------------------------------------------------------------------------------------------------------ | ------------ | --- |
| NFLX | 480285 | Banco Comafi    | Underlying 10:1 split, CEDEARs follow, "Factor de ajuste: 10", ex-date 2025-11-17                      | 2025-11-17   | 10  |
| XLK  | 482245 | Banco Comafi    | Underlying 2:1 split (shared with XLY, XLB), "Factor de ajuste: 2", ex-date 2025-12-05                 | 2025-12-05   | 2   |
| XLE  | 483021 | Caja de Valores | "Stock Split de 1:1": one additional CEDEAR per CEDEAR held, +100%, ex-date and record date 2025-12-05 | 2025-12-05   | 2   |
| XLU  | 483022 | Caja de Valores | Same wording and dates as XLE                                                                          | 2025-12-05   | 2   |
| NOW  | 483240 | Banco Comafi    | Underlying 5:1 split, ratio unchanged, "Factor de ajuste: 5", ex-date 2025-12-18                       | 2025-12-18   | 5   |
| SPY  | 493877 | Caja de Valores | CEDEAR ratio 20:1 → 60:1, executed as a split crediting 2 new per CEDEAR held                          | 2026-05-29   | 3   |
| HUT  | 493878 | Caja de Valores | CEDEAR ratio 1:5 → 5:1, executed as a split crediting 24 new per CEDEAR held                           | 2026-05-29   | 25  |

Notes on the factors:

- **Two wordings for the same 2-for-1.** Caja de Valores calls XLE's and XLU's event a "Stock
  Split de 1:1", meaning one additional per one held. Comafi calls the same kind of event "2:1".
  The holding increase, +100%, is what fixes the factor.
- **SPY and HUT are pure ratio changes.** Neither notice mentions a split of the underlying. "Split"
  in their titles names the mechanism used to deliver the new CEDEARs. The ratio is written
  CEDEAR/underlying, so the factor is new ratio over old ratio:
    - SPY: 20 CEDEARs per share become 60, `60 / 20 = 3`. Each CEDEAR represents 1/60 of a share
      instead of 1/20, so its price should fall to 1/3.
    - HUT: 1 CEDEAR per 5 shares becomes 5 CEDEARs per share. One CEDEAR represented 5 shares and
      now represents 0.2, so `5 / 0.2 = 25`, matching "24 new per CEDEAR held". Its price should
      fall to 1/25.
    - No underlying split offsets either change, so the CEDEAR price factor is the full `1/F`.
- **SPY and HUT ex-dates are inferred.** Both notices are dated 2026-05-26 and give a record date
  of 2026-05-29 and a change date of 2026-06-01, but no ex-date. Both volume steps begin on
  2026-05-29, so that session is used. Using 2026-06-01 instead moves one session across the
  boundary and changes none of the conclusions below.

### What the served history shows

Each comparison uses the 20 bars before the ex-date and the 20 bars from it. "Close ratio" is the
peso close on the ex-date over the previous close. Price level and traded value use dollarized
closes. Traded value is `volume × dollarized close` per traded session, as in the liquidity gate.

| Line | F   | Close ratio | Median close after/before | Median volume after/before | Median traded value after/before | Pre-ex volumes divisible by F | Other CEDEARs with a volume step ≥ this one, same date | Reading                    |
| ---- | --- | ----------- | ------------------------- | -------------------------- | -------------------------------- | ----------------------------- | ------------------------------------------------------ | -------------------------- |
| NFLX | 10  | ×0.975      | ×0.958                    | ×6.28                      | ×5.73                            | 25 of 269 (9%)                | 0 of 137                                               | Price adjusted, volume not |
| XLK  | 2   | ×1.012      | ×1.019                    | ×2.04                      | ×2.08                            | 110 of 217 (51%)              | 9 of 137                                               | Price adjusted, volume not |
| XLE  | 2   | ×1.006      | ×1.004                    | ×2.13                      | ×2.15                            | 157 of 282 (56%)              | 8 of 137                                               | Price adjusted, volume not |
| XLU  | 2   | ×0.995      | ×0.971                    | ×1.95                      | ×1.90                            | 62 of 127 (49%)               | 11 of 137                                              | Price adjusted, volume not |
| NOW  | 5   | ×0.967      | ×0.907                    | ×27.78                     | ×25.09                           | 25 of 141 (18%)               | 0 of 144                                               | Price adjusted, volume not |
| SPY  | 3   | ×1.004      | ×0.999                    | ×3.51                      | ×3.57                            | 124 of 396 (31%)              | 3 of 151                                               | Price adjusted, volume not |
| HUT  | 25  | ×0.998      | ×1.168                    | ×9.14                      | ×10.73                           | 9 of 396 (2%)                 | 0 of 151                                               | Price adjusted, volume not |

The same pattern holds in all seven:

- **Price adjusted.** No close ratio is anywhere near `1/F` (0.1 to 0.5). The served pre-ex prices
  are already on the post-event scale.
- **Volume not adjusted, by divisibility.** Volume is an integer CEDEAR count. If the provider had
  rescaled old counts to the new unit, every pre-ex volume would be a multiple of `F`. Instead the
  share of multiples matches chance (about `1/F`) both before and after the ex-date, over 127 to
  396 bars per line. This is the strongest single piece of evidence, and the only one that does not
  depend on how much trading interest changed. It assumes the provider would rescale by
  multiplying by the integer factor; no positive example of a volume adjustment was available to
  confirm that.
- **Volume not adjusted, by level.** Every volume level rises on the ex-date by a ratio in the
  direction of `F`, and traded value rises with it, which is what an adjusted price times an
  unadjusted count produces. For NFLX, NOW, SPY and HUT the step is the largest among all CEDEARs
  on that date or close to it, and larger than any other 20/20 step on the line's own history
  (SPY's next largest is ×3.17, HUT's ×2.70, NFLX's ×4.24, NOW's ×16.23). For the three ×2 ETFs the
  level step alone is not unusual: 8 to 11 other CEDEARs had a ×2 step or more on 2025-12-05, and
  each line has had larger ones. There, divisibility carries the conclusion.
- **The size of the step is not the factor.** NFLX rose ×6.3 against 10, HUT ×9.1 against 25, NOW
  ×27.8 against 5. The level step mixes the unit change with a change in trading interest. Divided
  by `F`, the implied change in real traded value is ×0.57 for NFLX, ×0.43 for HUT, ×1.2 for SPY,
  ×1.0 to ×1.1 for the ETFs and ×5.0 for NOW. These are descriptions of the 20 sessions on each
  side, not effects of the events.

So the ADR 0009 pattern described for NOW, "the price looks adjusted and the volume does not",
holds for all seven: four underlying splits followed by the CEDEAR (NFLX, XLK, XLE, XLU, plus NOW)
and two CEDEAR ratio changes (SPY, HUT). Volume is used by no module except the liquidity gate (and
the bar-history adjustment detector, which only compares stored with fetched bars), so the gate is
where the unadjusted volume matters.

### Effect on the liquidity gate

After the ex-date, each pre-ex bar's traded value is `old count × adjusted price`, which is the
true value divided by `F`. The gate's median therefore reads low until the ex-date leaves the
125-market-session window, about six months later. For a split or a ratio increase (`F > 1`) the
error can only make a line look thinner: it can exclude a liquid line, never admit a thin one. A
reverse split that the provider adjusted the same way would do the opposite. None of the seven is
one; ETHA's reverse split was not price-adjusted at all.

The correction below multiplies pre-ex volume by `F` and leaves prices as served. The measures are
computed with `selectLiquidityWindow` and `evaluateLiquidityEligibility` from
`src/modules/liquidity-eligibility`, on the peso bars.

**Window ending 2026-10-06** (2026-04-08 to 2026-10-06, 125 market sessions). Only SPY and HUT have
an ex-date inside it, each with 35 window sessions before the ex-date.

| Line | Participation | Measured median (USD) | Corrected median (USD) | Corrected / measured | Eligible, measured → corrected |
| ---- | ------------- | --------------------- | ---------------------- | -------------------- | ------------------------------ |
| SPY  | 1.000         | 3,792,148             | 4,151,805              | ×1.09                | yes → yes                      |
| HUT  | 1.000         | 903,479               | 1,326,932              | ×1.47                | yes → yes                      |

Participation does not change, because a session counts as traded on `volume > 0`, which a factor
does not affect. Neither line is near USD 50,000 on either side. Even on the ex-date itself, when
124 of 125 window sessions were understated, SPY measured USD 1,108,003 against 3,324,010 corrected
and HUT USD 83,486 against 2,070,713: still eligible. The two entries leave the window after about
35 more market sessions, around late November 2026.

**Evaluated on every session since each ex-date**, using today's served history (whether the
provider served adjusted prices on those days is not known):

| Line | Sessions evaluated | Sessions where eligibility differs | Dates                    | Measured / corrected median on those sessions |
| ---- | ------------------ | ---------------------------------- | ------------------------ | --------------------------------------------- |
| NFLX | 217                | 44                                 | 2025-11-17 to 2026-01-22 | 0.10 to 0.17 (e.g. 19,026 vs 184,656)         |
| XLK  | 204                | 54                                 | 2026-01-05 to 2026-03-26 | 0.54 to 0.88 (e.g. 27,044 vs 50,006)          |
| XLU  | 204                | 11                                 | 2026-04-10 to 2026-04-24 | 0.83 to 0.93                                  |
| NOW  | 196                | 3                                  | 2026-06-01 to 2026-06-03 | 0.75 to 0.96                                  |
| XLE  | 204                | 0                                  |                          |                                               |
| SPY  | 90                 | 0                                  |                          |                                               |
| HUT  | 90                 | 0                                  |                          |                                               |

In every differing session the measured gate excluded the line and the corrected one admitted it.

**How large it can get in general.** For each of the 152 CEDEAR lines, the current window was
recomputed as if an event with factor `F` had its ex-date `k` sessions into the window, dividing
the volume of the `k` earlier sessions by `F`. The ratio is measured median over undistorted median:

| F   | k = 20           | k = 62           | k = 105          | k = 124 (ex-date is the evaluated session) |
| --- | ---------------- | ---------------- | ---------------- | ------------------------------------------ |
| 2   | 0.91 (0.66–1.00) | 0.71 (0.59–0.85) | 0.55 (0.50–0.69) | 0.50                                       |
| 3   | 0.88 (0.60–1.00) | 0.58 (0.45–0.81) | 0.38 (0.33–0.48) | 0.33                                       |
| 5   | 0.86 (0.53–1.00) | 0.46 (0.27–0.67) | 0.23 (0.20–0.32) | 0.20                                       |
| 10  | 0.85 (0.44–1.00) | 0.33 (0.14–0.61) | 0.12 (0.10–0.16) | 0.10                                       |

Cells give the median over lines and the range. On the ex-date the median reads `1/F` of its true
value. The distortion shrinks as the ex-date ages and is gone 125 market sessions after it. On a line
whose daily values are tightly clustered, even 20 understated sessions can move the median, which is
why the minimum at k = 20 is already well below 1. Thirty-four of the 152 CEDEAR lines currently sit between USD 25,000 and
100,000, within a factor of 2 of the threshold. Any of them with a 2-for-1 event would read below
USD 50,000 on and after its ex-date for as long as about half the window precedes the event.

### Fix options

These are inferences for review, not a decision.

- **(a) A volume-only kind in the committed list.** Each entry would multiply volume before the
  ex-date by `F` and leave prices as served. It reuses the list's sourcing and review.
    - The existing guard cannot gate it. It applies an entry only when the close ratio across the
      ex-date is within ×1.25 of the price factor; for these events the ratio is near 1, so the
      entry would report `step-not-observed` and correct nothing. That is also why listing these
      events as ordinary splits would fix neither price nor volume.
    - The guard could be inverted for this kind: apply only when the close ratio is near 1, that is,
      when the provider has visibly adjusted the price. Since listed factors are at least 1.25²
      from 1, the two conditions cannot both hold, so one entry could not be applied as both
      kinds.
    - That inverted check does not tell whether the provider has since adjusted volume as well, and
      a volume rescaled twice would overstate the line by `F`. The divisibility test above could
      serve as a volume guard with a long enough pre-ex history, but it is statistical and weak
      for `F = 2` over few bars.
    - A real move on the ex-date can hide a price step, as ADR 0009 notes. If the price was in fact
      unadjusted and the move hid it, volume and price would be on the same unit and traded value
      already correct. Multiplying volume would then overstate it.
    - Maintenance: seven events in about fourteen months among catalog CEDEARs. Each entry matters
      only for the 125 sessions after its ex-date.
- **(b) Detecting the step automatically.** A volume-level step with no price step marks NFLX, NOW,
  SPY and HUT clearly, but not the three ×2 ETFs, whose step was matched by 8 to 11 other CEDEARs on
  the same date. The large-moves note also found steps of this shape on GLW, BAK, STNE, GPRK, PAGS
  and PETR3 that were never traced to an event.
    - The observed step does not estimate the factor (×6.3 for 10, ×9.1 for 25, ×27.8 for 5), so a
      detector could flag but not correct.
    - A 20-session level comparison needs 20 sessions after the ex-date, so the step is known only
      once the worst distortion has passed. Using it on earlier sessions would be look-ahead.
    - It does not interact with the existing guard, which looks only at price.
- **(c) Ignoring it.** The error is one-sided for splits and ratio increases: lines are excluded,
  not admitted, for up to 125 sessions after an ex-date. In this history that would have excluded
  NFLX for 44 evaluated sessions, XLK for 54, XLU for 11 and NOW for 3, and changes nothing in the
  window ending 2026-10-06. The guard is unaffected. The cost grows with the number of thin lines
  near the threshold and with the factor.

### Contradictions with ADR 0009

- ADR 0009 says "CEDEAR ratio changes look different again: ServiceNow's 5-for-1 split leaves no
  step". NOW's notice describes an underlying split with the ratio unchanged, as recorded above.
  SPY and HUT are the actual ratio changes in the window, and they show the same pattern as NOW. The
  difference ADR 0009 describes is between adjusted and unadjusted events, not between splits and
  ratio changes.
- ADR 0009's "volume rises about thirtyfold" for NOW is consistent with the ×27.8 measured here, but
  only ×5 of it is the change of unit.
- ADR 0009 corrects volume only together with price. It does not cover the case seen in all seven
  events here, where the provider adjusted the price and left the volume, so traded value before
  the ex-date is understated by the factor.
- The bar-history adjustment detector's comment says volume "may differ on adjusted bars because
  splits can rescale it". In these seven events the provider did not rescale it.

### Caveats

- **One provider snapshot.** The histories are a single fetch. When the provider adjusted each
  price, and whether it ever adjusts volume later, are not known.
- **No positive control.** No event in the cache shows adjusted volume, so the divisibility test's
  expected signature (all multiples of `F`) is reasoned, not observed.
- **Seven events, all CEDEARs.** Local stocks were not checked. BYMA's share distribution was
  adjusted in neither price nor volume.
- **Window medians are descriptive.** The before/after ratios mix the unit change with changes in
  interest around each event.
