## MODIFIED Requirements

### Requirement: The catalog has one supported version and strict record shapes

The system SHALL accept a complete catalog only when its `schemaVersion` is `1` and it contains at least one Instrument. Every Instrument SHALL have a lowercase kebab-case identifier, a type of `stock`, `cedear`, or `bond`, and at least one embedded Trading Line. Every Trading Line SHALL have a lowercase kebab-case identifier, a non-blank symbol, a supported exchange, and a supported currency. Version 1 SHALL support the exchanges `BYMA` and `NASDAQ` and the currencies `ARS` and `USD`.

Because BYMA lists both a local-dollar (MEP, "D") and a cable (CCL, "C") line in USD, and version 1 has no operative-form field, the identifier of every BYMA USD Trading Line SHALL name its operative form by ending in `-usd-mep` or `-usd-ccl`. This naming describes the line; it does not mark the line as a rate source or select it for analysis.

A stock SHALL contain only its identifier, type, and Trading Lines. A bond SHALL contain only its identifier, type, and Trading Lines; it has no Underlying Instrument. A CEDEAR SHALL additionally contain `underlyingInstrumentId`. Stored records containing fields outside their supported version-1 shape SHALL be invalid.

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

- **WHEN** a bond record contains `underlyingInstrumentId`
- **THEN** the system rejects the complete catalog and identifies that bond record as invalid

### Requirement: Complete-catalog relationships are valid

The system SHALL validate relationships across the complete catalog before exposing any entry. Instrument identifiers SHALL be unique. Trading Line identifiers SHALL be globally unique even though Trading Lines are embedded. No two Trading Lines SHALL describe the same combination of exchange, symbol, and currency.

Every CEDEAR SHALL reference an existing stock through `underlyingInstrumentId`. A CEDEAR SHALL NOT reference itself, another CEDEAR, a bond, or an unknown Instrument.

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

- **WHEN** a CEDEAR references an unknown Instrument or an Instrument whose type is not `stock`, such as a bond
- **THEN** the system rejects the complete catalog and identifies the invalid underlying reference

#### Scenario: One relationship is invalid among otherwise valid entries

- **WHEN** any complete-catalog relationship is invalid
- **THEN** the system exposes no partial Instrument Catalog

### Requirement: The initial catalog represents the first supported relationships

The version-1 repository catalog SHALL initially contain the Galicia and YPF stock Instruments, the Apple stock Instrument, the Apple CEDEAR Instrument, and the AL30 bond Instrument. Galicia and YPF stocks SHALL each own their BYMA ARS Trading Line. Apple stock SHALL own its NASDAQ USD Trading Line. The Apple CEDEAR SHALL own its BYMA ARS Trading Line and reference Apple stock as its Underlying Instrument. The AL30 bond SHALL own its BYMA ARS Trading Line `al30-bond-byma-ars` with symbol `AL30` and its BYMA USD local-dollar (MEP) Trading Line `al30-bond-byma-usd-mep` with symbol `AL30D`.

#### Scenario: Initial catalog loads

- **WHEN** the repository's version-1 catalog is loaded
- **THEN** all five Instruments and their Trading Lines are available through the catalog interface with the Apple CEDEAR related to Apple stock

#### Scenario: AL30 bond lines load

- **WHEN** the AL30 bond is resolved from the repository catalog
- **THEN** it is a `bond` without an Underlying Instrument and owns exactly the `AL30` ARS line and the `AL30D` USD line on BYMA

### Requirement: The catalog does not select acquisition or analysis policy

The Instrument Catalog SHALL describe Instruments, their embedded Trading Lines, and CEDEAR-to-Underlying-Instrument relationships without selecting a market-data provider, declaring provider support, selecting a Trading Line for technical analysis, choosing a fallback Trading Line, or choosing which bond Trading Lines are the MEP rate source.

#### Scenario: Scheduled work resolves an explicitly configured Trading Line

- **WHEN** scheduled orchestration resolves a configured Trading Line identifier through the catalog
- **THEN** the catalog returns that Trading Line's facts without selecting a provider or adding related Trading Lines

#### Scenario: Consumer requests a CEDEAR

- **WHEN** a consumer resolves a CEDEAR Instrument
- **THEN** the catalog returns its Underlying Instrument reference without selecting which Underlying Instrument Trading Line should feed analysis

#### Scenario: Consumer requests a bond

- **WHEN** a consumer resolves a bond Instrument
- **THEN** the catalog returns its Trading Lines without marking any of them as a MEP rate source
