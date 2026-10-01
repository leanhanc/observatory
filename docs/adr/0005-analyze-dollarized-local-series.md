---
status: accepted
---

# Analyze a dollarized series built from BYMA data

Observatory will analyze Argentine stocks and CEDEARs on a dollarized series: each session's peso-line bar divided by that same session's implied MEP rate, derived from a BYMA bond quoted in both pesos and dollars (for example AL30 and AL30D). This refines [ADR 0004](./0004-analyze-local-stocks-and-cedears.md): analysis remains local and uses no US market data, but it no longer describes the instrument in its quoted currency.

A peso price combines two movements: the instrument's own and the peso's. For a CEDEAR, the peso price is roughly the underlying's dollar price divided by the conversion ratio and multiplied by the implied exchange rate. Analyzing that price directly lets currency behavior pose as market structure: steady devaluation produces higher highs and higher lows on a flat asset, exchange-rate jumps appear as price gaps, and exchange-rate volatility inflates volatility and regime readings. Dividing by a same-session implied rate removes most of that movement, so the analysis describes the asset. For CEDEARs, the dollarized series closely follows the underlying, providing most of what [ADR 0001](./0001-analyze-underlyings-and-translate-levels.md) wanted without its data dependency.

The peso line is used instead of the dollar (D) or cable (C) lines because it carries most of the trading. In a two-year sample (October 2024 to September 2026), GGALD traded about 2% of GGAL's median daily volume and AAPLD about 14% of AAPL's. Both dollar lines still traded every session, so their closes are usable but reflect much less activity. The cable line AAPLC had no trades in 141 of 485 sessions. Dollarizing the peso line closely matched the dollar line in that sample: the median difference between GGAL ÷ MEP and the GGALD close was 0.35% (90th percentile 0.83%), and for AAPL against AAPLD it was 0.27% (0.80%). Volume is taken from the peso line as a share count and is not converted.

The implied rate uses MEP rather than CCL because the AL30/AL30D pair is the most liquid local source and MEP is the rate local investors usually reason in. In the same sample, AL30, AL30D, and AL30C each lacked a real bar in only one of 486 sessions. CEDEAR arbitrage formally runs against CCL, so the difference between MEP and CCL, which widened from about 2% to about 5% over that sample, is a known source of noise and slow drift in the series.

Conversion rules:

- The rate must come from the same session as the bar. A later rate is look-ahead.
- The peso bar and the bond pair must use the same settlement term.
- Open, high, low, and close are all divided by the session's closing rate. This keeps the bar's shape but ignores exchange-rate movement within the session, so it is an approximation.
- When the implied rate is missing for a session, the dollarized bar for that session is missing. No earlier or later rate is carried in to fill it.
- Prices can be displayed in pesos, MEP dollars, or CCL dollars by applying the rate in reverse. The display currency never changes the analysis.

We accept the noise this adds: bond-specific spreads and liquidity in the implied rate, the CEDEAR premium or discount against its underlying, the MEP–CCL gap, and exchange-rate movement within the session. Adjusting for corporate actions and CEDEAR ratio changes is a separate decision and is required before analysis consumes real history.
