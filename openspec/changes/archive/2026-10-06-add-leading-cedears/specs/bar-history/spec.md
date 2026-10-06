## MODIFIED Requirements

### Requirement: Analysis-history selection remains outside Bar History

Bar History SHALL read and update the Trading Lines requested by its caller without selecting which
history represents an Instrument for technical analysis or substituting a related Trading Line or
a CEDEAR's Underlying.

#### Scenario: Caller selects the histories it needs

- **WHEN** a caller requests histories for a set of Trading Line identifiers
- **THEN** Bar History processes those identifiers without adding or substituting histories based on Instrument relationships
