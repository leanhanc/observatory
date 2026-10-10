# Add volume-only corporate-action corrections

## Why

[docs/research/open-bymadata-relevant-facts.md](../../../docs/research/open-bymadata-relevant-facts.md), section "Volume adjustment around corporate actions", checked seven catalog CEDEAR events that are not on the Corporate Action list: NFLX, XLK, XLE, XLU and NOW, whose CEDEARs followed an underlying split, and SPY and HUT, whose CEDEAR ratio changed. In all seven, Open BYMADATA adjusted the price and left the volume alone. No close ratio across an ex-date is near `1/F`, so the served earlier prices are already on the new scale; but the earlier volumes are still counts of the old, larger CEDEARs. Volume is an integer CEDEAR count, and a count rescaled to the new unit would be a multiple of `F` on every earlier bar. The share of multiples is what chance gives, about `1/F`, before and after every ex-date.

**What that does to the liquidity gate.** Volume is used only by the liquidity gate. After the ex-date, each earlier bar's traded value is `old count × adjusted price`, the true value divided by `F`. The gate's median reads low until the ex-date leaves the 125-market-session window, about six months later. For a split or a ratio increase the error can only exclude a liquid line: in this history it would have excluded NFLX on 44 evaluated sessions, XLK on 54, XLU on 11 and NOW on 3. Inside the current window only SPY (F = 3) and HUT (F = 25) are affected: their medians read ×1.09 and ×1.47 low, and both stay eligible either way.

The Corporate Action list cannot express this today. An entry corrects prices and volume together, and its guard applies it only when the close ratio still shows the price step. For these events the ratio is near 1, so an entry would be `step-not-observed` and correct nothing.

## What Changes

### A volume-only correction in the list

Each list entry now says what it corrects, in a required `correction` field:

- `prices-and-volume`: the existing kind, for an action the provider adjusted in neither price nor volume. Unchanged: it carries `priceFactor`, and bars before the ex-date have their prices multiplied by it and their volume divided by it.
- `volume`: new, for an action whose price the provider adjusted but whose volume it did not. It carries `shareFactor`, `F`: CEDEARs or shares held after the event per one held before. Bars before the ex-date have their volume multiplied by `F`. Their prices are left as served.

`shareFactor` is a separate field rather than `1/priceFactor`, because the notices state `F`, and `1/3` cannot be written exactly in the data file: a volume multiplied by 3.0000003 is no longer a count. A volume-only entry has the same rules as the existing kind: an `https` primary source, at most one entry per line and ex-date, and a factor at least 1.25² away from 1 so that its guard, below, can tell a step from an ordinary day. Its direction follows the kind: above 1 for a split or a share distribution, below 1 for a reverse split.

A new kind, `ratio-change`, names a change of a CEDEAR's ratio with no underlying event. SPY and HUT are ratio changes. Their notices call the mechanism a split, "acreditando 2 nuevos cedears por cada uno existente", but no underlying share was split, and ADR 0009 confused the two. A ratio can move either way, so a `ratio-change` factor has no required direction. The kind is descriptive only: what a correction does depends on `correction`, never on `kind`.

The list's file becomes `corporate-actions.v2.json` with `schemaVersion: 2`, because every entry now needs `correction`. The two existing entries become `prices-and-volume` and are otherwise unchanged.

### The inverted guard

A `prices-and-volume` entry is applied only while the fetched close ratio still shows its price step. A `volume` entry needs the opposite: the provider must have adjusted the price. It is applied only when the close ratio across the ex-date, `r = close(first bar on or after exDate) / close(last bar before exDate)`, is within ×/÷1.25 of 1. Because the factor is at least 1.25² from 1, the band around 1 and the band around the unadjusted step `1/F` meet at most at one boundary point, so one entry cannot look right as both kinds; at that point the guard applies, as both guards include their bounds.

Otherwise the entry is skipped as `price-step-observed`, with `observedCloseRatio`. The usual reading is that the provider did not adjust the price, so the entry should be `prices-and-volume`; a real move of ×1.25 or more on the ex-date gives the same status. As with `step-not-observed`, the status does not claim which, and the command's warning shows the ratio and asks for the history to be checked. Nothing is corrected on a guess. If the price was in fact unadjusted, volume and price are on the same unit and traded value is already right, so multiplying the volume would overstate it.

### The divisibility check

The inverted guard cannot see whether the provider has since rescaled the volume too. If it has, applying the entry would rescale it twice and overstate traded value by `F`, which can admit a thin line: the opposite of the error being fixed, and the worse one, since the gate exists to keep thin lines out. A count the provider rescaled by an integer `F` is a multiple of `F` on every earlier bar, so before applying, the module looks at the last 20 traded bars before the ex-date (volume above zero; a zero is a multiple of anything and says nothing). When `F` is an integer of at least 2, there are 20 such bars and every one is a multiple of `F`, the entry is skipped as `volume-rescale-suspected`.

**Skip rather than apply with a warning.** Skipping leaves the uncorrected history, whose error only excludes liquid lines for a while. Applying a double correction can admit a thin line, and nothing downstream would catch it. The check is reasoned rather than observed: no event in the cache shows a provider volume rescale, so the signature has never been confirmed.

