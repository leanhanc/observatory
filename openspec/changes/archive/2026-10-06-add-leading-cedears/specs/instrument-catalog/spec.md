## RENAMED Requirements

- FROM: `### Requirement: The repository catalog holds the original Instruments and the leading-panel stocks`
- TO: `### Requirement: The repository catalog holds the original Instruments, the leading-panel stocks and the leading CEDEARs`

## MODIFIED Requirements

### Requirement: The catalog has one supported version and strict record shapes

The system SHALL accept a complete catalog only when its `schemaVersion` is `1` and it contains at least one Instrument. Every Instrument SHALL have a lowercase kebab-case identifier, a type of `stock`, `cedear`, or `bond`, and at least one embedded Trading Line. Every Trading Line SHALL have a lowercase kebab-case identifier, a non-blank symbol, a supported exchange, and a supported currency. Version 1 SHALL support the exchanges `BYMA` and `NASDAQ` and the currencies `ARS` and `USD`.

Because BYMA lists both a local-dollar (MEP, "D") and a cable (CCL, "C") line in USD, and version 1 has no operative-form field, the identifier of every BYMA USD Trading Line SHALL name its operative form by ending in `-usd-mep` or `-usd-ccl`. This naming describes the line; it does not mark the line as a rate source or select it for analysis.

A stock SHALL contain only its identifier, type, and Trading Lines. A bond SHALL contain only its identifier, type, and Trading Lines; it has no underlying. A CEDEAR SHALL additionally contain `underlying`, a description of the foreign asset it represents: an object with exactly a non-blank `market` and a non-blank `ticker`, the market of origin and the ticker there. The underlying is a description, not a reference to another Instrument. Stored records containing fields outside their supported version-1 shape SHALL be invalid.

#### Scenario: Valid version-1 catalog

- **WHEN** a version-1 catalog contains valid stock, CEDEAR, and bond records and every Instrument has at least one valid Trading Line
- **THEN** the system accepts the complete catalog

#### Scenario: Instrument has no Trading Line

- **WHEN** an Instrument contains an empty `tradingLines` array
- **THEN** the system rejects the complete catalog and identifies that Instrument's Trading Lines as invalid

#### Scenario: Catalog contains an unsupported value or field

- **WHEN** a stored record contains an unsupported type, exchange, currency, schema version, or additional field
- **THEN** the system rejects the complete catalog and identifies the invalid location

#### Scenario: BYMA USD line names its operative form

- **WHEN** the repository catalog contains a BYMA USD Trading Line
- **THEN** its identifier ends in `-usd-mep` or `-usd-ccl`

#### Scenario: Bond declares an Underlying Instrument

- **WHEN** a bond record contains `underlying` or `underlyingInstrumentId`
- **THEN** the system rejects the complete catalog and identifies that bond record as invalid

#### Scenario: CEDEAR describes its underlying

- **WHEN** a CEDEAR record contains `underlying: { market: 'NYSE Arca', ticker: 'SPY' }`
- **THEN** the system accepts it without any Instrument for SPY in the catalog

#### Scenario: CEDEAR underlying is missing or incomplete

- **WHEN** a CEDEAR record has no `underlying`, an `underlying` with a blank `market` or `ticker`, or an `underlying` with an additional field
- **THEN** the system rejects the complete catalog and identifies the invalid location

### Requirement: Complete-catalog relationships are valid

The system SHALL validate relationships across the complete catalog before exposing any entry. Instrument identifiers SHALL be unique. Trading Line identifiers SHALL be globally unique even though Trading Lines are embedded. No two Trading Lines SHALL describe the same combination of exchange, symbol, and currency.

#### Scenario: Duplicate Instrument identifier

- **WHEN** two Instruments have the same identifier
- **THEN** the system rejects the complete catalog and reports the duplicate identifier

#### Scenario: Duplicate Trading Line identifier

- **WHEN** two embedded Trading Lines have the same identifier
- **THEN** the system rejects the complete catalog and reports both conflicting locations

#### Scenario: Equivalent Trading Lines have different identifiers

- **WHEN** two Trading Lines have different identifiers but the same exchange, symbol, and currency
- **THEN** the system rejects the complete catalog as containing the same Trading Line twice

#### Scenario: CEDEAR references an invalid underlying

- **WHEN** a CEDEAR record references an Instrument through `underlyingInstrumentId`, whether that Instrument exists or not
- **THEN** the system rejects the complete catalog and identifies `underlyingInstrumentId` as an unsupported field, because a CEDEAR describes its underlying instead of referencing an Instrument

#### Scenario: One relationship is invalid among otherwise valid entries

