## ADDED Requirements

### Requirement: a configured MEP rate source names one bond's lines

The dollarized-series module SHALL export `MEP_RATE_SOURCE`, an analysis-configuration constant holding `pesoBondTradingLineId` and `dollarBondTradingLineId`, set to `al30-bond-byma-ars` and `al30-bond-byma-usd-mep`: the AL30 peso line and its local-dollar (MEP, "D") line, per ADR 0005. It selects only the bond whose closes imply the MEP Rate. It SHALL NOT select which Instruments or Trading Lines feed analysis, and the Instrument Catalog SHALL NOT be the place that makes this selection. Both identifiers SHALL resolve through the repository Instrument Catalog. Both lines SHALL belong to the same Instrument, whose type is `bond`. The peso-bond line SHALL be a BYMA ARS line. The dollar-bond line SHALL be a BYMA USD line whose identifier ends in `-usd-mep`, the catalog's only signal that it is the local-dollar line and not the cable line. Settlement is not represented in the catalog; callers SHALL fetch both lines with the same settlement term as the peso bars they dollarize. The module SHALL NOT fetch either line.

#### Scenario: both lines resolve

- **WHEN** both `MEP_RATE_SOURCE` identifiers are resolved through the repository Instrument Catalog
- **THEN** both resolve to Trading Lines

#### Scenario: both lines belong to one bond

- **WHEN** the Instruments owning the two configured lines are looked up
- **THEN** they are the same Instrument and its type is `bond`

#### Scenario: the peso leg is a BYMA ARS line

- **WHEN** the configured peso-bond line is resolved
- **THEN** its exchange is `BYMA` and its currency is `ARS`

#### Scenario: the dollar leg is a BYMA USD line

- **WHEN** the configured dollar-bond line is resolved
- **THEN** its exchange is `BYMA` and its currency is `USD`

#### Scenario: the dollar leg is the local-dollar line

- **WHEN** the configured dollar-bond identifier is read
- **THEN** it ends in `-usd-mep`, not `-usd-ccl`
