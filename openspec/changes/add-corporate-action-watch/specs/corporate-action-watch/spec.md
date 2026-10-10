## ADDED Requirements

### Requirement: committed matching rules

The corporate-action-watch module SHALL load `src/modules/corporate-action-watch/data/corporate-action-watch-rules.v1.json` and SHALL fail to load when it is invalid. The file SHALL hold exactly:

- `schemaVersion: 1`;
- `cedearProgramIssuers`: a non-empty list of distinct `emisor` names of CEDEAR program issuers;
- `stockIssuerCodes`: a map from a stock line's symbol to the `especie` its issuer publishes under, for symbols that differ from it;
- `cedearNameAliases`: a map from a name used in titles instead of a ticker to the CEDEAR symbol it stands for;
- `eventPhrases`: a non-empty list of distinct, lowercase event phrases;
- `excludedTitlePrefixes`: a list of title prefixes whose notices are never kept.

Symbols, issuer codes and alias targets SHALL be uppercase BYMA symbols. No string SHALL be empty or have leading or trailing spaces.

The committed rules SHALL name the program issuers `BANCO COMAFI S.A.`, `Caja de Valores S.A.` and `BANCO MACRO S.A.`; the issuer codes `TECO2` → `TECO`, `TGSU2` → `TGSU`, `TGNO4` → `TGNO` and `SUPV` → `GSUP`; the name alias `HUT 8 CORP.` → `HUT`; the phrases `stock split`, `reverse stock split`, `cambio de ratio`, `dividendo en acciones`, `dividendos en acciones`, `capitalizaciones`, `stock dividend` and `dividendo opcional`; and the excluded prefix `Aviso de pago de servicios o renta de Cedear`. Bare `acciones` and `ratio` SHALL NOT be phrases.

#### Scenario: the committed rules load

- **WHEN** the committed rules are loaded
- **THEN** they contain the three program issuers, the four issuer codes, the HUT alias, the eight phrases and the excluded prefix

#### Scenario: invalid rules are rejected

- **WHEN** a rules value has an uppercase phrase, a lowercase issuer code, an empty program issuer list, a duplicate phrase or an extra field
- **THEN** validation fails with an issue at that field

### Requirement: notices are matched to analyzed lines by title and publisher

The module SHALL expose a pure function that takes relevant-facts notices, the analyzed Trading Lines with their symbol and instrument type (`stock` or `cedear`), the committed Corporate Action list and the rules, and returns the candidates.

A notice SHALL be kept only when its title contains an event phrase as whole words, case-insensitively, with any run of whitespace in the title matching a phrase's single space, and its title does not start, case-insensitively, with an excluded prefix.

A kept notice SHALL match a stock line when its `especie` equals the line's issuer code, which is the line's entry in `stockIssuerCodes` or else its symbol, unless the notice is a CEDEAR program notice: its `emisor` is a program issuer and its title contains `Cedear`, case-insensitively. Banco Macro publishes CEDEAR notices under `especie` `BMA`, Macro's own stock symbol; its own notices do not mention `Cedear`.

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

- **WHEN** TELECOM ARGENTINA S. A. publishes `Aviso de pago de Capitalizaciones / Dividendo en acciones - Pago de dividendo en acciones` with `especie` `TECO`
- **THEN** it matches the TECO2 stock line

#### Scenario: Banco Macro as CEDEAR publisher and as issuer

- **WHEN** BANCO MACRO S.A. publishes, with `especie` `BMA`, a `Hecho Relevante de Cedear` stock-split notice for a ticker that is not analyzed, and its own `Aviso de pago de Capitalizaciones / Dividendo en acciones`
- **THEN** only its own notice matches the BMA stock line

#### Scenario: a CEDEAR ticker from a publisher that is not a program issuer

- **WHEN** a local issuer's notice title contains a CEDEAR symbol as a piece and an event phrase
- **THEN** it does not match that CEDEAR line

#### Scenario: cash distributions are excluded

- **WHEN** Comafi publishes `Aviso de pago de servicios o renta de Cedear - NOW - SERVICENOW INC. - Dividendo en acciones`
- **THEN** it matches no line

#### Scenario: words that contain a phrase-like fragment

- **WHEN** a program issuer's title for an analyzed CEDEAR reads `... - BANK OF AMERICA CORPORATION - Informa transacciones de acciones propias`
- **THEN** it matches no line

### Requirement: candidates group a line's notices and say whether it is listed

Each candidate SHALL be one analyzed Trading Line with at least one matched notice, carrying `tradingLineId`, `isListed` and `notices`. Every matched notice of that line in the fetched window SHALL be in the same candidate, in publication order, so that the announcement of one event and its follow-ups are one candidate. Each notice SHALL carry `documentId` (the feed's `descarga`), `publishedAt` (the feed's local Buenos Aires wall-clock `fecha` as `YYYY-MM-DDTHH:MM:SS`), `title` (the feed's `referencia`) and `pdfUrl`, `https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/<descarga>`.

A candidate SHALL be listed when the Corporate Action list has an entry for its line whose `exDate` is at most 10 calendar days before or after the publication date of any of its notices. Candidates SHALL be in the analyzed lines' order.

#### Scenario: a listed action

- **WHEN** ETHA's notice of 2026-10-06 matches and the list has ETHA's entry with ex-date 2026-10-06
- **THEN** the ETHA candidate is listed

#### Scenario: an unlisted action

- **WHEN** NOW's notice of 2025-12-11 matches and the list has no NOW entry
- **THEN** the NOW candidate is unlisted

#### Scenario: the ten-day boundary

- **WHEN** a line's entry has ex-date 2026-10-16 and its notice was published on 2026-10-06, or on 2026-10-05
- **THEN** the candidate is listed in the first case and unlisted in the second

#### Scenario: follow-up notices

- **WHEN** three notices for UL's reverse split, an announcement, a `Rectificativo` and an `Amplia información`, fall in one window
- **THEN** there is one UL candidate with the three notices in publication order

### Requirement: the feed is fetched once over seven days

The module SHALL fetch the relevant-facts feed with one `POST https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/bnown/relevant-facts` with a JSON body of `publishDate` and `publishToDate` as `YYYY-MM-DD`, `textFilter: null`, `filter: true`, `dateEntryFrom: null`, `dateEntryTo: null` and `page_size: 5000`. `publishToDate` SHALL be the Requested-Through Session and `publishDate` six calendar days before it, so the window covers seven calendar days. It SHALL NOT download notice documents.

The watch SHALL be `unavailable`, with a message, when the request fails or times out, when the provider answers a non-success HTTP status, a body that is not JSON or a body whose shape is not `{ content: { total_elements_count }, data: [{ especie, fecha, descarga, referencia, emisor }] }` with a `fecha` of `YYYY-MM-DD HH:MM:SS` optionally followed by fractional seconds, or when `data` has fewer or more rows than `total_elements_count`. Otherwise it SHALL be `available` with its candidates. Both carry the window as `publishedFrom` and `publishedThrough`. Fetching SHALL NOT throw for any of these failures.

#### Scenario: the request body

- **WHEN** the watch runs for the Requested-Through Session 2026-10-08
- **THEN** it posts `publishDate` 2026-10-02 and `publishToDate` 2026-10-08 with `page_size` 5000

#### Scenario: an HTTP failure

- **WHEN** the feed answers HTTP 503
- **THEN** the watch is unavailable with a message naming the status

#### Scenario: a paginated response

- **WHEN** the feed answers 250 rows of 300
- **THEN** the watch is unavailable
