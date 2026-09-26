# technical-analysis Specification

## Purpose

Provide pure, session-aligned EMA, True Range, Wilder ATR, Wilder RSI, and confirmed Market Structure calculations so later analysis can derive descriptive Features and Structure from completed-session market facts without I/O, lookahead, or invented warm-up values.

## Requirements

### Requirement: aligned indicator calculation

The module SHALL calculate requested EMA periods, Wilder ATR, and Wilder RSI as arrays
aligned one-to-one with the input `DailyBar` sessions. A value at index `i` SHALL depend
only on input positions through `i`.

#### Scenario: warm-up is absent

- **WHEN** EMA(20), ATR(14), and RSI(14) are calculated
- **THEN** EMA positions 0 through 18 are `null`
- **AND** ATR positions 0 through 12 are `null`
- **AND** RSI positions 0 through 13 are `null`
- **AND** no warm-up position is represented as zero

#### Scenario: invalid periods fail explicitly

- **WHEN** a requested period is zero, negative, non-integral, or non-finite
- **THEN** calculation throws `TypeError`

### Requirement: historical numeric parity

The implementation SHALL preserve the committed NFLX fixture conventions: EMA uses
`2/(period+1)` seeded from the first close; True Range uses the greatest of the bar range
and the two previous-close gaps, with the first bar using `high-low`; ATR uses Wilder
smoothing seeded by the first period True Ranges; RSI uses Wilder-smoothed gains and losses.

#### Scenario: NFLX reference session

- **WHEN** the 501-session NFLX fixture is calculated through 2026-08-21
- **THEN** EMA(20) is 76.17 within 0.01
- **AND** EMA(50) is 76.73 within 0.01
- **AND** EMA(200) is 87.44 within 0.01
- **AND** ATR(14) is 2.35 within 0.01
- **AND** RSI(14) is 61.61 within 0.01

### Requirement: edge behavior

RSI SHALL report 100 when the Wilder average loss is zero and average gain is positive.
A falling series SHALL produce an RSI of 0 once warmed up. RSI SHALL report no value when
average gain and average loss are both zero because the series has not established a
direction. A later flat session SHALL preserve an already-established RSI through Wilder
smoothing.

#### Scenario: directional edge series

- **WHEN** warmed-up RSI is calculated over strictly rising and strictly falling series
- **THEN** their values are 100 and 0 respectively

#### Scenario: flat series has not established a direction

- **WHEN** RSI is calculated over a series whose closes have never changed
- **THEN** every position reports no value

#### Scenario: later flat session preserves established RSI

- **WHEN** RSI has been established and the next close is unchanged
- **THEN** Wilder smoothing preserves the prior RSI value

### Requirement: session-aligned confirmed market structure

The technical-analysis module SHALL return one Structure result per completed `DailyBar` session in input order. Each result SHALL contain that session date, a classification of `uptrend`, `downtrend`, `range`, or the string `undefined`, and only swings newly confirmed at that session. Each public swing SHALL carry its kind, price, occurrence session date, and confirmation session date. The calculation SHALL be pure and SHALL NOT mutate its input.

#### Scenario: empty and short histories

- **WHEN** no bars are supplied
- **THEN** the result is empty
- **WHEN** there are fewer than seven completed bars
- **THEN** every result is `undefined` with no confirmed swings

#### Scenario: occurrence differs from confirmation

- **WHEN** a unique extreme occurs at input position 4 under v1's fixed three-bar rule
- **THEN** it is absent from results through position 6
- **AND** it appears as newly confirmed at position 7 with both occurrence and confirmation session dates
- **AND** it may first influence classification at position 7

#### Scenario: replaying a prefix

- **WHEN** structure is calculated for a history and each prefix of that history
- **THEN** the last result of every prefix equals the corresponding full-history result
- **AND** no result uses later bars or a swing before its confirmation session

### Requirement: strict confirmed swing extrema

In Analysis Configuration v1, a swing candidate SHALL have three earlier and three later completed bars. A swing high SHALL have a high strictly greater than every other high in that seven-bar window. A swing low SHALL have a low strictly less than every other low in that window. The two comparisons SHALL be independent.

#### Scenario: plateau and flat history