- **WHEN** any complete-catalog relationship is invalid
- **THEN** the system exposes no partial Instrument Catalog

### Requirement: The catalog does not select acquisition or analysis policy

The Instrument Catalog SHALL describe Instruments, their embedded Trading Lines, and the description of each CEDEAR's underlying without selecting a market-data provider, declaring provider support, selecting a Trading Line for technical analysis, choosing a fallback Trading Line, or choosing which bond Trading Lines are the MEP rate source.

#### Scenario: Scheduled work resolves an explicitly configured Trading Line

- **WHEN** scheduled orchestration resolves a configured Trading Line identifier through the catalog
- **THEN** the catalog returns that Trading Line's facts without selecting a provider or adding related Trading Lines

#### Scenario: Consumer requests a CEDEAR

- **WHEN** a consumer resolves a CEDEAR Instrument
- **THEN** the catalog returns its underlying's market and ticker without any Trading Line for the underlying

#### Scenario: Consumer requests a bond

- **WHEN** a consumer resolves a bond Instrument
- **THEN** the catalog returns its Trading Lines without marking any of them as a MEP rate source

### Requirement: The repository catalog holds the original Instruments, the leading-panel stocks and the leading CEDEARs

The version-1 repository catalog SHALL contain the Galicia and YPF stock Instruments, the Apple CEDEAR Instrument, and the AL30 bond Instrument, with their original identifiers. It SHALL NOT contain an Apple stock Instrument or any NASDAQ Trading Line. Galicia stock SHALL own its BYMA ARS Trading Line `galicia-stock-byma-ars` with symbol `GGAL`, and YPF stock SHALL own its BYMA ARS Trading Line `ypf-stock-byma-ars` with symbol `YPFD`. The Apple CEDEAR SHALL own its BYMA ARS Trading Line `apple-cedear-byma-ars` with symbol `AAPL` and describe its underlying as market `NASDAQ`, ticker `AAPL`. The AL30 bond SHALL own its BYMA ARS Trading Line `al30-bond-byma-ars` with symbol `AL30` and its BYMA USD local-dollar (MEP) Trading Line `al30-bond-byma-usd-mep` with symbol `AL30D`.

The repository catalog SHALL also contain, for every peso 24-hour line listed by BYMA's leading panel when the catalog was last generated, a `stock` Instrument owning a BYMA ARS Trading Line with that symbol. The catalog SHALL NOT record panel membership: which stocks are leaders is a fact of the generation, not a catalog field.

The repository catalog SHALL also contain a `cedear` Instrument owning a BYMA ARS Trading Line for every `cedears` panel candidate that was liquidity-eligible, and had a usable technical sheet, when the catalog was last generated. It SHALL NOT record eligibility, the session it was measured at, or the measures.

#### Scenario: Initial catalog loads

- **WHEN** the repository's version-1 catalog is loaded
- **THEN** the four original Instruments and their Trading Lines are available through the catalog interface with their original identifiers, and the Apple CEDEAR describes its underlying as `NASDAQ` / `AAPL`

#### Scenario: AL30 bond lines load

- **WHEN** the AL30 bond is resolved from the repository catalog
- **THEN** it is a `bond` without an underlying and owns exactly the `AL30` ARS line and the `AL30D` USD line on BYMA

#### Scenario: The committed catalog is the generator's output

- **WHEN** the generator merges, into the committed catalog, a panel listing exactly the symbols of the committed catalog's stocks' BYMA ARS Trading Lines
- **THEN** it adds no Instrument, reports no absent stock, and produces a file identical to the committed one

#### Scenario: The committed CEDEARs are the generator's output

- **WHEN** the generator merges, into the committed catalog, a `cedears` panel listing exactly the symbols of the committed catalog's CEDEARs' BYMA ARS Trading Lines
- **THEN** it requests no CEDEAR's history or technical sheet, only the MEP rate source pair, adds no Instrument, reports no absent CEDEAR, and produces a file identical to the committed one

## ADDED Requirements

### Requirement: The generator merges the liquidity-eligible CEDEARs

The catalog generator SHALL take an optional `--through-session YYYY-MM-DD`. Without it, the through-session SHALL be the calendar date before the current date in `America/Argentina/Buenos_Aires`, as resolved for the scheduled Analysis Run. Either way it SHALL be a real date before the current date in `America/Argentina/Buenos_Aires`; otherwise the generator SHALL fail before any request. After merging the leading panel, it SHALL request BYMA's `cedears` panel from Open BYMADATA with the same body as the leading panel and merge liquidity-eligible CEDEARs into the result. The runtime SHALL NOT call the generator.

