## ADDED Requirements

### Requirement: committed matching rules

The corporate-action-watch module SHALL load `src/modules/corporate-action-watch/data/corporate-action-watch-rules.v1.json` and SHALL fail to load when it is invalid. The file SHALL hold exactly:

- `schemaVersion: 1`;
- `cedearProgramIssuers`: a non-empty list of distinct `emisor` names of CEDEAR program issuers;
- `stockIssuerCodes`: a map from a stock line's symbol to the `especie` its issuer publishes under, for symbols that differ from it;
- `cedearNameAliases`: a map from a name used in titles instead of a ticker to the CEDEAR symbol it stands for;
- `eventPhrases`: a non-empty list of distinct, lowercase event phrases;
- `excludedTitlePrefixes`: a list of title prefixes whose notices are never kept.

Symbols, issuer codes and alias targets SHALL be BYMA symbols: uppercase letters, digits and dots, such as `BA.C`. No string SHALL be empty or have leading or trailing spaces.

The committed rules SHALL name the program issuers `BANCO COMAFI S.A.`, `Caja de Valores S.A.` and `BANCO MACRO S.A.`; the issuer codes `TECO2` → `TECO`, `TGSU2` → `TGSU`, `TGNO4` → `TGNO` and `SUPV` → `GSUP`; the name alias `HUT 8 CORP.` → `HUT`; the phrases `stock split`, `reverse stock split`, `cambio de ratio`, `dividendo en acciones`, `dividendos en acciones`, `aviso de pago de capitalizaciones`, `stock dividend` and `dividendo opcional`; and the excluded prefix `Aviso de pago de servicios o renta de Cedear`. Bare `acciones`, `ratio` and `capitalizaciones` SHALL NOT be phrases: they match "transacciones", "CORPORATION" and capitalizations of interest.

GFVA has no observed issuer code and SHALL NOT be given a guessed one; its notices are not matched.

#### Scenario: the committed rules load

- **WHEN** the committed rules are loaded
- **THEN** they contain the three program issuers, the four issuer codes, the HUT alias, the eight phrases and the excluded prefix

#### Scenario: invalid rules are rejected

- **WHEN** a rules value has an uppercase phrase, a lowercase issuer code, an empty program issuer list, a duplicate phrase or an extra field
- **THEN** validation fails with an issue at that field

### Requirement: the rules fit the analyzed lines

The module SHALL expose a check of the rules against the analyzed Trading Lines that throws an error naming each problem when a `stockIssuerCodes` key is not an analyzed stock's symbol, a `cedearNameAliases` target is not an analyzed CEDEAR's symbol, or two analyzed stocks resolve to the same issuer code. A rule for a line that is not analyzed would never match, and a shared issuer code would report every notice on two lines.

#### Scenario: the committed rules fit the committed catalog

- **WHEN** the committed rules are checked against the analyzed lines of the committed catalog
- **THEN** the check passes

#### Scenario: rules that do not fit

- **WHEN** an issuer code is keyed by a symbol that is not an analyzed stock, an alias targets a symbol that is not an analyzed CEDEAR, or an issuer code equals another analyzed stock's
- **THEN** the check throws an error naming that symbol or code

### Requirement: notices are matched to analyzed lines by title and publisher

The module SHALL expose a pure function that takes relevant-facts notices, the analyzed Trading Lines with their symbol and instrument type (`stock` or `cedear`), the committed Corporate Action list and the rules, and returns the candidates.

A notice SHALL be kept only when its title contains an event phrase as whole words, case-insensitively, with any run of whitespace in the title matching a phrase's single space, and its title does not start, case-insensitively, with an excluded prefix.

A kept notice SHALL match a stock line when its `especie` equals the line's issuer code, which is the line's entry in `stockIssuerCodes` or else its symbol, after trimming the `especie`, unless the notice is a CEDEAR program notice: its `emisor` is a program issuer and its title contains `Cedear`, case-insensitively, or has a piece, split as below, equal to an analyzed CEDEAR's symbol or a name aliased to one. Banco Macro publishes CEDEAR notices under `especie` `BMA`, its own stock symbol; its own notices do neither.