- **WHEN** an eligible candidate ties another high or low in its window
- **THEN** it is not a swing of that kind
- **AND** a flat history produces no swings and remains `undefined`

#### Scenario: outside bar

- **WHEN** a completed bar has both the uniquely highest high and uniquely lowest low in its window
- **THEN** both kinds of swing are confirmed together three input positions later

### Requirement: classify only confirmed same-kind swing pairs

Structure SHALL compare the last two confirmed highs only with each other and the last two confirmed lows only with each other. Both rising pairs SHALL yield `uptrend`; both falling pairs SHALL yield `downtrend`. With two swings of each kind, equal or conflicting comparisons SHALL yield `range`. With fewer than two of either kind, Structure SHALL be `undefined`. No alternation between swing kinds is required.

#### Scenario: equal pair

- **WHEN** the latest two confirmed highs are equal and the latest two confirmed lows rise
- **THEN** Structure is `range`

#### Scenario: consecutive same-kind swings

- **WHEN** two high swings confirm consecutively without an intervening low swing
- **THEN** both highs remain eligible as the latest same-kind pair
- **AND** the latest two confirmed lows are selected independently

### Requirement: expire a contradicted trend label

An `uptrend` SHALL become `undefined` when a completed close is strictly below its latest defining confirmed swing low. A `downtrend` SHALL become `undefined` when a completed close is strictly above its latest defining confirmed swing high. Equality SHALL preserve the label. Expiry SHALL remain in effect while the defining confirmed swings remain unchanged, even if a later close crosses back. A newly confirmed swing SHALL permit reclassification using the current confirmed pairs and close.

#### Scenario: downtrend invalidated by current close

- **WHEN** the latest confirmed highs and lows descend but the current completed close rises above the latest confirmed swing high
- **THEN** Structure is `undefined`
- **AND** the current close is not promoted into a swing
- **AND** a later close below that high does not revive the old label without a new confirmed swing

#### Scenario: equality does not expire a trend

- **WHEN** an uptrend closes exactly at its defining swing low or a downtrend closes exactly at its defining swing high
- **THEN** the respective trend label remains

### Requirement: session-aligned descriptive Regime

The technical-analysis module SHALL expose a pure `calculateRegime(bars)` function that returns one result per input completed `DailyBar`, preserving input order and session identity. Each result SHALL contain a `sessionDate` and one canonical label: `bullish`, `bearish`, `mixed`, or the string `undefined`. Empty input SHALL return an empty result. The function SHALL NOT mutate its input and SHALL NOT perform I/O.

#### Scenario: one result per session

- **WHEN** `calculateRegime` receives a chronological list of completed Daily Bars
- **THEN** it returns the same number of rows
- **AND** each row retains the corresponding session date and order

#### Scenario: empty history

- **WHEN** no Daily Bars are supplied
- **THEN** the result is empty

### Requirement: fixed v1 Analysis Configuration

Regime v1 SHALL use the module-owned, versioned settings EMA(50), EMA(200), ATR(14), an ATR band multiplier of `0.5`, and three readable-session transition confirmations. These settings SHALL NOT be caller parameters or user customization. The implementation SHALL reuse the existing EMA and ATR calculations.

#### Scenario: fixed analytical conventions

- **WHEN** two callers calculate Regime for the same Daily Bar history
- **THEN** both use EMA50, EMA200, ATR14, the `0.5` ATR band, and three confirmations
- **AND** neither caller can silently produce a different v1 interpretation by passing custom parameters

### Requirement: causal Regime predicates

For every session where Close, EMA50, EMA200, and ATR14 are available, the proposal SHALL be `bullish` when `close > EMA200 + 0.5 * ATR14` and `EMA50 > EMA200`. It SHALL be `bearish` when `close < EMA200 - 0.5 * ATR14` and `EMA50 < EMA200`. Differences no larger than `8 * Number.EPSILON * max(|value|, |threshold|)` SHALL count as equality rather than directional evidence. Every other readable combination SHALL propose `mixed`.

#### Scenario: directional agreement

- **WHEN** price clears the upper or lower ATR band and EMA50 is on the same side of EMA200
- **THEN** the proposal is respectively `bullish` or `bearish`

#### Scenario: disagreement is mixed

