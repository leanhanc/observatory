---
status: accepted
---

# Emit structured evidence before presentation wording

Observatory's analysis produces structured Features, Instrument State, Situations, Events, and Evidence. It does not produce human-readable sentences.

The presentation layer turns that evidence into wording for the daily panel, detail views, notifications, and future languages. It may also combine the evidence with user context, such as whether the Instrument is a Holding or a Watched Instrument, and may translate an Underlying Instrument level into an approximate CEDEAR level.

This boundary keeps domain judgments testable and reusable across surfaces. The same evidence can support a list row, a detailed explanation, or a notification without requiring the analysis to know the surface, language, or user's holdings. It also prevents presentation from inventing facts: wording may only mention facts carried by the Evidence.

The analysis must still recognize domain situations and provide the facts that make them understandable. For example, it may emit a bullish regime, an uptrend under structural pressure, a cancel level referenced to the last higher low, and the situation `bullish-structure-below-average`. “Bullish” and “bearish” are conventional descriptive labels here, not recommendations or predictions. Presentation may render those facts as a plain-language explanation, but the analysis never emits that sentence.

The analysis produces an Instrument State for every eligible Instrument and session when evaluation is possible, including an explicit incomplete or unknown result during warm-up or when data is insufficient. An Observation is optional and is produced only when a meaningful Event or Situation deserves attention. A valid State with no recent Observation may be presented as Quiet; Quiet never means that analysis failed.

## Canonical analysis is complete and versioned

The canonical analysis output must contain all relevant candidate facts and evaluation outcomes for an eligible Instrument and session, not only the few Observations selected for a default panel. It includes negative Evidence Status values such as `contradicted`, `no_evidence`, and `untestable`, so a later surface cannot mistake an unproven result for a supported one.

Canonical outputs are persisted independently of user context. A panel request reads the latest completed output and applies user-context projection; it does not trigger a custom market-data fetch or a full reanalysis. This keeps the user experience immediate without making the canonical result depend on who is viewing it.

Measurement conventions and interpretation thresholds are global Analysis Configuration, not user preferences. Analytical parameters such as EMA periods, RSI periods, swing rules, warm-up requirements, and event thresholds are selected for Observatory's research and product model, recorded in a version, and carried by the resulting output as `configVersion`. Changing them creates a different analysis that must be evaluated as a new research configuration; it is not a panel customization.

## User customization is attention, not weighting

User customization may order, filter, or deliver canonical Observations. It must not combine Features or Evidence into a numeric score, expose numeric weights, or alter the meaning of the canonical analysis. The first version should treat “weights” as an internal implementation smell and use discrete Attention Preferences instead.

The same user-context stage may translate a relevant level from an Underlying Instrument into an approximate level for the user's selected CEDEAR Trading Line. That translation does not change the underlying analysis or its Evidence; it changes how the result is made relevant to the user's context.