A kept notice SHALL match a CEDEAR line only when its `emisor` is a program issuer, compared case-insensitively after trimming. The title SHALL be split on `" - "`, `":"`, `"("` and `")"`, and each piece trimmed. The notice SHALL match when a piece equals the CEDEAR line's symbol, or equals a name alias of that symbol, exactly. A notice MAY match several lines.

#### Scenario: ETHA's reverse split

- **WHEN** Caja de Valores publishes `Hecho Relevante de Cedear - ETHA - Ishares Ethereum Trust - Anuncio de Reverse Stock Split` with an empty `especie`
- **THEN** it matches the ETHA CEDEAR line

#### Scenario: NOW's split

- **WHEN** BANCO COMAFI S.A. publishes `Hecho Relevante de Cedear - NOW - SERVICENOW INC. - Anuncia Stock Split` with `especie` `BCOM`
- **THEN** it matches the NOW CEDEAR line

#### Scenario: a ticker before a colon

- **WHEN** Caja de Valores publishes `Hecho Relevante de Cedear - SPY - SPDR S&P 500 ETF TRUST: Anuncia cambio de ratio y split`
- **THEN** it matches the SPY CEDEAR line

#### Scenario: a name alias

- **WHEN** Caja de Valores publishes `Hecho relevante - HUT 8 CORP.: Anuncia cambio de ratio y split`
- **THEN** it matches the HUT CEDEAR line

#### Scenario: several tickers in one notice

- **WHEN** a Comafi notice names XLK, XLY and XLB and announces a stock split
- **THEN** it matches each of those CEDEAR lines that is analyzed

#### Scenario: a suffixed local stock

- **WHEN** TELECOM ARGENTINA S. A. publishes `Aviso de pago de Capitalizaciones / Dividendo en acciones - Pago de dividendo en acciones` with `especie` `TECO` (a relabeled fixture: the title is SEMI's notice 479966)
- **THEN** it matches the TECO2 stock line
- **AND** the same title with `especie` `TECO2` matches no line

#### Scenario: Banco Macro as CEDEAR publisher and as issuer

- **WHEN** BANCO MACRO S.A. publishes, with `especie` `BMA`, a `Hecho Relevante de Cedear` stock-split notice for a ticker that is not analyzed, and its own `Aviso de pago de Capitalizaciones / Dividendo en acciones`
- **THEN** only its own notice matches the BMA stock line

#### Scenario: a Banco Macro notice naming an analyzed CEDEAR without saying Cedear

- **WHEN** BANCO MACRO S.A. publishes, with `especie` `BMA`, `Hecho relevante - HUT 8 CORP.: Anuncia cambio de ratio y split`
- **THEN** it matches the HUT CEDEAR line and not the BMA stock line

#### Scenario: publisher and especie normalization

- **WHEN** a notice's `emisor` is `Banco Comafi S.A.` or its `especie` is `TECO`, or a ticker piece is surrounded by double spaces
- **THEN** it matches as if written without the extra spaces and in the rules' case

#### Scenario: a CEDEAR ticker from a publisher that is not a program issuer

- **WHEN** a local issuer's notice title contains a CEDEAR symbol as a piece and an event phrase
- **THEN** it does not match that CEDEAR line

#### Scenario: cash distributions are excluded

- **WHEN** Comafi publishes `Aviso de pago de servicios o renta de Cedear - NOW - SERVICENOW INC. - Dividendo en acciones`
- **THEN** it matches no line

#### Scenario: phrases match only whole words

- **WHEN** the phrases are `acciones` and `ratio`, and the titles are `Hecho relevante - Informa transacciones con partes relacionadas` and `... - NVIDIA CORPORATION`
- **THEN** neither title is kept
- **AND** a title ending in `Stock Splité` is not kept by `stock split`, because an accented letter is part of a word

#### Scenario: an interest capitalization

- **WHEN** an analyzed stock's issuer publishes `Hecho relevante - Capitalizaciones de intereses - Obligaciones Negociables Clase 22`
- **THEN** it matches no line

### Requirement: candidates group a line's notices and say whether each is listed

Each candidate SHALL be one analyzed Trading Line with at least one matched notice, whatever the line's analysis outcome, carrying `tradingLineId` and `notices`. Every matched notice of that line in the fetched window SHALL be in the same candidate, in publication order, so that the announcement of one event and its follow-ups are one candidate. Each notice SHALL carry `documentId` (the feed's `descarga`), `publishedAt` (the feed's local Buenos Aires wall-clock `fecha` as `YYYY-MM-DDTHH:MM:SS`), `title` (the feed's `referencia`), `pdfUrl`, `https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/<descarga>`, and `isListed`.

