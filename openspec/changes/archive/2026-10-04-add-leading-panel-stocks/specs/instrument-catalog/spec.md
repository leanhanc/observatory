## RENAMED Requirements

- FROM: `### Requirement: The initial catalog represents the first supported relationships`
- TO: `### Requirement: The repository catalog holds the original Instruments and the leading-panel stocks`

## MODIFIED Requirements

### Requirement: The repository catalog holds the original Instruments and the leading-panel stocks

The version-1 repository catalog SHALL contain the Galicia and YPF stock Instruments, the Apple stock Instrument, the Apple CEDEAR Instrument, and the AL30 bond Instrument, with their original identifiers. Galicia stock SHALL own its BYMA ARS Trading Line `galicia-stock-byma-ars` with symbol `GGAL`, and YPF stock SHALL own its BYMA ARS Trading Line `ypf-stock-byma-ars` with symbol `YPFD`. Apple stock SHALL own its NASDAQ USD Trading Line. The Apple CEDEAR SHALL own its BYMA ARS Trading Line and reference Apple stock as its Underlying Instrument. The AL30 bond SHALL own its BYMA ARS Trading Line `al30-bond-byma-ars` with symbol `AL30` and its BYMA USD local-dollar (MEP) Trading Line `al30-bond-byma-usd-mep` with symbol `AL30D`.

The repository catalog SHALL also contain, for every peso 24-hour line listed by BYMA's leading panel when the catalog was last generated, a `stock` Instrument owning a BYMA ARS Trading Line with that symbol. The catalog SHALL NOT record panel membership: which stocks are leaders is a fact of the generation, not a catalog field.

#### Scenario: Initial catalog loads

- **WHEN** the repository's version-1 catalog is loaded
- **THEN** the five original Instruments and their Trading Lines are available through the catalog interface with their original identifiers and the Apple CEDEAR related to Apple stock

#### Scenario: AL30 bond lines load

- **WHEN** the AL30 bond is resolved from the repository catalog
- **THEN** it is a `bond` without an Underlying Instrument and owns exactly the `AL30` ARS line and the `AL30D` USD line on BYMA

#### Scenario: The committed catalog is the generator's output

- **WHEN** the generator merges, into the committed catalog, a panel listing exactly the symbols of the committed catalog's stocks' BYMA ARS Trading Lines
- **THEN** it adds no Instrument, reports no absent stock, and produces a file identical to the committed one

## ADDED Requirements

### Requirement: A generator merges the leading panel into the stored catalog

A development command SHALL request BYMA's leading panel from Open BYMADATA with `excludeZeroPxAndQty: false`, `T1: true`, `T0: false` and `page_size: 5000`, and merge it into the stored version-1 catalog. The runtime SHALL NOT call the generator; it loads only the stored, committed catalog.

The generator SHALL accept a panel response only when it is a single complete page: its record count equals `content.total_elements_count`. It SHALL consider only records whose `denominationCcy` is `ARS` and whose `settlementType` is `2` (24-hour settlement), and SHALL fail when the response is malformed, incomplete, or contains no such record. Every record's symbol SHALL consist only of uppercase letters, digits and dots, and the considered records SHALL NOT list the same symbol twice; otherwise the response is malformed.

A panel symbol SHALL match an existing stock when that stock owns a Trading Line with exchange `BYMA`, currency `ARS` and that symbol. A matched stock SHALL be left unchanged. An unmatched symbol SHALL add a `stock` Instrument whose identifier is the symbol lowercased, with every run of characters outside `a-z0-9` replaced by `-` and any leading or trailing `-` removed, followed by `-stock`, and whose only Trading Line has the identifier `<instrument id>-byma-ars`, the panel symbol, exchange `BYMA` and currency `ARS`.

The generator SHALL NOT delete or change any existing Instrument. It SHALL report every catalog stock owning a BYMA ARS Trading Line whose symbol is absent from the leading panel. That report identifies departed leaders only while the catalog's stocks with BYMA ARS lines are exactly the leaders; once other local stocks are catalogued, it also lists them.

Existing Instruments SHALL keep their stored order and added Instruments SHALL follow them in symbol order, so the result does not depend on the panel's row order and a second run over the same panel produces an identical file.

The generator SHALL validate the merged catalog with the Instrument Catalog's validation before writing. Any failure SHALL leave the stored catalog file unchanged, and a successful write SHALL replace the file in a single step, so an interrupted run never leaves a partial file.

#### Scenario: Existing leaders keep their identifiers

- **WHEN** the panel lists `GGAL` and `YPFD` and the catalog already holds `galicia-stock` and `ypf-stock` with those BYMA ARS lines
- **THEN** both Instruments and their Trading Line identifiers are unchanged and no Instrument is added for those symbols

#### Scenario: A symbol with punctuation yields a clean identifier

- **WHEN** the panel lists `BMA.` and no catalog stock owns a BYMA ARS `BMA.` line
- **THEN** the added stock's identifier is `bma-stock`

#### Scenario: A new leader is added

- **WHEN** the panel lists `TECO2` and no catalog stock owns a BYMA ARS `TECO2` line
- **THEN** the catalog gains stock `teco2-stock` with the single Trading Line `teco2-stock-byma-ars`, symbol `TECO2`, on BYMA in ARS

#### Scenario: A stock absent from the panel is reported, not deleted

- **WHEN** a catalog stock owns a BYMA ARS line whose symbol the panel does not list
- **THEN** the stock remains in the catalog and the generator reports it as a catalog stock with a BYMA ARS line absent from the leading panel

#### Scenario: A stock's other lines do not affect the report

- **WHEN** a catalog stock owns a BYMA ARS line listed by the panel and a BYMA USD line that the panel does not list
- **THEN** the stock is not reported as absent

#### Scenario: Other currencies and settlements are ignored

- **WHEN** the panel contains rows denominated in `USD` or `EXT`, or with a settlement other than `2`
- **THEN** those rows neither add Instruments nor count as leaders

#### Scenario: Re-running is idempotent

- **WHEN** the generator merges the same panel into its own output
- **THEN** the result is identical and reports no added Instrument

#### Scenario: Panel row order does not matter

- **WHEN** two panel responses list the same rows in different orders
- **THEN** the merged catalogs are identical

#### Scenario: Unusable panel response

- **WHEN** the panel response is malformed, paginated or incomplete, has no ARS 24-hour row, contains a symbol that is not uppercase letters, digits and dots, or lists an ARS 24-hour symbol twice
- **THEN** the generator fails and does not write the catalog

#### Scenario: Merge would produce an invalid catalog

- **WHEN** an added stock would duplicate an existing Instrument identifier or an existing Trading Line's exchange, symbol and currency
- **THEN** the generator fails with the catalog's validation issues and does not write the catalog
