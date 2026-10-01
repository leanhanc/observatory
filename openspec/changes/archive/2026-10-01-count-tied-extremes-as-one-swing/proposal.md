# Count tied extremes as one swing

## Why

Swing detection required a strictly unique high or low in its seven-bar window, so a run of equal highs or lows produced no swing at all. In technical analysis, equal highs or lows are a meaningful level, such as a double top or bottom. Dropping them hid real peaks and let Structure use an older swing that price had already broken: a downtrend broken above its defining high could be re-established on that same high and broken a second time, because the peak between the two breaks was a double top.

## What Changes

A swing high SHALL have a high greater than or equal to the three earlier highs and strictly greater than the three later highs. Lows mirror this. Equal extremes therefore form exactly one swing, at the last bar of the tie. A flat history still produces no swings, because no bar has three strictly lower later bars. Confirmation still happens three bars after the swing bar, so no later data is used.

This also differs intentionally from the historical Swift implementation, which accepted ties on both sides and created one swing per tied bar.

## Scope

Only swing detection in the market-structure module changes. Structure classification, expiry, and Structure Break rules are unchanged; their results change only where ties occur.