**Panel.** The `cedears` response SHALL be an array of records, each with a `symbol` of uppercase letters, digits and dots, a `denominationCcy` and a `settlementType`. The response has no element count, so a response with as many records as the requested page size (5000) SHALL be treated as possibly truncated. The generator SHALL consider only records with `denominationCcy` `ARS` and `settlementType` `2`. It SHALL fail when either panel request fails or its body is not JSON, or when the `cedears` response is malformed or possibly truncated, has no such record, or lists such a symbol twice.

**Candidates.** A considered symbol SHALL be a `B` variant, and not a candidate, when it ends in `B` and its base is a non-empty considered symbol. The base is the symbol without its final `B` and without any dots that then trail it, so `AAPLB` is a variant of `AAPL`, `C...B` of `C`, and `BB` of `B` when `B` is listed, while `B` alone and `ABNB` without an `ABN` are candidates. The panel carries no ISIN that would confirm the pairing, so the report SHALL list every dropped variant with its base. Every other considered symbol SHALL be a candidate.

**Existing CEDEARs.** A candidate SHALL match an existing CEDEAR when that CEDEAR owns a Trading Line with exchange `BYMA`, currency `ARS` and that symbol. A matched CEDEAR SHALL be left unchanged, and the generator SHALL NOT request its history or technical sheet. The generator SHALL report every catalog CEDEAR owning a BYMA ARS line whose symbol is not a candidate, including one that owns a dropped `B` variant, and SHALL NOT delete or change it.

**Conflicts.** Before requesting any candidate history, the generator SHALL skip, and report, every unmatched candidate that could not be added without breaking catalog validation: one whose symbol another Instrument already trades on BYMA in ARS, one whose derived identifier or Trading Line identifier already exists in the catalog, and every candidate whose derived identifier another candidate shares.

**Eligibility.** For the remaining candidates, the generator SHALL fetch the MEP rate source Trading Lines and each candidate's full available history through the through-session, with the Open BYMADATA adapter. It SHALL validate the MEP rate source lines exactly as the Analysis Run does, including its acceptance of a zero open, and SHALL fail without writing when either line cannot be fetched or fails that validation. It SHALL compute MEP Rates with `calculateMepRates`, select the liquidity window with `selectLiquidityWindow` at the latest MEP Rate session on or before the through-session, and fail without writing when the window cannot be selected. It SHALL evaluate each candidate with `evaluateLiquidityEligibility`. A candidate whose history request fails SHALL NOT be added and SHALL be reported.

**Underlying.** For each eligible candidate, the generator SHALL request the technical sheet from `bnown/fichatecnica/especies/general` with `{ "symbol": <candidate> }`. The candidate SHALL be added only when the response has exactly one record whose `mercadoOrigen` and `simboloMercado` are non-blank after trimming; they become `underlying.market` and `underlying.ticker`, trimmed. Otherwise the candidate SHALL NOT be added and SHALL be reported.

**Bar validity.** An eligible candidate's bars SHALL be validated as a Daily Bar history. A candidate with invalid bars SHALL still be added, because eligibility reads only dates, closes and volumes, and SHALL be reported, because the Analysis Run will report it as `invalid-bars`.

**Records.** An added CEDEAR's identifier SHALL be the symbol lowercased, with every run of characters outside `a-z0-9` replaced by `-` and any leading or trailing `-` removed, followed by `-cedear`. Its only Trading Line SHALL have the identifier `<instrument id>-byma-ars`, the panel symbol, exchange `BYMA` and currency `ARS`. Added CEDEARs SHALL follow every existing Instrument and every stock added from the leading panel, in symbol order.

**Pacing.** Every request the generator makes, across both panels, histories and technical sheets, SHALL be sequential, with exactly one 2-second pause between the end of one request and the start of the next.

**Writing.** The merged catalog SHALL be validated with the Instrument Catalog's validation before writing. Any generation failure SHALL leave the stored catalog file unchanged, and a successful write SHALL replace it in a single step. The report SHALL state the session eligibility was measured at, the candidate count, the dropped `B` variants, the added CEDEARs, those added with invalid bars, how many candidates were ineligible, the absent catalog CEDEARs, and every candidate skipped for a conflict, a failed history request or an unusable technical sheet.

#### Scenario: an eligible CEDEAR is added with its underlying

- **WHEN** `MELI` is a candidate, no catalog CEDEAR owns it, it is liquidity-eligible, and its technical sheet has `mercadoOrigen` `NASDAQ` and `simboloMercado` `MELI`
- **THEN** the catalog gains CEDEAR `meli-cedear` with the single Trading Line `meli-cedear-byma-ars`, symbol `MELI`, on BYMA in ARS, and underlying `{ market: 'NASDAQ', ticker: 'MELI' }`

