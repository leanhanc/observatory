## Purpose

Provide one validated, read-only source for the Instruments and Trading Lines Observatory recognizes and for the economic relationship between each CEDEAR and its Underlying Instrument.

## ADDED Requirements

### Requirement: The catalog has one supported version and strict record shapes

The system SHALL accept a complete catalog only when its `schemaVersion` is `1` and it contains at least one Instrument. Every Instrument SHALL have a lowercase kebab-case identifier, a type of `stock` or `cedear`, and at least one embedded Trading Line. Every Trading Line SHALL have a lowercase kebab-case identifier, a non-blank symbol, a supported exchange, and a supported currency. Version 1 SHALL support the exchanges `BYMA` and `NASDAQ` and the currencies `ARS` and `USD`.

A stock SHALL contain only its identifier, type, and Trading Lines. A CEDEAR SHALL additionally contain `underlyingInstrumentId`. Stored records containing fields outside their supported version-1 shape SHALL be invalid.

#### Scenario: Valid version-1 catalog

- **WHEN** a version-1 catalog contains valid stock and CEDEAR records and every Instrument has at least one valid Trading Line
- **THEN** the system accepts the complete catalog

#### Scenario: Instrument has no Trading Line

- **WHEN** an Instrument contains an empty `tradingLines` array
- **THEN** the system rejects the complete catalog and identifies that Instrument's Trading Lines as invalid

#### Scenario: Catalog contains an unsupported value or field

- **WHEN** a stored record contains an unsupported type, exchange, currency, schema version, or additional field
- **THEN** the system rejects the complete catalog and identifies the invalid location

### Requirement: Complete-catalog relationships are valid

The system SHALL validate relationships across the complete catalog before exposing any entry. Instrument identifiers SHALL be unique. Trading Line identifiers SHALL be globally unique even though Trading Lines are embedded. No two Trading Lines SHALL describe the same combination of exchange, symbol, and currency.

Every CEDEAR SHALL reference an existing stock through `underlyingInstrumentId`. A CEDEAR SHALL NOT reference itself, another CEDEAR, or an unknown Instrument.

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

- **WHEN** a CEDEAR references an unknown Instrument or an Instrument whose type is not `stock`
- **THEN** the system rejects the complete catalog and identifies the invalid underlying reference

#### Scenario: One relationship is invalid among otherwise valid entries

- **WHEN** any complete-catalog relationship is invalid
- **THEN** the system exposes no partial Instrument Catalog

### Requirement: Consumers use a read-only catalog interface

The system SHALL expose operations that list all Instruments, resolve one Instrument identifier, and resolve an ordered set of Trading Line identifiers. Returned Instruments and Trading Lines SHALL be deeply read-only, and a consumer SHALL NOT be able to change nested Instruments, nested Trading Lines, their arrays, or the catalog observed by later reads. The stored JSON SHALL remain an internal implementation detail rather than a consumer import.

The order of Instruments in storage or in a complete listing SHALL have no domain meaning. Resolving Trading Line identifiers SHALL preserve the caller's requested order.

#### Scenario: List recognized Instruments

- **WHEN** a consumer requests all recognized Instruments
- **THEN** the system returns every validated Instrument without promising a meaningful order

#### Scenario: Resolve an existing Instrument

- **WHEN** a consumer requests a recognized Instrument identifier
- **THEN** the system returns that complete Instrument with its embedded Trading Lines

#### Scenario: Consumer attempts to mutate nested returned data

- **WHEN** a consumer attempts to change an Instrument field, a nested Trading Line field, or a returned array obtained from a catalog operation
- **THEN** subsequent catalog reads still return the validated stored value

### Requirement: Identifier lookup failures are explicit

The system SHALL return a machine-readable failure when an Instrument identifier does not exist. A request to resolve Trading Lines SHALL reject blank identifiers, duplicate identifiers, and any identifier absent from the catalog without returning a partial successful set. A successful Trading Line resolution SHALL return each requested line exactly once in request order.

#### Scenario: Instrument identifier is unknown

- **WHEN** a consumer requests an Instrument identifier absent from the catalog
- **THEN** the system returns an `instrument-not-found` failure identifying the requested value

#### Scenario: Trading Line request contains an unknown identifier

- **WHEN** a consumer requests one or more unknown Trading Line identifiers
- **THEN** the system returns a `trading-line-not-found` failure identifying every missing value and no partial Trading Line set

#### Scenario: Trading Line request contains a duplicate

- **WHEN** a consumer requests the same Trading Line identifier more than once
- **THEN** the system returns an `invalid-request` failure before returning any Trading Lines

#### Scenario: Trading Lines resolve successfully

- **WHEN** a consumer requests distinct recognized Trading Line identifiers
- **THEN** the system returns those Trading Lines exactly once and in the requested order

#### Scenario: No Trading Lines are requested

- **WHEN** a consumer requests an empty list of Trading Line identifiers
- **THEN** the system returns a successful empty ordered result

### Requirement: The initial catalog represents the first supported relationships

The version-1 repository catalog SHALL initially contain the Galicia and YPF stock Instruments, the Apple stock Instrument, and the Apple CEDEAR Instrument. Galicia and YPF stocks SHALL each own their BYMA ARS Trading Line. Apple stock SHALL own its NASDAQ USD Trading Line. The Apple CEDEAR SHALL own its BYMA ARS Trading Line and reference Apple stock as its Underlying Instrument.

#### Scenario: Initial catalog loads

- **WHEN** the repository's version-1 catalog is loaded
- **THEN** all four Instruments and their Trading Lines are available through the catalog interface with the Apple CEDEAR related to Apple stock

### Requirement: The catalog does not select acquisition or analysis policy

The Instrument Catalog SHALL describe Instruments, their embedded Trading Lines, and CEDEAR-to-Underlying-Instrument relationships without selecting a market-data provider, declaring provider support, selecting a Trading Line for technical analysis, or choosing a fallback Trading Line.

#### Scenario: Scheduled work resolves an explicitly configured Trading Line

- **WHEN** scheduled orchestration resolves a configured Trading Line identifier through the catalog
- **THEN** the catalog returns that Trading Line's facts without selecting a provider or adding related Trading Lines

#### Scenario: Consumer requests a CEDEAR

- **WHEN** a consumer resolves a CEDEAR Instrument
- **THEN** the catalog returns its Underlying Instrument reference without selecting which Underlying Instrument Trading Line should feed analysis
