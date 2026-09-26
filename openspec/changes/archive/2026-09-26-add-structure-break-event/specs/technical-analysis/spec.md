## ADDED Requirements

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
