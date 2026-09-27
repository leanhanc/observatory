# Add Volatility Expansion Event

## Why

Observatory needs a dated, direction-neutral Event describing unusually large completed-session movement. Existing True Range and ATR14 calculations supply the measurements, but no public capability records this behavior with causal evidence.

## What Changes

Add a pure, session-aligned `detectVolatilityExpansionEvents(bars)` calculation. Emit `volatility-expansion` when the current completed session's True Range divided by the previous completed session's ATR14 is strictly greater than 1.8. Both settings belong to Analysis Configuration v1, not callers or users.

Each Event carries True Range, prior ATR, the session through which that baseline was known, and the expansion multiple. The wrapper owns the Event session date. Unavailable or non-positive baselines produce `null`; consecutive qualifying sessions each produce an Event.

Intentionally replace the historical mean of 20 ATR14 values including the current session with the immediately prior ATR14. ATR14 already smooths recent volatility, and the current movement must not raise its own comparison baseline.

## Scope

Add only the capability module, intended public exports, adversarial tests, and a narrow glossary entry after approval. No direction, prediction, opportunity, price target, wording, scores, persistence, notifications, generic detector framework, Instrument State, Situation, or UI is included. A future Gap Event may coexist independently.

Before confidence in the public default, inspect 1.8 Event frequency descriptively across the exploration universe. That separate work selects an attention convention, not predictive performance; it is not part of this implementation.
