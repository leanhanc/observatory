# Design

## Public interface

Expose one pure `detectRegimeTransitionEvents(bars)` function from the technical-analysis module:

```ts
type RegimeTransitionEvent =
	| Readonly<{
			type: 'regime-transition';
			from: 'bullish';
			to: 'bearish';
			confirmingSessionDates: readonly [string, string, string];
	  }>
	| Readonly<{
			type: 'regime-transition';
			from: 'bullish';
			to: 'mixed';
			confirmingSessionDates: readonly [string, string, string];
	  }>
	| Readonly<{
			type: 'regime-transition';
			from: 'bearish';
			to: 'bullish';
			confirmingSessionDates: readonly [string, string, string];
	  }>
	| Readonly<{
			type: 'regime-transition';
			from: 'bearish';
			to: 'mixed';
			confirmingSessionDates: readonly [string, string, string];
	  }>
	| Readonly<{
			type: 'regime-transition';
			from: 'mixed';
			to: 'bullish';
			confirmingSessionDates: readonly [string, string, string];
	  }>
	| Readonly<{
			type: 'regime-transition';
			from: 'mixed';
			to: 'bearish';
			confirmingSessionDates: readonly [string, string, string];
	  }>;

type RegimeTransitionSession = Readonly<{
	sessionDate: string;
	event: RegimeTransitionEvent | null;
}>;

function detectRegimeTransitionEvents(
	bars: readonly DailyBar[],
): readonly RegimeTransitionSession[];
```

The function returns one row per completed `DailyBar` in input order. The owning row's
`sessionDate` is the effective transition session, so the nested Event does not duplicate it. The
Event type makes an equal or `undefined` `from`/`to` pair unrepresentable.

## One Regime transition engine

`calculateRegime` and `detectRegimeTransitionEvents` consume one internal batch analysis that owns
proposal calculation, settled State, pending candidate, and confirming session dates. Public Regime
State remains limited to the session label; pending bookkeeping is not exported through either public
API.

The first readable proposal initializes settled Regime and emits no Event. Later readable proposals
advance the existing three-confirmation rule. A proposal equal to settled Regime clears the pending
candidate. A different proposal replaces the candidate and restarts confirmation. An unreadable
session emits an `undefined` Regime row while leaving the internal settled and pending State unchanged.

When the third matching readable proposal changes settled Regime, that same session receives one
Event. Later sessions that retain the new settled Regime do not repeat it.

## Minimal transition evidence

`confirmingSessionDates` contains exactly the three readable sessions whose matching proposals
established the transition. Unreadable sessions neither appear in the list nor break the pending
candidate, so the dates need not be adjacent Trading Sessions.

Close, EMA50, EMA200, and ATR14 explain why a session proposed a Regime label. They remain
Regime/Feature evidence and are not duplicated in the Event. A future daily-analysis assembler may
place this Event beside Regime and Feature evidence in one persisted analysis artifact. Presentation
must not query Bar History or recalculate indicators to render the Event.

## Event independence

Regime Transition and Structure Break are independent Events. Either may occur alone, both may occur
on one completed session, and neither causes or suppresses the other. Cross-Event composition belongs
to a later capability; this detector calculates only Regime Transition Events.

## Historical decisions

- Preserve the historical pending-confirmation mechanics for every readable Regime label, including
  transitions into and out of `mixed`.
- Preserve that initial readable availability is not a transition and unreadable sessions neither
  advance nor cancel a pending transition.
- Adapt historical transition counting into a typed, session-aligned Event with causal evidence.
- Adapt array positions into the three actual confirming Trading Session dates.
- Replace any possibility of equal or unavailable endpoints with a public type containing only valid
  directed readable pairs.
- Replace separate State and Event transition logic with one internal engine shared by both public
  calculations.
- Exclude source measurements from Event v1 because they belong to Regime/Feature evidence rather
  than the transition-specific claim.

No ADR is needed: the design extends the established session-aligned Event convention and keeps the
existing Regime contract authoritative.
