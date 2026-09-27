# Design

## Public interface

```ts
type VolatilityExpansionEvent = Readonly<{
	type: 'volatility-expansion';
	trueRange: number;
	baselineAtr: number;
	baselineThroughSessionDate: string;
	expansionMultiple: number;
}>;

type VolatilityExpansionSession = Readonly<{
	sessionDate: string;
	event: VolatilityExpansionEvent | null;
}>;

function detectVolatilityExpansionEvents(
	bars: readonly DailyBar[],
): readonly VolatilityExpansionSession[];
```

Keep the proposed names unchanged. The function expects validated, completed Daily Bars for one Trading Line in chronological order, consistent with existing technical-analysis APIs. It neither sorts nor fills missing calendar dates. The wrapper's date identifies the Event session; `baselineThroughSessionDate` is the previous input bar's date, not the previous calendar date or an older readable fallback.

## Calculation and timing

Reuse `calculateTrueRange(bars)` and `calculateAtr(bars, 14)`. For index `i`, compare `trueRanges[i] / atr[i - 1]` strictly with 1.8. Fixed module-owned constants define the ATR period and threshold. Do not export configuration or add parameters.

The canonical ATR seed is available at index 13, so the first eligible Event is at index 14 (the fifteenth input bar). Earlier rows are `null`. A missing, non-finite, zero, or negative prior ATR makes evaluation unavailable. Do not replace it with zero or search backward for another baseline. `null` means no Event was emitted, including unavailable evaluation; it does not assert quiet market conditions.

Guard non-finite current True Range or computed multiples as unavailable rather than emitting unusable evidence. This is a numerical guard, not a new input-validation framework. For finite readable measurements, use the strict computed ratio comparison without rounding or borrowing Regime's band-equality tolerance.

One completed qualifying session suffices. There is no confirmation counter, retained label, cooldown, or suppression of consecutive Events. Each Event remains a historical fact when later bars arrive. True Range includes overnight gaps even when the current intraday range is narrow. Other Event types neither cause nor suppress this Event.

## Minimal module

Use `src/modules/technical-analysis/volatility-expansion/` with `volatility-expansion.ts`, colocated types and tests, and an `index.ts`. Export only the detector and its two public types from this module and the existing technical-analysis barrel. Keep constants and evaluation helpers private. Reuse indicator formulas, with no changes to their public contracts or generic analysis framework.

## Historical Preserve / Adapt / Replace decisions

Reference: `observatory-research/Sources/ObservationCore/Triggers/ActivityDetectors.swift`, `ATRExpansionDetector`; its existing test in `Tests/ObservationCoreTests/DetectorTests.swift` checks only nonempty firings, type, and multiples above 1.8.

- **Preserve:** direction-neutral, one-session detection; strict threshold behavior; True Range so gaps count; and 1.8 as the initial global convention.
- **Adapt intentionally:** Swift divides current True Range by the mean of the latest 20 ATR14 values including the current session. Public v1 divides by ATR14 through the immediately previous input session. ATR14 already supplies a recent-volatility baseline; averaging 20 ATR values double-smooths it, while including the current session lets a large movement raise its own baseline. This changes both Event dates and earliest availability; historical Event parity is not the objective.
- **Adapt:** Swift exposes `multiple` and `window` constructor parameters. Public v1 owns ATR14 and 1.8 as fixed Analysis Configuration and has no second smoothing window.
- **Replace:** generic `TriggerID` / `Firing` output and index-based magnitude with a typed, session-aligned Event and explicit measurement/date evidence.

Current OpenSpec outranks tests/fixtures, which outrank Swift. The new tests must distinguish the chosen baseline from both current-session ATR and the historical 20-ATR mean.

## Verification and later work

Use deterministic histories for exact equality (for example TR 18 / baseline 10), above/below threshold, the first eligible session, unavailable and zero baselines, numerical guards, a wide intraday range, a narrow range after an opening gap, upward/downward movement with the same neutral evidence, consecutive Events, and non-adjacent session dates. Include a changing-volatility history long enough to distinguish the historical smoothed baseline after both approaches have warmed up. Compare every complete prefix with the corresponding full-history rows and freeze inputs to prove non-mutation.

Run the capability tests and project checks, obtain a fresh orchestrator review, resolve findings, archive, and make one focused commit. Descriptive frequency inspection across the exploration universe remains a follow-up before public-default confidence; do not tune against future returns or predictive performance in this capability.
