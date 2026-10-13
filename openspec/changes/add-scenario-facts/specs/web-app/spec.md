## MODIFIED Requirements

### Requirement: a line page renders what the snapshot says about the line

A line page SHALL render the line's Trading Line ID and status from the snapshot and SHALL NOT compute domain values.

For an available line it SHALL render the latest State, its session date, Regime, the pending Regime transition, Structure, the last confirmed swing high and low, RSI, price relative to the EMA in ATRs, and price relative to the long-term EMA as a percentage, showing a `null` part as not evaluated, never as a number. A pending Regime transition SHALL show its candidate and its confirmations out of the required ones, and `null` as none, since a missing candidate is a reading rather than a gap. A last confirmed swing SHALL show its price, its occurrence and confirmation session dates and the close's distance from it as a percentage, and `null` as none confirmed yet. For a reader who trades the peso line, the page SHALL also show values from `pesoEquivalents` in pesos, and SHALL NOT convert any value itself. The peso close SHALL be shown with its session as a market fact, not as a conversion. Each last confirmed swing SHALL be shown as an approximate equivalent, with the session and the MEP Rate in pesos per MEP dollar it was converted at, or as none confirmed yet. The page SHALL say that swing levels are found on prices in MEP dollars, and that their peso equivalents move with the MEP Rate and are not prices at which the line turned in pesos. A swing whose distance from the close is `null` SHALL say that the distance was not evaluated.

The page SHALL also render, with plain labels and without computing them:

- **Support and resistance:** whether each last confirmed swing is Support or Resistance, from its `closePosition`. A low whose `closePosition` is `below` SHALL be shown as not Support, with the close below it; a high whose `closePosition` is `above` as not Resistance, with the close above it.
- **Regime tipping closes:** each side's close, labeled as the close Regime's price condition needs as of the State's session, approximate for later sessions, and not a target, together with whether EMA50 is already on that side of EMA200, and in pesos from `pesoEquivalents`. `null` SHALL be shown as not evaluated.
- **Period returns:** each window's percent change with its window length in Market Sessions and its `fromSessionDate`, and `null` as not evaluated, never as `0%`.
- **Situations:** each active Situation's type, `activeSinceSession` and `level`, shown above the detail, and an empty list as none active.

Situation labels on the page SHALL be the plain type names until the wording table defines reader-facing labels. It SHALL render the line's Events in snapshot order, each with its session date, its type, its fields, and whether its session coincides with a Large One-Session Move. An available line without Events SHALL say it has none.

Every price and ATR the page shows, such as a Structure Break's close and swing price, a last confirmed swing's price, or a Volatile Session's True Range and baseline ATR, SHALL be labeled with the snapshot's `priceUnit`; `mep-dollar` SHALL be labeled `MEP dollars`. The page SHALL take the unit from the snapshot and SHALL NOT assume one. Ratios, percentages and ATR multiples SHALL NOT be labeled with a price unit.

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

#### Scenario: watch levels and a pending Regime transition

- **WHEN** a line's State has a pending transition to `bearish` with 2 of 3 confirmations, a last confirmed swing high at 7.5 that occurred 2026-09-01 and was confirmed 2026-09-04 with the close 5% below it, and no confirmed swing low
- **THEN** its page shows the candidate `bearish` with 2 of 3 confirmations
- **AND** the swing high as `7.5 MEP dollars`, its two session dates and `-5%`
- **AND** the swing low as none confirmed yet

#### Scenario: watch levels in pesos

- **WHEN** a line's `pesoEquivalents` has session 2026-10-09, MEP Rate 1500, close 5790 and last confirmed swing high 6000
- **THEN** its page shows the close on 2026-10-09 as 5,790 pesos, without a conversion
- **AND** the swing high as about 6,000 pesos, its equivalent at the 2026-10-09 MEP Rate of 1,500 pesos per MEP dollar
- **AND** that peso equivalents move with the MEP Rate and are not prices at which the line turned in pesos

#### Scenario: support, a Situation and period returns

- **WHEN** a line's State is `bearish`, its last confirmed swing low has `closePosition` `below`, its last confirmed swing high has `closePosition` `at-or-below`, it lists `below-last-confirmed-low-in-bearish-regime` active since 2026-10-02, and its 252-session return is `null`
- **THEN** its page shows the low as not Support, the high as Resistance, the Situation with 2026-10-02 and its level, and the 252-session return as not evaluated

#### Scenario: Regime tipping closes

- **WHEN** a line's tipping closes are above 4.2 and below 3.8 MEP dollars, EMA50 is below EMA200, and their peso equivalents are 6300 and 5700
- **THEN** its page shows both closes in MEP dollars and in pesos, that EMA50 is not above EMA200 on the bullish side and is below it on the bearish side, and that the closes are conditions as of the session

#### Scenario: no pending Regime transition

- **WHEN** a line's State has `pendingRegimeTransition` `null`
- **THEN** its page shows no pending transition, not a missing value

#### Scenario: an insufficiently liquid line

- **WHEN** a line is unavailable with reason `insufficient-liquidity`, participation 1 and median daily traded value 43,290 USD
- **THEN** its page shows the reason, the message and both measures

#### Scenario: a line without provider bars

- **WHEN** a line is unavailable with reason `no-provider-bars`
- **THEN** its page shows the reason and message
