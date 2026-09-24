# Add descriptive technical-analysis Regime

## Why

Observatory needs a causal, session-aligned description of the broad price environment. Regime is the slower context in which more local Structure is interpreted; it is not a forecast, recommendation, signal, or opportunity claim.

## What Changes

Add a pure Regime capability to the technical-analysis module. It will classify each completed Daily Bar session as `bullish`, `bearish`, `mixed`, or the string label `undefined`, using EMA(50), EMA(200), ATR(14), and a volatility-scaled band. A persistence rule will suppress short-lived proposal changes without hiding a sustained loss of directional agreement.

The capability will reuse the existing EMA and ATR calculations, preserve causal prefix behavior, expose one result per input session, and keep transition bookkeeping private. It will not add Instrument State, Market Structure changes, Events, Situations, Observations, Opportunity evidence, persistence, user customization, scoring, or UI.
