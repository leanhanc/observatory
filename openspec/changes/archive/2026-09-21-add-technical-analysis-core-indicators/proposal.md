# Add core technical-analysis indicators

Add a pure, framework-independent calculation module for EMA, True Range, Wilder ATR,
and Wilder RSI over the existing `DailyBar` and numeric close values. The result is a
full-series, session-aligned projection whose unavailable warm-up positions are `null`.

This slice preserves the historical Swift conventions where the current contracts and
numeric fixture support them. It intentionally adapts flat-series RSI to report no value
when both smoothed averages are zero, because `100` would describe no movement as maximum
upward momentum. It also adapts invalid-period handling to TypeScript by throwing
`TypeError` rather than terminating the process with a Swift precondition. Rolling z-score
and percentile helpers are intentionally out of scope.