#### Scenario: technical-sheet values are trimmed

- **WHEN** an eligible candidate's sheet has `mercadoOrigen` `'NYSE '` and `simboloMercado` `' X '`
- **THEN** its underlying is `{ market: 'NYSE', ticker: 'X' }`

#### Scenario: an ineligible candidate is not added

- **WHEN** a candidate trades on fewer than 90% of the window's sessions or below the value floor
- **THEN** no Instrument is added for it and its technical sheet is not requested

#### Scenario: B variants are not candidates

- **WHEN** the panel lists `AAPL`, `AAPLB`, `C`, `C...B` and `ABNB` as ARS 24-hour rows
- **THEN** `AAPLB` and `C...B` are not candidates, and `ABNB` is a candidate
- **AND** the report lists `AAPLB → AAPL` and `C...B → C`

#### Scenario: B alone and BB

- **WHEN** the panel lists `B` without `BB`, or `BB` without `B`
- **THEN** that symbol is a candidate
- **AND WHEN** the panel lists both `B` and `BB`, then `BB` is a dropped variant of `B`

#### Scenario: a dotted symbol yields a clean identifier

- **WHEN** `BA.C` is added
- **THEN** its identifier is `ba-c-cedear`

#### Scenario: an existing CEDEAR is not fetched

- **WHEN** the catalog's `apple-cedear` owns the BYMA ARS `AAPL` line and the panel lists `AAPL`
- **THEN** `apple-cedear` is unchanged and no history or technical sheet is requested for `AAPL`

#### Scenario: a catalog CEDEAR absent from the candidates is reported

- **WHEN** a catalog CEDEAR owns a BYMA ARS line whose symbol is not a candidate, either because the panel does not list it or because it is a dropped `B` variant
- **THEN** it remains in the catalog and is reported

#### Scenario: conflicting candidates are skipped before fetching

- **WHEN** a candidate's symbol is already a stock's BYMA ARS line, its derived identifier is already an Instrument identifier, or two candidates such as `BA.C` and `BA..C` derive the same identifier
- **THEN** those candidates are reported as conflicts, their histories are not requested, and the other candidates are still merged

#### Scenario: a failed history or an unusable sheet is reported

- **WHEN** a candidate's history request fails, or an eligible candidate's technical sheet has no record, more than one record, or a blank `mercadoOrigen`
- **THEN** that candidate is not added, it is reported, and the other candidates are still merged

#### Scenario: a liquid candidate with invalid bars is added and reported

- **WHEN** an eligible candidate has a bar whose close is far above its high
- **THEN** it is added and the report lists it as added with invalid bars

#### Scenario: the window is selected through the through-session

- **WHEN** the provider serves trading for a candidate after the through-session that would make it eligible in a window ending later
- **THEN** that candidate is not added

#### Scenario: the through-session has no MEP Rate

- **WHEN** the through-session is a weekend or holiday, or AL30D did not trade on it
- **THEN** eligibility is measured at the latest earlier session with a MEP Rate, and the report states that session

#### Scenario: the MEP rate source cannot support the window

- **WHEN** a MEP rate source line cannot be fetched, has a bar that fails the Analysis Run's validation, or yields fewer than 125 MEP Rates through the through-session
- **THEN** the generator fails and does not write the catalog

#### Scenario: a zero open on the MEP rate source is accepted

- **WHEN** an AL30 bar has open `0` and a valid range and close
- **THEN** generation proceeds, as the Analysis Run would

#### Scenario: unusable panel response

- **WHEN** a panel request fails, or the `cedears` response is not an array of records, has 5000 records, has no ARS 24-hour record, contains a symbol that is not uppercase letters, digits and dots, or lists an ARS 24-hour symbol twice
- **THEN** the generator fails and does not write the catalog

#### Scenario: default through-session

- **WHEN** the generator runs without `--through-session` at 2026-10-08T02:00:00Z, which is 2026-10-07 in Buenos Aires
- **THEN** the through-session is 2026-10-06

#### Scenario: invalid through-session

- **WHEN** `--through-session` is not a real date, or is today's date in Buenos Aires or later
- **THEN** the generator fails before any request

#### Scenario: requests are paced once

- **WHEN** the generator requests the leading panel, the `cedears` panel, histories and technical sheets
- **THEN** each request starts only after the previous one has ended, with exactly one 2-second pause between them

#### Scenario: added CEDEARs follow a deterministic order

- **WHEN** two `cedears` responses list the same rows in different orders and the same candidates are eligible
- **THEN** the merged catalogs are identical
