---
status: accepted
---

# Follow the provider's adjusted prices

Open BYMADATA appears to back-adjust daily history for cash distributions and serves only about the last two years. Stored Bar History will follow that adjusted series instead of keeping raw prices as first observed. When a refetch shows an adjustment, the same ratio is applied to stored bars the provider no longer serves, so a history never mixes price scales.

Adjusted prices keep distributions from appearing as price gaps that would distort ATR, swings, and regime. The cost is that older levels, such as a past swing high, are not prices that actually traded, and rescaling bars outside the provider's window cannot be undone.

Because a wrong rescale is permanent, only a clean staircase of ratios below 1, each covering at least two bars and every price, counts as an adjustment; anything ambiguous is treated as corrections. That rule assumes the provider applies one multiplicative ratio per adjustment, which is still unconfirmed and is being checked with daily snapshots before adjustments are applied during reconciliation.
