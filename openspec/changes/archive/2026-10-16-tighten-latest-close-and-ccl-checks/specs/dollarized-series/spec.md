## MODIFIED Requirements

### Requirement: dollarized bars divide by the same-session rate

`dollarizeBarHistory(pesoLineBars, mepRates)` SHALL return `{ bars, sessionsWithoutMepRate }`. For each peso bar with a MEP rate for the same session, the bar SHALL have open, high, low and close divided by that rate; `sessionDate` and `volume` SHALL be copied unchanged, because volume is a share count and not money. A zero-volume peso bar SHALL be dollarized like any other bar when its session has a MEP rate: Bar History keeps such bars as valid, and whether analysis uses them is not this calculation's decision. The bond-leg volume rule differs because the rate itself must come from real trades. `pesoLineBars` SHALL be a validated Daily Bar history and each `mepRate` SHALL be positive and finite; no sorting or validation is performed. Output bars SHALL keep the peso bars' order. The calculation SHALL NOT mutate input. Rates for sessions without a peso bar SHALL be ignored.

`dollarizePrice(valueInPesos, mepRate)` SHALL return the peso value divided by the rate, the division `dollarizeBarHistory` applies to each price, for a caller that dollarizes one price of a stated session, such as the previous close of a day change. The caller SHALL pass that session's own rate and SHALL NOT pass another session's when it has none. `mepRate` SHALL be positive and finite; this is not checked.

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

#### Scenario: one price at its session's rate

- **WHEN** a peso close of 5880 is dollarized with its session's MEP Rate of 1470
- **THEN** `dollarizePrice` returns 4, the close `dollarizeBarHistory` gives that bar
