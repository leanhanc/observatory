# Add confirmed market structure

## Why

Later analysis needs a causal description of price Structure. A swing occurs before it can be confirmed, so historical sessions must never use it early.

## What Changes

Add pure, session-aligned confirmed swings and Structure classification to the existing technical-analysis module. Each swing records its occurrence and confirmation sessions. The v1 three-bar window requires strict extrema; an invalidated trend remains undefined until new confirmed swing evidence arrives.

Regime, structural pressure or hold, structure-break Events, Situations, Observations, scoring, persistence, and UI remain outside this capability.
