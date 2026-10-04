## MODIFIED Requirements

### Requirement: same-session MEP rate from a bond pair

The dollarized-series module SHALL expose a pure `calculateMepRates(pesoBondBars, dollarBondBars)` returning one `{ sessionDate, mepRate }` row for each session in which both legs traded, in the order of the peso-bond input. Inputs SHALL be chronological, with one bar per session and positive finite closes. Open, high and low are not read, so a bar whose only defect is in those fields still yields a correct rate. The calculation SHALL NOT sort or validate them. `mepRate` SHALL equal the peso-bond close divided by the dollar-bond close of that same session. Open, high and low SHALL NOT be used. The calculation SHALL NOT mutate input or perform I/O.

#### Scenario: close ratio of the same session

- **WHEN** a session has peso-bond close 90000 and dollar-bond close 60 and different opens
- **THEN** its `mepRate` is 1500

#### Scenario: sessions are matched by date

- **WHEN** the legs share only some session dates
- **THEN** only shared sessions produce rows