**It is weak for small factors.** Under chance, 20 multiples in a row has probability `(1/F)^20`, about 1 in a million for `F = 2`, so false alarms from chance alone are negligible. Volumes are not uniform, though: a line traded in round lots, such as multiples of 10 or 100, has only even volumes, and the check then flags a correct entry. That costs the correction, not the history, and the warning shows a person why. The check is not evaluated, and the entry is applied, when `F` is not an integer, when `F` is below 2, or when fewer than 20 traded bars precede the ex-date: a rescale to a non-integer factor has no divisibility signature, and fewer bars would let chance flag too often. The 20 bars go into `ANALYSIS_CONFIGURATION.corporateActions.volumeRescaleCheckBars`.

The order is: `outside-window`, then `price-step-observed`, then `volume-rescale-suspected`, then `applied`.

### Entries

- **SPY** (`spy-cedear-byma-ars`): `volume`, `ratio-change`, share factor 3, ex-date 2026-05-29, source [Caja de Valores notice 493877](https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/493877). The ratio goes from 20:1 to 60:1 CEDEARs per share, so each CEDEAR is a third of what it was.
- **HUT** (`hut-cedear-byma-ars`): `volume`, `ratio-change`, share factor 25, ex-date 2026-05-29, source [Caja de Valores notice 493878](https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/493878). The ratio goes from 1:5 to 5:1: one CEDEAR represented five shares and now represents 0.2, `5 / 0.2 = 25`, which matches "24 nuevos CEDEARs por cada uno existente".

**The ex-date is inferred.** Both notices, dated 2026-05-26, give a record date of 2026-05-29 and a change date of 2026-06-01 but no ex-date. The entries use 2026-05-29, the record date:

- BYMA settles CEDEARs at T+1, so a trade on the record date settles after it and carries no entitlement; the ex-date is the record date. ETHA's notice states both as the same day.
- Both lines' volume steps begin on 2026-05-29 in the served history.
- The research checked 2026-06-01 too: one session crosses the boundary, and none of its conclusions change.

**The five older events are listed too**, all `volume`, kind `split`, with the ex-date the notice states: NFLX ×10 on 2025-11-17 ([480285](https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/480285)), XLK ×2 on 2025-12-05 ([482245](https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/482245)), XLE ×2 and XLU ×2 on 2025-12-05 ([483021](https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/483021), [483022](https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/483022)), and NOW ×5 on 2025-12-18 ([483240](https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/483240)). They are outside the current 125-session window, so they change no result today. They cost five lines of data, the research verified each factor and each "price adjusted, volume not" reading, and listing them keeps the served history correct for any longer window. They also run the inverted guard and the divisibility check against seven real events on every run, not two.

### Analysis Run

The run already applies the list before liquidity eligibility, dollarization, State and Events, so a volume-only correction reaches the gate with no change in ordering. The per-line record changes:

- Each record carries the entry's own fields, so `correction` and either `priceFactor` or `shareFactor`, and the new statuses `price-step-observed` and `volume-rescale-suspected`.
- `insufficient-liquidity` lines now record `corporateActions` too. A volume-only entry exists to change the liquidity gate, so a skipped one matters most on a line the gate excludes, where it was not reported.

The snapshot moves to `schemaVersion: 5` under the `analysis-snapshots/v5` prefix, and `ANALYSIS_CONFIGURATION.version` moves to 4, because liquidity results change.

The `analyze` command warns on `price-step-observed`, with the observed ratio, and on `volume-rescale-suspected`, saying the provider may have rescaled the volume. It reports an insufficient-liquidity line's Corporate Actions the same way as an available line's.

### Corporate-action watch

A notice is listed when the list has an entry for its line with an ex-date near the notice, whatever the entry's `correction`. The watch reads only `tradingLineId` and `exDate`, so this needs no code change; a scenario pins it.

### ADR 0010 and corrections elsewhere

[ADR 0010](../../../docs/adr/0010-correct-volume-the-provider-left-unadjusted.md) records the decision to correct volume the provider left unadjusted, and why the distinction is what the provider adjusted, not split versus ratio change. A new ADR rather than amending 0009, because 0009's decision, to correct confirmed unadjusted actions from a sourced list, still holds. 0010 adds a second exception with its own guard and its own failure mode, a double rescale. ADR 0009 keeps its decision and gets its NOW sentence corrected with a pointer to 0010: NOW's event was an underlying 5:1 split that the CEDEAR followed with its ratio unchanged, not a ratio change.

The bar-history adjustment detector's comment that splits "can rescale" volume becomes a statement of what it does: it ignores volume, which the provider has not been seen rescaling. Decision 4 of `handle-provider-adjusted-history` gets the same NOW correction and the answer to its open question about CEDEAR volume.

## Out of scope

- Detecting volume steps automatically (fix option (b) in the research): the observed step does not estimate the factor, and it is known only 20 sessions after the ex-date.
- Local stocks, which the research did not check.
- Recording `corporateActions` on `no-dollarized-bars` lines.
