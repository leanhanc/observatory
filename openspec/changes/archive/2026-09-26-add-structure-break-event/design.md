# Design

## Public interface

Expose one pure `detectStructureBreakEvents(bars)` function from the technical-analysis module:

```ts
type StructureBreakEvent =
	| Readonly<{
			type: 'structure-break';
			direction: 'downward';
			priorStructure: 'uptrend';
			definingSwing: ConfirmedSwing & { kind: 'low' };
			closePrice: number;
	  }>
	| Readonly<{
			type: 'structure-break';
			direction: 'upward';
			priorStructure: 'downtrend';
			definingSwing: ConfirmedSwing & { kind: 'high' };
			closePrice: number;
	  }>;

type StructureBreakSession = Readonly<{
	sessionDate: string;
	event: StructureBreakEvent | null;
}>;

function detectStructureBreakEvents(bars: readonly DailyBar[]): readonly StructureBreakSession[];
```

The function returns one row per input completed `DailyBar` in the same order. The owning row's `sessionDate` is the break session, so the nested Event does not duplicate that date. `closePrice` is the completed closing price that crossed the level.

The Event is a discriminated union so its direction, prior Structure, and defining swing kind cannot represent an impossible combination.

Callers pass only Daily Bars. The module coordinates the existing `calculateMarketStructure` calculation internally so callers cannot pair one history with mismatched Structure results. Swing detection, confirmation timing, Structure classification, and sticky expiry remain owned by Market Structure.

## Detection timing

An Event at session `t` evaluates only the directional Structure and defining swing that were already knowable at completed session `t - 1`. An uptrend is defined for this purpose by its latest confirmed swing low and breaks downward when session `t` closes strictly below that level. A downtrend is defined by its latest confirmed swing high and breaks upward when session `t` closes strictly above that level.

A swing newly confirmed at session `t` cannot establish a Structure and be broken retroactively by the same close. When session `t` both breaks the previously established Structure and confirms a different swing, the Event still records the break of the prior State. The newly confirmed swing may independently affect current-session Structure under the existing Market Structure contract; it does not erase what happened to the prior State.

The detector reconstructs the latest visible high and low only from `newlyConfirmedSwings` emitted by Market Structure. It processes the current close against the prior visible state before making swings newly confirmed on the current session available for later Event detection.

## Crossing semantics

Only the completed close counts. Equality preserves the prior Structure, and an intraday wick beyond the defining level does not produce an Event when the close remains on the sustaining side. A gap qualifies when its completed close strictly crosses the level.

Each crossing is recorded once. After a break, Market Structure's sticky expiry makes the following prior-session Structure undefined, so later sessions that merely remain beyond the same level cannot emit again. A newly confirmed swing may permit later Structure reclassification, but that newly established Structure can only break on a subsequent completed session.

Event existence is independent of ATR availability and penetration magnitude. The raw distance beyond the level is not required to identify or understand the occurrence and is excluded from the minimal Event.

## Historical decisions

- Preserve confirmed-swing visibility, strict completed-close crossing, crossing-once behavior, and gap qualification from the historical Swift detector.
- Adapt direction from a caller-selected input to a fact inferred from the previously established directional Structure.
- Adapt the crossed level from the latest requested swing kind to the confirmed swing that defines that prior Structure.
- Adapt historical array-index identity to session-aligned output and occurrence/confirmation session dates.
- Replace historical snake-case Trigger IDs and generic `Firing` with `type: 'structure-break'`, an explicit direction, and specific structured Evidence.
- Replace mandatory ATR-scaled magnitude with binary Event existence; ATR-scaled penetration may be separate optional Evidence in a later capability.
- Replace independent per-index detector setup with one deep batch module that coordinates the existing Market Structure calculation internally.

No generalized detector registry, framework dependency, persistence, I/O, sentence generation, score, or age cutoff is introduced.
