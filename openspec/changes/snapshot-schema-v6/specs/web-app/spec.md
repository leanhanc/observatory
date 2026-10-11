## MODIFIED Requirements

### Requirement: a line page renders what the snapshot says about the line

A line page SHALL render the line's Trading Line ID and status from the snapshot and SHALL NOT compute domain values.

For an available line it SHALL render the latest State, its session date, Regime, Structure, RSI, price relative to the EMA in ATRs, and price relative to the long-term EMA as a percentage, showing a `null` part as not evaluated, never as a number. It SHALL render the line's Events in snapshot order, each with its session date, its type, its fields, and whether its session coincides with a Large One-Session Move. An available line without Events SHALL say it has none.

Every price and ATR the page shows, such as a Structure Break's close and swing price or a Volatile Session's True Range and baseline ATR, SHALL be labeled with the snapshot's `priceUnit`; `mep-dollar` SHALL be labeled `MEP dollars`. The page SHALL take the unit from the snapshot and SHALL NOT assume one. Ratios, percentages and ATR multiples SHALL NOT be labeled with a price unit.

For an unavailable line it SHALL render the reason and message. For reason `insufficient-liquidity` it SHALL also render the participation and median daily traded value in USD, showing a `null` median as no trades in the window.

#### Scenario: an available line

- **WHEN** a line's State has Regime `bearish`, Structure `downtrend`, RSI `null` and price relative to the long-term EMA `-4.2`, and it has a Volatile Session
- **THEN** its page shows `bearish`, `downtrend`, RSI as not evaluated, `-4.2%`, and the Volatile Session with its session date, True Range, baseline ATR and multiple

#### Scenario: long-term EMA not yet readable

- **WHEN** a line's State has price relative to the long-term EMA `null`
- **THEN** its page shows it as not evaluated

#### Scenario: prices carry the snapshot's unit

- **WHEN** the snapshot's `priceUnit` is `mep-dollar` and a line has a Structure Break with close 7.12
- **THEN** the page shows the close as `7.12 MEP dollars`
- **AND** the Event's multiples and the State's ratios carry no price unit

#### Scenario: an insufficiently liquid line

- **WHEN** a line is unavailable with reason `insufficient-liquidity`, participation 1 and median daily traded value 43,290 USD
- **THEN** its page shows the reason, the message and both measures

#### Scenario: a line without provider bars

- **WHEN** a line is unavailable with reason `no-provider-bars`
- **THEN** its page shows the reason and message
