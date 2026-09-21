---
status: accepted
---

# Pre-render shared analysis and keep personalization dynamic

Observatory should pre-render or aggressively cache as much of the public experience as the data allows. The canonical market analysis is produced server-side, persisted, and shared across visitors; a page request must not trigger a user-specific market-data fetch or full analysis run.

Rendering is selected by the nature of the data rather than by one universal rule:

- Canonical daily analysis and public instrument details are candidates for pre-rendered or cached output.
- User-specific projections, such as Holdings, Watched Instruments, Attention Preferences, and notification settings, may be resolved server-side or client-side.
- Interaction state, such as sorting, expanding explanations, and changing the visible view, belongs on the client when it does not require new market facts.
- Fresh or intraday data may use a dynamic server/client path when that capability exists.

The lifecycle for a completed market session is:

```text
fetch and reconcile
        ↓
run canonical analysis
        ↓
persist the analysis snapshot
        ↓
invalidate or regenerate affected public output
```

The rendering mechanism—build-time generation, cached SSR, incremental regeneration, or a combination—remains an application implementation choice. It must preserve the boundary: the canonical analysis is independent of the viewer, while user context changes how an already-computed result is selected, translated, and presented.