- **WHEN** only price clears the band or only EMA50 is on the directional side of EMA200
- **THEN** the proposal is `mixed`

#### Scenario: equality is not directional

- **WHEN** Close equals either band edge or EMA50 equals EMA200
- **THEN** the proposal is `mixed`

#### Scenario: flat history has no false direction from rounding

- **WHEN** all closes are identical and both EMA periods have warmed up
- **THEN** tiny floating-point EMA drift is treated as equality
- **AND** the proposal is `mixed`

### Requirement: explicit unavailable behavior

A session SHALL be `undefined` when any required input measurement is unavailable or non-finite. Warm-up positions SHALL remain `undefined`; no missing value SHALL be replaced with zero or another fabricated numeric value. An unavailable session SHALL not alter or advance transition state.

#### Scenario: indicator warm-up

- **WHEN** EMA50, EMA200, or ATR14 has not warmed up
- **THEN** the corresponding Regime row is `undefined`

#### Scenario: isolated missing measurement

- **WHEN** a later session lacks any required measurement
- **THEN** that row is `undefined`
- **AND** it does not count toward transition confirmation

### Requirement: hysteretic transitions

The first fully readable session SHALL adopt its proposal immediately. After that, a proposal different from the settled label SHALL replace it only after three consecutive readable sessions with the same proposal. A proposal equal to the settled label SHALL clear the pending candidate. A different proposal SHALL replace the pending candidate and restart its count at one. The rule SHALL apply to transitions among `bullish`, `bearish`, and `mixed`.

#### Scenario: three confirmations are required

- **WHEN** a different readable proposal occurs for one or two consecutive sessions
- **THEN** the settled label remains unchanged
- **AND** the candidate count remains pending

#### Scenario: third confirmation transitions

- **WHEN** the same different proposal occurs for three consecutive readable sessions
- **THEN** the settled label changes on the third session
- **AND** pending state resets

#### Scenario: interrupted candidate

- **WHEN** a pending candidate is followed by a different proposal
- **THEN** the new proposal becomes the pending candidate with count one

#### Scenario: sustained mixed context

- **WHEN** a settled directional label receives three consecutive `mixed` proposals
- **THEN** the settled label becomes `mixed`

### Requirement: causal replay

Every output at position `i` SHALL depend only on input positions through `i`. Recalculating any prefix SHALL produce the same rows as the corresponding prefix of the full-history result. The implementation SHALL calculate complete history oldest-to-newest and SHALL NOT add stateful incremental infrastructure in v1.

#### Scenario: prefix replay

- **WHEN** Regime is calculated for a full history and for each prefix
- **THEN** each prefix result equals the corresponding full-history rows

### Requirement: session-aligned Structure Break Events

The technical-analysis module SHALL expose a pure `detectStructureBreakEvents(bars)` calculation that returns one result per completed `DailyBar` session in input order. Each result SHALL contain that session date and either one `StructureBreakEvent` or `null`. The calculation SHALL NOT mutate its input and SHALL NOT perform I/O.

Each Event SHALL have type `structure-break`, a direction of `upward` or `downward`, the prior directional Structure, the defining confirmed swing, and the completed session's closing price as `closePrice`. The result row's `sessionDate` SHALL identify the break session.

#### Scenario: empty and insufficient histories

- **WHEN** no bars are supplied
- **THEN** the result is empty
- **WHEN** Structure has not become directional
- **THEN** every corresponding result contains a `null` Event

#### Scenario: input remains unchanged

- **WHEN** Structure Break Events are detected from frozen input bars
- **THEN** calculation succeeds without mutating the bars

### Requirement: break only a previously established directional Structure

An Event at a completed session SHALL evaluate only the directional Structure and defining swing known at the previous completed session. An `uptrend` SHALL use its latest confirmed swing low and may break only `downward`. A `downtrend` SHALL use its latest confirmed swing high and may break only `upward`. A previous Structure of `range` or `undefined` SHALL produce no Structure Break Event.

#### Scenario: downward break of an uptrend

- **WHEN** the previous completed session has an `uptrend` defined by a confirmed swing low
- **AND** the current completed session closes strictly below that swing price
- **THEN** the current result contains a downward Structure Break Event carrying the prior `uptrend` and defining swing

#### Scenario: upward break of a downtrend

