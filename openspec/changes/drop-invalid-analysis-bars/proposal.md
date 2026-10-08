# Drop invalid bars from analyzed lines

## Why

One invalid Daily Bar makes a whole analyzed line unavailable. In the dry run through 2026-10-06, that removed five lines from the snapshot:

| Line  | Session(s)                             | Defect                                  |
| ----- | -------------------------------------- | --------------------------------------- |
| TGNO4 | 2025-01-17                             | close 1.18% below the bar's low         |
| HUT   | 2025-01-17                             | close 1.15% below the low               |
| SATL  | 2025-01-17                             | close 1.04% below the low               |
| XLP   | 2025-04-21                             | close 3.0% above the high               |
| ARM   | ten sessions, 2024-10-07 to 2024-10-24 | open, high, low, close and volume all 0 |

The adapter already widens a range when the close or open sits within 1% of it, which is how GGAL's 2025-01-17 bar (0.26% below its low) passes. These defects are larger. 2025-01-17 is the session the `handle-provider-adjusted-history` proposal links to a rounding artifact of the provider's adjustments. ARM's rows are placeholders from before the line traded. The [large one-session moves](../../../docs/research/large-one-session-moves.md) note found them, and validation rejects them as non-positive prices.

Each of these is one wrong bar, or a run of placeholders, in about 490 sessions. The rest of the line is a valid record of its market. Losing the whole line for it hides a liquid instrument from the snapshot for months.

## What Changes

For an analyzed line, each bar is validated on its own. A bar that is not a valid Daily Bar is **dropped**: it is not a market fact Observatory can read, and repairing it would invent prices. The other bars are kept and analyzed. Every dropped session is recorded in the line's snapshot entry as `droppedBarSessions`, and the `analyze` command logs that line as a warning, so the data problem stays visible.

Dropping a bar removes the session from the line, exactly as if the line had not traded that day:

- The Dollarized Series has no bar there, and indicators step from the previous bar to the next one. True Range on the next bar includes the gap from the previous kept close, so a real move across the dropped session still counts.
- Liquidity eligibility counts the session as not traded. A dropped bar inside the 125-session window lowers participation by 1/125.
- The large-move flag compares the next bar with the previous kept bar.

The line is still unavailable with reason `invalid-bars` when the remaining bars are not a valid history: duplicate or out-of-order sessions, which no per-bar drop can fix. If every bar is invalid, the line is also `invalid-bars`, not `no-provider-bars`, because the provider did answer.

The MEP rate source lines keep their stricter rule: any invalid bar other than an accepted zero open fails the run. A wrong rate would mis-dollarize every line on that session, so it is not silently dropped.

This replaces the scenario "analyzed lines get no zero-open exception". A zero-open bar on an analyzed line is still not accepted, but it is now dropped and recorded rather than failing the line.

### Versions

The snapshot gains `droppedBarSessions` on available entries. This change ships together with `add-large-move-safeguard`, which already moves the snapshot to `schemaVersion: 3`, so v3 includes the field and no further bump is needed. If the two are split, this one needs its own schema version. The Analysis Configuration is unchanged: dropping a bar is data handling, not a measurement convention.

## Trade-offs

- **A dropped bar is a missing session.** If the bar hid a real move, that move moves to the next kept bar and still reaches True Range, but the dropped session's own range is lost.
- **No limit on how many bars may be dropped.** A line that loses many bars stays available. `droppedBarSessions` lists them all, and the log warns. A threshold can be added when a case needs one.
- **Widening was rejected.** Stretching the range to contain a close 3% outside it keeps the session but makes the range partly invented, and the existing 1% repair already covers rounding.

## Out of scope

- Repairing the provider's adjustment artifact, or refetching to see if it changes.
- Dropping invalid bars of the MEP rate source.
- Stored Bar History validation, which the run does not use.
