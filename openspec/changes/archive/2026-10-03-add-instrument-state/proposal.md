# Add Instrument State

## Why

Observatory can calculate Regime, Structure, RSI, EMA and ATR, but nothing yet gathers them into one description of an Instrument for a Trading Session. The Instrument State is that description: what is true at the close of a session, with each part either measured or explicitly unavailable. It is the base that later Situations and Observations read from, and it is useful on its own.

## What Changes

Add a pure `instrument-state` module exposing `calculateInstrumentStates(bars)`. Given the Daily Bars of one Trading Line, normally the bars of a Dollarized Series, it returns one Instrument State per bar with:

- `regime`: the settled Regime label, or `null` while Regime is unavailable.
- `structure`: the Structure classification, or `null` before two confirmed swings of each kind exist. After that, `undefined` is a reading: the last trend expired.
- `rsi`: RSI(14), or `null` while unavailable.
- `priceRelativeToEmaInAtr`: `(close − EMA20) / ATR14`, or `null` while unavailable.

Market Structure gains a `hasSwingPairs` flag so it, not the State, says when Structure is unavailable. Existing callers are unaffected.

Periods come from the project-wide v1 Analysis Configuration, which moves into one versioned constant in `src/lib/config.ts`, grouped by concept: Regime, Volatility Expansion, Market Structure and Instrument State. Each group owns its ATR period because those are separate conventions that may diverge. Values and behavior are unchanged. The module reuses the technical-analysis calculations and adds no indicator math.

## Scope

- The State describes; it holds no overbought/oversold labels, scores or recommendations. RSI is a raw value.
- Events (Structure Break, Regime Transition, Volatility Expansion) are separate outputs and are not part of the State.
- Volume comparison is not part of v1. It has no field; it is not reported as unavailable, because unavailable means not enough data.
- Structure Evidence (the defining swing level and the price's distance from it) is not included: Market Structure does not expose the defining swing per session today.
- No storage, scheduling or presentation.

## Follow-ups

- Persisted States must record the Analysis Configuration `version` they were computed with, because field names such as `rsi` and `priceRelativeToEmaInAtr` carry no periods.
- Structure Evidence: expose the defining swing level and the price's distance from it per session.
