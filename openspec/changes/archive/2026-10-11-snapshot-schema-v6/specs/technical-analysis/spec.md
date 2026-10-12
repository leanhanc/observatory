## RENAMED Requirements

- FROM: `### Requirement: session-aligned Volatility Expansion Events`
- TO: `### Requirement: session-aligned Volatile Session Events`

- FROM: `### Requirement: strict expansion threshold and explicit unavailable behavior`
- TO: `### Requirement: strict ATR-multiple threshold and explicit unavailable behavior`

- FROM: `### Requirement: Volatility Expansion replay is causal`
- TO: `### Requirement: Volatile Session replay is causal`

## MODIFIED Requirements

### Requirement: session-aligned Volatile Session Events

The technical-analysis module SHALL expose a pure `detectVolatileSessionEvents(bars)` function returning one `VolatileSessionRow` per input completed Daily Bar in chronological input order. Each row SHALL contain `sessionDate` and `event`, either a `VolatileSessionEvent` or `null`. Empty input SHALL return an empty array. The calculation SHALL NOT perform I/O or mutate input.

Each Event SHALL contain only `type: 'volatile-session'`, `trueRange`, `baselineAtr`, `baselineThroughSessionDate`, and `atrMultiple`. The wrapper SHALL own the Event session date.

#### Scenario: aligned output and immutable input

- **WHEN** detection receives frozen validated Daily Bars ordered oldest to newest
- **THEN** calculation succeeds without mutation and returns the same number and order of session dates
- **AND** each row contains its Event or `null`

#### Scenario: empty history

- **WHEN** no bars are supplied
- **THEN** the result is empty

### Requirement: fixed prior-session volatility baseline

Volatile Session SHALL use the project-wide Analysis Configuration settings Wilder ATR period 14 and ATR-multiple threshold 1.8, neither configurable by caller nor user. It SHALL reuse the existing True Range and ATR calculations. At position `i`, `atrMultiple` SHALL equal current True Range divided by ATR14 at `i - 1`. The baseline SHALL exclude the current session and SHALL NOT average multiple ATR values.

#### Scenario: current movement cannot raise its own baseline

- **WHEN** prior ATR14 is 10 and current True Range is 19
- **THEN** the multiple is 1.9 and an Event is emitted
- **AND** the current session's updated ATR does not affect this decision

#### Scenario: changing volatility does not use a second smoothing window

- **WHEN** the previous session's ATR14 differs from the mean of the latest 20 ATR14 values
- **THEN** the denominator is exactly the previous session's ATR14
- **AND** Event existence and evidence follow that denominator

#### Scenario: earliest readable prior ATR

- **WHEN** the fourteenth input bar first establishes ATR14
- **THEN** its Event remains `null`
- **AND** the fifteenth input bar is the first eligible session if its prior ATR is finite and positive

### Requirement: strict ATR-multiple threshold and explicit unavailable behavior

An Event SHALL emit if and only if readable `atrMultiple > 1.8`. Equality and smaller multiples SHALL produce `null`. A missing, non-finite, or non-positive prior ATR SHALL produce `null`, without substituting values or falling back to an older baseline. A non-finite current True Range or computed multiple SHALL also produce `null`. Finite ratios SHALL be compared without rounding or an equality tolerance.

#### Scenario: threshold equality

- **WHEN** current True Range is 18 and prior ATR14 is 10
- **THEN** the multiple is exactly 1.8 and no Event is emitted

#### Scenario: unavailable baseline

- **WHEN** prior ATR14 is missing, NaN, infinite, zero, or negative
- **THEN** that session contains a `null` Event

#### Scenario: unusable current measurement

- **WHEN** current True Range or its ratio to a readable prior ATR is non-finite
- **THEN** that session contains a `null` Event

### Requirement: direction-neutral movement includes gaps

Volatile Session SHALL describe only unusually large completed-session movement magnitude, relative to the line's own recent range rather than to any absolute level. It SHALL NOT encode direction, continuation, reversal, opportunity, a price target, or the start of a phase of widening ranges. True Range SHALL include previous-close gaps under the canonical indicator contract. A future Gap Event or another independent Event MAY coexist without suppressing Volatile Session.

#### Scenario: large intraday range

- **WHEN** the current high-low range alone exceeds 1.8 times readable prior ATR14
- **THEN** the session produces a Volatile Session Event

#### Scenario: narrow range after a large opening gap

- **WHEN** the current high-low range is narrow but its previous-close gap makes True Range exceed 1.8 times prior ATR14
- **THEN** the session produces a Volatile Session Event

#### Scenario: upward and downward movement

- **WHEN** upward and downward movement produce equal True Range against equal readable prior ATR14
- **THEN** both produce the same direction-neutral Event evidence and identity when the threshold is exceeded

### Requirement: baseline evidence identifies the previous input session

`baselineThroughSessionDate` SHALL equal the immediately preceding input bar's session date. `trueRange`, `baselineAtr`, and `atrMultiple` SHALL preserve the actual unrounded measurements used in evaluation.

#### Scenario: calendar gap between sessions

- **WHEN** the previous available input session is several calendar days before the qualifying session
- **THEN** baseline evidence identifies that previous input session, not an invented calendar date

### Requirement: Volatile Session replay is causal

Every row SHALL depend only on bars available through its completed session. Full-history detection and detection over every prefix SHALL produce identical rows through each shared cutoff.

#### Scenario: every-prefix replay

- **WHEN** detection runs over a history and each prefix
- **THEN** every prefix result equals the corresponding full-history slice
- **AND** appending later bars does not change any earlier Event or evidence

## REMOVED Requirements

### Requirement: independent single-session historical facts

**Reason**: Its scenario named the Event by its old term. The same contract continues as "each Volatile Session is an independent historical fact"; OpenSpec cannot rename a scenario inside a MODIFIED requirement.

**Migration**: None; the behavior is unchanged.

## ADDED Requirements

### Requirement: each Volatile Session is an independent historical fact

One qualifying completed session SHALL suffice. Consecutive qualifying sessions SHALL each emit their own Event with their respective prior-session baseline. Later sessions SHALL NOT retract earlier Events. Confirmation, cooldowns, persistence, and notification grouping SHALL remain outside this capability.

#### Scenario: consecutive Volatile Sessions

- **WHEN** two consecutive sessions each exceed the threshold against their own prior ATR14
- **THEN** both sessions contain Events without waiting for confirmation or suppressing the second