Each notice SHALL be listed on its own: `isListed` SHALL be true when the Corporate Action list has an entry for the notice's line whose `exDate` is from 10 calendar days before to 70 calendar days after the notice's publication date. Announcements and follow-ups can come about two months before the ex-date, and a late notice a few days after it. Candidates SHALL be in the analyzed lines' order.

#### Scenario: a listed action

- **WHEN** ETHA's notice of 2026-10-06 matches and the list has ETHA's entry with ex-date 2026-10-06
- **THEN** the ETHA notice is listed

#### Scenario: an unlisted action

- **WHEN** NOW's notice of 2025-12-11 matches and the list has no NOW entry
- **THEN** the NOW notice is unlisted

#### Scenario: the window boundaries

- **WHEN** a notice is published on 2026-10-06 and its line's entry has ex-date 2026-12-15, 2026-12-16, 2026-09-26 or 2026-09-25
- **THEN** the notice is listed, unlisted, listed and unlisted respectively

#### Scenario: a listed event does not hide another

- **WHEN** a line's candidate has a notice near a listed entry and an earlier notice months before it
- **THEN** the earlier notice is unlisted and the later one listed

#### Scenario: follow-up notices

- **WHEN** three notices for UL's reverse split, an announcement, a `Rectificativo` and an `Amplia información`, fall in one window
- **THEN** there is one UL candidate with the three notices in publication order

### Requirement: the feed is fetched once over seven days

The module SHALL fetch the relevant-facts feed with one `POST https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/bnown/relevant-facts` with a JSON body of `publishDate` and `publishToDate` as `YYYY-MM-DD`, `textFilter: null`, `filter: true`, `dateEntryFrom: null`, `dateEntryTo: null` and `page_size: 5000`. `publishToDate` SHALL be the Requested-Through Session and `publishDate` six calendar days before it, so the window covers seven calendar days. It SHALL NOT download notice documents.

The watch SHALL be `unavailable`, with a message, when the request fails or times out, when the provider answers a non-success HTTP status, a body that is not JSON or a body whose shape is not `{ content: { total_elements_count }, data: [{ especie, fecha, descarga, referencia, emisor }] }` with a `fecha` of `YYYY-MM-DD HH:MM:SS` optionally followed by fractional seconds, or when `data` has fewer or more rows than `total_elements_count`. Otherwise it SHALL be `available` with its candidates. Both carry the window as `publishedFrom` and `publishedThrough`. The watch SHALL NOT throw: any other error while fetching or matching SHALL also make it `unavailable`, with a message starting `The watch failed:`.

#### Scenario: the request body

- **WHEN** the watch runs for the Requested-Through Session 2026-10-08
- **THEN** it posts `publishDate` 2026-10-02 and `publishToDate` 2026-10-08 with `page_size` 5000

#### Scenario: an HTTP failure

- **WHEN** the feed answers HTTP 503
- **THEN** the watch is unavailable with a message naming the status

#### Scenario: a paginated response

- **WHEN** the feed answers 250 rows of 300
- **THEN** the watch is unavailable
