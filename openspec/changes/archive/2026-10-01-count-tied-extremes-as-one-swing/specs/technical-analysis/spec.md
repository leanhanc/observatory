## REMOVED Requirements

### Requirement: strict confirmed swing extrema

**Reason**: Requiring a unique extreme dropped double tops and bottoms, so Structure could keep using a swing that price had already broken.
**Migration**: Use "confirmed swing extrema with one swing per tie".

## ADDED Requirements

### Requirement: confirmed swing extrema with one swing per tie

In Analysis Configuration v1, a swing candidate SHALL have three earlier and three later completed bars. A swing high SHALL have a high greater than or equal to each of the three earlier highs and strictly greater than each of the three later highs. A swing low SHALL have a low less than or equal to each of the three earlier lows and strictly less than each of the three later lows. The two comparisons SHALL be independent. Equal extremes SHALL therefore form one swing at the last bar of the tie.

#### Scenario: plateau

- **WHEN** two adjacent bars share the highest high in their window and the three later highs are lower
- **THEN** exactly one swing high is confirmed, occurring at the later of the two bars
- **AND** it is confirmed three input positions after that bar

#### Scenario: equal extremes separated by another bar

- **WHEN** two equal lows within three bars of each other are the lowest lows in their window
- **THEN** exactly one swing low is confirmed, occurring at the later low

#### Scenario: flat history

- **WHEN** every bar has the same high and low
- **THEN** no swings are confirmed and Structure remains `undefined`

#### Scenario: outside bar

- **WHEN** a completed bar has both the highest high and lowest low in its window, with no ties
- **THEN** both kinds of swing are confirmed together three input positions later

#### Scenario: a double top replaces a broken swing

- **WHEN** a downtrend is broken by a close above its defining swing high and price then forms a double top above that high
- **THEN** the double top becomes the latest swing high
- **AND** the broken swing high cannot define a re-established downtrend and be broken again
