# Design

## A change at its close's precision

A change and its close are read together, so they share one precision. Pesos already did: whole on a close of thousands, two decimals below. Dollars now follow the same rule: two decimals on a close of a dollar or more, and on a close under a dollar the decimals of the close's third significant digit, which is the precision a small price is written with.

| Line | Before                          | After                           |
| ---- | ------------------------------- | ------------------------------- |
| VALO | U$S 0,343 (U$S 0,00, −0,7 %)    | U$S 0,343 (−U$S 0,002, −0,7 %)  |
| COME | U$S 0,025 (U$S 0,00, −0,2 %)    | U$S 0,025 (−U$S 0,0001, −0,2 %) |
| GGAL | U$S 3,85 (+U$S 0,105, +2,8 %)   | U$S 3,85 (+U$S 0,10, +2,8 %)    |
| ALUA | U$S 0,552 (+U$S 0,0108, +2,0 %) | U$S 0,552 (+U$S 0,011, +2,0 %)  |
| IVV  | U$S 1,18 (U$S 0,00, +0,3 %)     | U$S 1,18 (U$S 0,00, +0,3 %)     |

Lean chose this over hiding a zero change: a change smaller than the close's last digit cannot be written at the close's precision, so it reads as zero, and the percentage says it moved. On the 2026-10-15 snapshot, 11 of 342 dollar changes read that way.

The close's precision is its third significant digit rather than the digits it prints: U$S 0,025 is 0,0250 with its trailing zero dropped, so COME's change has four decimals, like its CCL close of U$S 0,0237.

## The fallback without `:has()`

A browser drops a whole rule when it does not understand one of its selectors, so the rule that hides the USD and CCL variants uses plain attribute selectors only. Giving it its own rule is not enough: the build's CSS minifier merged it with the next rule, which had the same declaration and `:has()` selectors, back into one selector list. Every `:has()` rule therefore sits in an `@supports selector(:has(*))` block, which the minifier does not merge across and which a browser without `:has()` skips whole.

The block also holds the rule that hides the radio inputs behind their labels. Without `:has()` no label can be marked as checked, so the inputs stay visible and show the checked view. The stylesheet test reads this structure; it cannot render the page in a browser without `:has()`.
