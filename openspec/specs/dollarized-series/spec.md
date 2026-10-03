# dollarized-series Specification

## Purpose

Provide the Dollarized Series: a peso-line Bar History expressed in MEP dollars by dividing each Daily Bar's prices by the same session's MEP rate, which is implied by a bond quoted in pesos and dollars. This capability derives values from Daily Bars and configures which bond's Trading Lines imply the MEP rate. It does not fetch or store data, and it does not decide which Instruments or Trading Lines feed analysis.

## Requirements

### Requirement: same-session MEP rate from a bond pair

The dollarized-series module SHALL expose a pure `calculateMepRates(pesoBondBars, dollarBondBars)` returning one `{ sessionDate, mepRate }` row for each session in which both legs traded, in the order of the peso-bond input. Inputs SHALL be validated Daily Bar histories: chronological, one bar per session, with positive finite prices. The calculation SHALL NOT sort or validate them. `mepRate` SHALL equal the peso-bond close divided by the dollar-bond close of that same session. Open, high and low SHALL NOT be used. The calculation SHALL NOT mutate input or perform I/O.

#### Scenario: close ratio of the same session

- **WHEN** a session has peso-bond close 90000 and dollar-bond close 60 and different opens
- **THEN** its `mepRate` is 1500

#### Scenario: sessions are matched by date

- **WHEN** the legs share only some session dates
- **THEN** only shared sessions produce rows

### Requirement: a rate requires two traded legs

A session SHALL produce a MEP rate only when both bond legs have a Daily Bar with volume greater than zero. A zero-volume leg did not trade and its price is not a market fact. Such a session SHALL be absent from the result, and no rate from another session SHALL replace it.

#### Scenario: zero-volume leg

- **WHEN** the dollar-bond bar of a session has volume 0
- **THEN** no rate is produced for that session

#### Scenario: missing dollar leg

- **WHEN** a session exists only in the peso-bond input
- **THEN** no rate is produced for that session

#### Scenario: missing peso leg

- **WHEN** a session exists only in the dollar-bond input
- **THEN** no rate is produced for that session

#### Scenario: no rate is carried across a gap

- **WHEN** sessions 05 and 07 traded on both legs and session 06 has a zero-volume leg or a missing leg
- **THEN** the result contains exactly 05 and 07, each with its own rate

### Requirement: dollarized bars divide by the same-session rate

`dollarizeBarHistory(pesoLineBars, mepRates)` SHALL return `{ bars, sessionsWithoutMepRate }`. For each peso bar with a MEP rate for the same session, the bar SHALL have open, high, low and close divided by that rate; `sessionDate` and `volume` SHALL be copied unchanged, because volume is a share count and not money. A zero-volume peso bar SHALL be dollarized like any other bar when its session has a MEP rate: Bar History keeps such bars as valid, and whether analysis uses them is not this calculation's decision. The bond-leg volume rule differs because the rate itself must come from real trades. `pesoLineBars` SHALL be a validated Daily Bar history and each `mepRate` SHALL be positive and finite; no sorting or validation is performed. Output bars SHALL keep the peso bars' order. The calculation SHALL NOT mutate input. Rates for sessions without a peso bar SHALL be ignored.

#### Scenario: prices are divided and volume is copied

- **WHEN** a peso bar has open 1000, high 1100, low 900, close 1050, volume 500 and the session rate is 1000
- **THEN** the bar becomes open 1, high 1.1, low 0.9, close 1.05 with volume 500

#### Scenario: zero-volume peso bar is still dollarized

- **WHEN** a peso bar has volume 0 and its session has a rate
- **THEN** a dollarized bar is produced with divided prices and volume 0

#### Scenario: peso price that moves only with the rate yields a flat series

- **WHEN** a peso price rises from 2000 to 3000 while the MEP rate rises from 1000 to 1500
- **THEN** both dollarized closes are 2

#### Scenario: rate of another session is never used

- **WHEN** a peso session has no rate but the previous and next sessions do
- **THEN** that session produces no bar

### Requirement: missing rates are reported

Each peso session without a MEP rate SHALL be listed in `sessionsWithoutMepRate` in the order of the peso input and SHALL NOT appear in `bars`. No earlier or later rate SHALL be carried in to fill it.

#### Scenario: dropped sessions are explicit

- **WHEN** two of five peso sessions lack a rate
- **THEN** `bars` has three bars and `sessionsWithoutMepRate` lists the two session dates in peso input order

### Requirement: settlement matching is the caller's contract

Callers SHALL supply peso bars and both bond legs with the same settlement term. The module SHALL NOT verify this, since Daily Bars carry no settlement; both public functions SHALL document the requirement. The CCL/MEP difference and the CEDEAR conversion ratio SHALL NOT be computed or applied.

#### Scenario: CCL/MEP difference is left in the series

- **WHEN** a peso bar is dollarized with a MEP rate
- **THEN** the result equals the peso prices divided by that rate and no other factor

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
