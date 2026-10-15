## ADDED Requirements

### Requirement: same-session CCL rate from the cable line

The dollarized-series module SHALL expose a pure `calculateCclRates(pesoBondBars, cableBondBars)` returning one `{ sessionDate, cclRate }` row for each session in which both legs traded, in the order of the peso-bond input. `cclRate` SHALL equal the peso-bond close divided by the cable-bond close of that same session: the pesos per dollar settled abroad (CCL, cable) implied by the bond. It SHALL follow every rule of the MEP Rate calculation: only closes are read, a session needs a Daily Bar with volume greater than zero on both legs, a session missing from either leg or with a zero-volume leg is absent, no rate from another session replaces it, and inputs are neither sorted, validated nor mutated. It SHALL share its calculation with `calculateMepRates`, so the two rates differ only in their dollar leg.

The CCL Rate is for display only. It SHALL NOT enter the Dollarized Series or any analysis: `dollarizeBarHistory` divides by MEP Rates only.

#### Scenario: close ratio of the same session

- **WHEN** a session has peso-bond close 86260 and cable-bond close 53.3
- **THEN** its `cclRate` is 86260 / 53.3

#### Scenario: zero-volume cable leg

- **WHEN** the cable-bond bar of a session has volume 0
- **THEN** no CCL rate is produced for that session

#### Scenario: missing cable leg

- **WHEN** a session exists only in the peso-bond input
- **THEN** no CCL rate is produced for that session

#### Scenario: no CCL rate is carried across a gap

- **WHEN** sessions 05 and 07 traded on both legs and session 06 has a zero-volume leg or a missing leg
- **THEN** the result contains exactly 05 and 07, each with its own rate

### Requirement: a configured CCL rate source names the MEP bond's cable line

The dollarized-series module SHALL export `CCL_RATE_SOURCE`, an analysis-configuration constant holding `pesoBondTradingLineId` and `cableBondTradingLineId`, set to `al30-bond-byma-ars` and `al30-bond-byma-usd-ccl`: AL30's peso line and its cable (CCL, "C") line. Its peso leg SHALL be `MEP_RATE_SOURCE`'s peso leg, so that one fetch of AL30 serves both rates. Both identifiers SHALL resolve through the repository Instrument Catalog, both lines SHALL belong to the same `bond` Instrument, and the cable-bond line SHALL be a BYMA USD line whose identifier ends in `-usd-ccl`. Callers SHALL fetch both lines with the same settlement term. The module SHALL NOT fetch either line.

#### Scenario: the cable source shares the MEP peso leg

- **WHEN** `CCL_RATE_SOURCE` and `MEP_RATE_SOURCE` are read
- **THEN** their `pesoBondTradingLineId` is the same

#### Scenario: the cable leg is AL30's BYMA cable line

- **WHEN** the configured cable-bond line is resolved through the repository Instrument Catalog
- **THEN** it belongs to the Instrument that owns the peso-bond line, whose type is `bond`
- **AND** its exchange is `BYMA`, its currency is `USD` and its identifier ends in `-usd-ccl`
