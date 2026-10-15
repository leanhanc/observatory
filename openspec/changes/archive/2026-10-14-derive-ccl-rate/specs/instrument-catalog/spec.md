## MODIFIED Requirements

### Requirement: The repository catalog holds the original Instruments, the leading-panel stocks and the leading CEDEARs

The version-1 repository catalog SHALL contain the Galicia and YPF stock Instruments, the Apple CEDEAR Instrument, and the AL30 bond Instrument, with their original identifiers. It SHALL NOT contain an Apple stock Instrument or any NASDAQ Trading Line. Galicia stock SHALL own its BYMA ARS Trading Line `galicia-stock-byma-ars` with symbol `GGAL`, and YPF stock SHALL own its BYMA ARS Trading Line `ypf-stock-byma-ars` with symbol `YPFD`. The Apple CEDEAR SHALL own its BYMA ARS Trading Line `apple-cedear-byma-ars` with symbol `AAPL` and describe its underlying as market `NASDAQ`, ticker `AAPL`. The AL30 bond SHALL own its BYMA ARS Trading Line `al30-bond-byma-ars` with symbol `AL30`, its BYMA USD local-dollar (MEP) Trading Line `al30-bond-byma-usd-mep` with symbol `AL30D`, and its BYMA USD cable (CCL) Trading Line `al30-bond-byma-usd-ccl` with symbol `AL30C`.

The repository catalog SHALL also contain, for every peso 24-hour line listed by BYMA's leading panel when the catalog was last generated, a `stock` Instrument owning a BYMA ARS Trading Line with that symbol. The catalog SHALL NOT record panel membership: which stocks are leaders is a fact of the generation, not a catalog field.

The repository catalog SHALL also contain a `cedear` Instrument owning a BYMA ARS Trading Line for every `cedears` panel candidate that was liquidity-eligible, and had a usable technical sheet, when the catalog was last generated. It SHALL NOT record eligibility, the session it was measured at, or the measures.

#### Scenario: Initial catalog loads

- **WHEN** the repository's version-1 catalog is loaded
- **THEN** the four original Instruments and their Trading Lines are available through the catalog interface with their original identifiers, and the Apple CEDEAR describes its underlying as `NASDAQ` / `AAPL`

#### Scenario: AL30 bond lines load

- **WHEN** the AL30 bond is resolved from the repository catalog
- **THEN** it is a `bond` without an underlying and owns exactly the `AL30` ARS line, the `AL30D` USD line and the `AL30C` USD line on BYMA

#### Scenario: The committed catalog is the generator's output

- **WHEN** the generator merges, into the committed catalog, a panel listing exactly the symbols of the committed catalog's stocks' BYMA ARS Trading Lines
- **THEN** it adds no Instrument, reports no absent stock, and produces a file identical to the committed one

#### Scenario: The committed CEDEARs are the generator's output

- **WHEN** the generator merges, into the committed catalog, a `cedears` panel listing exactly the symbols of the committed catalog's CEDEARs' BYMA ARS Trading Lines
- **THEN** it requests no CEDEAR's history or technical sheet, only the MEP rate source pair, adds no Instrument, reports no absent CEDEAR, and produces a file identical to the committed one
