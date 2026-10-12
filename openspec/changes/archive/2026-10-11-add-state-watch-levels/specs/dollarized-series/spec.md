## ADDED Requirements

### Requirement: peso equivalents apply a stated session's rate in reverse

`toPesoEquivalent(valueInMepDollars, mepRate)` SHALL return the value multiplied by the rate: a MEP-dollar price expressed in pesos at that rate, as ADR 0005 allows for display. The caller SHALL pass the rate of the session the peso equivalent describes and SHALL state that session alongside the result. The result is not a peso market price: a level in MEP dollars has a different peso equivalent on every session whose MEP Rate differs. `mepRate` SHALL be positive and finite; this is not checked.

#### Scenario: a level at a session's rate

- **WHEN** a swing high is 4 MEP dollars and the session's MEP Rate is 1500
- **THEN** its peso equivalent at that session is 6000

#### Scenario: inverse of dollarization on the same session

- **WHEN** a peso close of 1050 is dollarized with a rate of 1000 and the result is converted back with the same rate
- **THEN** the peso equivalent is 1050 within floating-point error
