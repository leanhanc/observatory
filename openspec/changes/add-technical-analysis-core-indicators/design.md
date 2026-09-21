# Design

The public interface exposes one pure calculation per indicator: `calculateEma`,
`calculateTrueRange`, `calculateAtr`, and `calculateRsi`. Each indicator owns one folder
with an entry point, implementation, and focused test. A later analysis engine can compose
these calculations when its actual input and output needs are known; this slice does not
add a speculative aggregate result.

Every calculation returns a full series aligned with its input. This makes session
alignment explicit and prevents callers from accidentally replaying a single index with a
future value; each output at index `i` only reads input positions through `i`.

True Range is public because it is a named calculation in the behavioral contract and its
gap semantics warrant direct verification. The implementation uses `null` for unavailable
values, never zero. Empty inputs return empty arrays. Periods must be positive integers
and invalid inputs throw `TypeError`.

Historical decisions:

- Preserve EMA's first-observation seed and `period - 1` warm-up.
- Preserve first-bar True Range as `high - low`.
- Preserve Wilder ATR's simple-mean seed at `period - 1`.
- Preserve Wilder RSI's `period`-change seed at index `period`.
- Adapt flat-series RSI to `null` when average gain and average loss are both zero;
  preserving `100` would make no movement indistinguishable from unopposed gains.
- Adapt Swift `precondition` failures to typed JavaScript exceptions.
- Adapt the historical function names to explicit `calculate*` verbs while preserving one
  independently testable calculation per indicator.
