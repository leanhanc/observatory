---
status: accepted
---

# Situations are threshold-free conjunctions on the current State

A Situation names a combination of facts the Instrument State already carries, such as "Regime is bearish and the close is below the last confirmed swing low." Observatory defines each Situation as a conjunction of State parts at one session, using only the thresholds those parts already embody: Regime's band and confirmations, swing confirmation, and the strict-close rule of Structure. A Situation adds no threshold of its own. Facts that make it more or less striking, such as RSI, the distance from the level or the distance from the 200-session average, are shown alongside it from the same State and are never conditions.

The alternative was to require a margin, for example a close more than half an ATR below the low, so that a close barely beyond a level would not carry a dramatic label. A real run made the trade-off concrete: a line 0.84% below its last confirmed low qualified alongside lines several percent below theirs. A margin would filter that case, but every threshold a Situation adds is a parameter that can be adjusted until the Situation "fires right" on the lines a reader expects. That is tuning a description to look predictive before any evidence exists. Without a margin, the definition stays explainable from the glossary alone, and the size of the move is carried by the distance shown next to it. Names describe position rather than drama, and reader-facing labels come from the wording table.

A Situation is evaluated per session and is active only while its conjunction holds. Its start session is replayed causally from the line's States, and an interruption restarts it; no Situation latches. Because each conjunction reads the latest confirmed swing, a newer confirmed swing ends a Situation built on an older one.

The snapshot also flags whether each active Situation's close is past its level by more than half an ATR(14), Regime's noise band; that flag only selects reader-facing wording and is never a condition of the Situation.

A noise margin may be revisited once the Evidence layer can test whether one changes what a Situation describes. Adding it would be a new Analysis Configuration version and a new definition, not a fix.