- **WHEN** the previous completed session has a `downtrend` defined by a confirmed swing high
- **AND** the current completed session closes strictly above that swing price
- **THEN** the current result contains an upward Structure Break Event carrying the prior `downtrend` and defining swing

#### Scenario: no directional Structure

- **WHEN** the previous completed session is `range` or `undefined`
- **THEN** crossing any confirmed swing price produces no Structure Break Event

### Requirement: defining swings are already confirmed

The defining swing SHALL have been confirmed no later than the previous completed session. A swing newly confirmed on the current session SHALL NOT establish a Structure that the same close can retroactively break. Current price SHALL NOT be promoted into a swing.

#### Scenario: current-session swing confirmation is not retroactive

- **WHEN** a swing confirmed on the current completed session first establishes directional Structure
- **AND** the current close is already beyond the defining swing price of that newly established Structure
- **THEN** no Event is produced from a Structure first established by that swing

#### Scenario: current confirmation does not erase a prior break

- **WHEN** the current session closes beyond the defining swing of the previous directional Structure
- **AND** a different swing also becomes confirmed on the current session
- **THEN** the Event records the break of the previous Structure and its previously confirmed defining swing
- **AND** the newly confirmed swing remains available only to current and later Structure classification

### Requirement: strict completed-close crossing

A Structure Break Event SHALL occur only when the completed close is strictly beyond the defining swing price. Equality SHALL NOT be a break. An intraday high or low beyond the level SHALL NOT be a break when the close remains on the sustaining side. A gap SHALL qualify when its completed close is strictly beyond the level.

#### Scenario: wick does not break Structure

- **WHEN** an uptrend session trades below its defining swing low but closes at or above it
- **THEN** no Structure Break Event is produced

#### Scenario: equality does not break Structure

- **WHEN** an uptrend closes exactly at its defining swing low or a downtrend closes exactly at its defining swing high
- **THEN** no Structure Break Event is produced

#### Scenario: completed gap crossing qualifies

- **WHEN** a session gaps across the defining swing and completes with its close strictly beyond the level
- **THEN** a Structure Break Event is produced

### Requirement: record each crossing once

The module SHALL record one Event for the first strict completed-close crossing of the active defining swing. Later sessions that remain beyond the same level SHALL NOT repeat the Event. A newly confirmed swing may permit Structure to be established again, but that Structure SHALL be eligible to break only on a later completed session.

#### Scenario: remaining beyond the level does not repeat

- **WHEN** one session records a Structure Break Event
- **AND** later sessions remain beyond the same defining swing without newly establishing directional Structure
- **THEN** those later sessions contain `null` Events

### Requirement: Event existence is not volatility-scaled

Structure Break Event existence SHALL NOT depend on ATR availability, an ATR threshold, or any penetration threshold. The Event SHALL NOT include raw or ATR-scaled penetration distance.

#### Scenario: break without ATR

- **WHEN** the previously confirmed defining level is strictly crossed by the completed close
- **AND** ATR is unavailable
- **THEN** the Structure Break Event is still produced

### Requirement: Structure Break replay is causal

Every Event SHALL depend only on bars and confirmed swings available through its session. Detecting Events over a complete history and over every prefix SHALL produce identical results through each shared cutoff.

#### Scenario: replaying every prefix

- **WHEN** Structure Break Events are detected for a history and each prefix of that history
- **THEN** the last result of every prefix equals the corresponding full-history result
- **AND** no Event uses a swing before its confirmation session

### Requirement: session-aligned Regime Transition Events

The technical-analysis module SHALL expose a pure `detectRegimeTransitionEvents(bars)` calculation
that returns one result per completed `DailyBar` session in input order. Each result SHALL contain
that session date and either one `RegimeTransitionEvent` or `null`. Empty input SHALL return an empty
result. The calculation SHALL NOT mutate its input and SHALL NOT perform I/O.

Each Event SHALL have type `regime-transition`, different readable `from` and `to` Regime labels,
and exactly three `confirmingSessionDates`. The result row's `sessionDate` SHALL identify the
effective transition session and SHALL NOT be duplicated inside the Event.

#### Scenario: empty and warm-up histories

- **WHEN** no bars are supplied or no Regime proposal is readable
- **THEN** the result is respectively empty or contains only `null` Events

