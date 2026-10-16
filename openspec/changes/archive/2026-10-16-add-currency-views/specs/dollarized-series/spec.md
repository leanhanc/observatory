## ADDED Requirements

### Requirement: CCL equivalents divide pesos by a stated session's CCL Rate

`toCclEquivalent(valueInPesos, cclRate)` SHALL return the peso value divided by the rate: a peso price expressed in dollars settled abroad (CCL) at that rate, as ADR 0005 allows for display. A MEP-dollar price reaches CCL dollars through pesos at one session: `toCclEquivalent(toPesoEquivalent(price, mepRate), cclRate)`, with the MEP Rate and the CCL Rate of that same session. The caller SHALL pass the rate of the session the CCL equivalent describes and SHALL state that session alongside the result; it SHALL NOT pass another session's rate when that session has none. The result is not a price of the cable line: it describes the peso line in CCL dollars on that session. `cclRate` SHALL be positive and finite; this is not checked.

The CCL equivalent is for display only. It SHALL NOT enter the Dollarized Series or any analysis.

#### Scenario: a peso close at a session's CCL Rate

- **WHEN** a peso close is 5940 and the session's CCL Rate is 1612.38
- **THEN** its CCL equivalent is 5940 / 1612.38

#### Scenario: a MEP-dollar level through the same session's rates

- **WHEN** a swing is 4 MEP dollars, and the session's MEP Rate is 1500 and its CCL Rate 1600
- **THEN** its CCL equivalent at that session is 6000 / 1600, 3.75

#### Scenario: the same factor keeps the order

- **WHEN** a close is below a swing in MEP dollars and both are converted with one session's MEP Rate and CCL Rate
- **THEN** the close is below the swing in CCL dollars, by the same percentage
