# Design

## Public interface

Expose one pure function:

```ts
calculateRegime(bars: readonly DailyBar[]): readonly RegimeSession[]
```

`RegimeSession` contains the input session identity and its label:

```ts
{
  readonly sessionDate: DailyBar['sessionDate'];
  readonly regime: 'bullish' | 'bearish' | 'mixed' | 'undefined';
}
```

The result has one row per input bar, in input order. Empty input returns an empty array. Callers provide validated completed Daily Bars in chronological order; the function does not mutate them. Indicator coordination and transition state remain private to the module. The v1 function accepts no analytical parameters.

## Analysis Configuration v1

The module owns these fixed, versioned project-wide settings:

- fast EMA period: 50
- slow EMA period: 200
- ATR period: 14
- ATR band multiplier: 0.5
- transition confirmations: 3 readable sessions

These values are conventions for comparable v1 analysis, not user preferences or predictive truths. No caller-configurable overload or aggregate configuration API is introduced without a real consumer.

## Proposal predicates

For a session with all required measurements available, calculate:

- `bullish` when `close > EMA200 + 0.5 * ATR14` and `EMA50 > EMA200`.
- `bearish` when `close < EMA200 - 0.5 * ATR14` and `EMA50 < EMA200`.
- `mixed` for every other readable combination.

The comparisons are strict. Equality with either band edge or equality between EMA50 and EMA200 is not directional and therefore proposes `mixed`. An internal rounding guard treats differences no larger than `8 * Number.EPSILON * max(|value|, |threshold|)` as equality; this prevents a mathematically flat price series from being classified as directional without masking real differences at very small positive prices. It is a numerical guard, not a market threshold or caller option. A zero or near-zero ATR does not create a special fabricated case: the same directional predicates apply, and a zero ATR may only make the band coincide with EMA200.

## Warm-up and missing values

Until Close, EMA50, EMA200, and ATR14 are all available as finite numbers, the row is `undefined`. The first fully readable session adopts its proposal immediately; it does not require three confirmations because no prior settled label exists.

An unavailable session does not change the settled label, pending candidate, or pending count. It does not count as a confirmation and does not fabricate an indicator value. The row remains `undefined`, including for an isolated missing measurement after warm-up.

## Transition state

After the first readable session, a proposal equal to the settled label clears any pending candidate. A different readable proposal starts or increments a private candidate run. The candidate must be the same proposal for three consecutive readable sessions to replace the settled label. If a different proposal appears, the candidate is replaced and its count restarts at one. Missing sessions interrupt neither the candidate nor its count; they are skipped because they provide no proposal.

This rule applies to every label, including transitions from `bullish` or `bearish` to `mixed`, and from `mixed` to either direction. Thus three sustained `mixed` proposals replace an old directional label rather than preserving stale directional context.

The full history is calculated oldest-to-newest in one pass. No stateful incremental infrastructure is added in v1. Since every indicator and transition decision at index `i` depends only on input through `i`, replaying any prefix must equal the corresponding rows from the full-history calculation.

## Historical decisions: preserve, adapt, replace

- **Preserve:** EMA50, EMA200, ATR14, the `0.5 * ATR14` band, three confirmations, immediate adoption of the first readable proposal, causal full-history calculation, and transition suppression from the Swift implementation.
- **Adapt:** Swift `bull` and `bear` become the canonical public labels `bullish` and `bearish`; Swift nullable per-bar output becomes session-aligned rows with the explicit serialized `undefined` label; Swift bar input becomes validated `DailyBar` input; internal configuration defaults become fixed Analysis Configuration v1.
- **Adapt:** Suppress floating-point comparison noise at the stated rounding scale so a mathematically flat series stays `mixed`; the existing EMA arithmetic otherwise creates a spurious directional label despite equal input prices.
- **Replace:** the public naive/no-persistence regime calculation is omitted because there is no product caller; raw nullable arrays and caller-supplied tuning parameters are not exposed; missing values never become fabricated numeric values.

The intentional semantic choice resolving the historical wording contradiction is that three consecutive `mixed` proposals can replace a settled directional regime. `mixed` is a readable disagreement/neutral context, not absence of evidence; retaining a directional label after sustained disagreement would describe stale evidence.