#### Scenario: input remains unchanged

- **WHEN** Regime Transition Events are detected from frozen input bars
- **THEN** calculation succeeds without mutating the bars

### Requirement: only settled readable Regime changes are Events

The first readable Regime proposal SHALL initialize settled Regime without producing an Event. After
initialization, every settled change between `bullish`, `bearish`, and `mixed` SHALL produce one Event
on the third matching readable proposal. An Event SHALL never have `undefined` or equal `from` and
`to` labels.

#### Scenario: initial availability is not a transition

- **WHEN** warm-up ends and the first readable Regime proposal is adopted
- **THEN** that session contains a `null` Event

#### Scenario: directional Regime becomes mixed

- **WHEN** settled Regime is `bullish` and three matching readable `mixed` proposals occur
- **THEN** the third proposal session contains a `bullish` to `mixed` Event

#### Scenario: mixed Regime becomes directional

- **WHEN** settled Regime is `mixed` and three matching readable `bearish` proposals occur
- **THEN** the third proposal session contains a `mixed` to `bearish` Event

#### Scenario: direct directional reversal

- **WHEN** settled Regime is `bearish` and three matching readable `bullish` proposals occur
- **THEN** the third proposal session contains a `bearish` to `bullish` Event

#### Scenario: only two proposals

- **WHEN** only two matching readable proposals differ from settled Regime
- **THEN** neither session contains an Event

### Requirement: pending confirmation follows Regime State

Regime Transition detection SHALL use the same internal transition engine as `calculateRegime`. A
proposal equal to settled Regime SHALL clear the pending candidate. A readable proposal different
from both settled Regime and the pending candidate SHALL replace the candidate and restart its count
at one. An unreadable session SHALL neither advance nor cancel pending transition State.

#### Scenario: settled proposal clears the candidate

- **WHEN** two matching candidate proposals are followed by a proposal equal to settled Regime
- **THEN** the candidate is cleared
- **AND** a later matching candidate requires three new confirmations

#### Scenario: different proposal replaces the candidate

- **WHEN** a pending candidate is followed by another readable proposal different from it and from
  settled Regime
- **THEN** the new proposal becomes the candidate with one confirmation

#### Scenario: unreadable gap preserves the candidate

- **WHEN** matching readable candidate proposals are separated by an unreadable session
- **THEN** the unreadable session neither advances nor cancels the candidate
- **AND** the Event lists the three actual readable confirming session dates

### Requirement: record each Regime Transition once

One Event SHALL occur on the session that changes settled Regime. Later sessions that retain that
Regime SHALL NOT repeat the Event.

#### Scenario: retained Regime does not repeat

- **WHEN** one session records a Regime Transition Event
- **AND** later readable proposals equal the new settled Regime
- **THEN** those later sessions contain `null` Events

### Requirement: Regime Transition evidence is minimal

The Event SHALL contain the prior Regime, replacement Regime, and the three actual readable
confirming session dates. It SHALL NOT duplicate Close, EMA50, EMA200, or ATR14 measurements.
Presentation-time history queries or indicator recalculation SHALL NOT be part of this capability.

#### Scenario: transition evidence identifies causal proposals

- **WHEN** the third matching readable proposal changes settled Regime
- **THEN** `confirmingSessionDates` identifies the three readable proposal sessions in order
- **AND** the wrapper identifies the third date as the effective session

### Requirement: Regime Transition replay is causal

Every Event SHALL depend only on bars and measurements available through its completed session.
Detecting Events over a complete history and over every prefix SHALL produce identical results through
each shared cutoff.

#### Scenario: replaying every prefix

- **WHEN** Regime Transition Events are detected for a history and each prefix of that history
- **THEN** the last result of every prefix equals the corresponding full-history result

### Requirement: Regime Transition is independent of Structure Break

Regime Transition Event calculation SHALL neither consume nor alter Structure Break Events. Both
Event types MAY be valid on the same completed session. Cross-Event composition SHALL remain outside
this capability.

#### Scenario: same-session Structure Break does not suppress Regime Transition

- **WHEN** the third confirming Regime proposal occurs on a session that also satisfies the
  independent Structure Break contract
- **THEN** Regime Transition calculation still emits its Event
