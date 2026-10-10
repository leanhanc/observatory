---
status: accepted
---

# Correct volume the provider left unadjusted

What matters about a Corporate Action is what the provider adjusted, not whether it was a split or a CEDEAR ratio change. The provider has been seen doing three different things:

- adjusting the price and the volume;
- adjusting neither, as for BYMA's share distribution and ETHA's reverse split;
- adjusting the price but not the volume, as in all seven CEDEAR events checked ([research](../research/open-bymadata-relevant-facts.md#volume-adjustment-around-corporate-actions)).

Those seven were four underlying splits that the CEDEARs followed (NFLX, XLK, XLE, XLU, NOW) and two pure ratio changes (SPY, HUT). [ADR 0009](./0009-correct-confirmed-unadjusted-corporate-actions.md) took NOW for a ratio change, but NOW's ratio did not change, and SPY's and HUT's real ratio changes behave the same way.

In the third case, every bar before the ex-date has an adjusted price and an old-unit count, so its traded value is understated by the share factor. Only the liquidity gate reads volume, and for 125 market sessions it can exclude a liquid line. So the committed list gains a volume-only correction: a sourced entry that multiplies volume before the ex-date by the share factor and leaves prices as served. It is applied before the liquidity gate.

## Guards

Each entry is guarded so that it is never applied on a guess, as in ADR 0009:

- **Inverted step guard.** The entry is applied only when the close shows no step across the ex-date, so the provider has visibly adjusted the price. If the price still steps, volume and price are on the same unit and traded value is already right, so the entry is skipped and reported.
- **Divisibility check.** The step guard cannot see whether the provider has since rescaled the volume too. A count rescaled by an integer factor is a multiple of it on every earlier bar, so an entry whose last 20 earlier traded volumes are all multiples of its factor is skipped and reported, rather than applied with a warning. A double rescale overstates traded value and can admit a thin line, which is the error the gate exists to prevent; a skipped correction can only exclude a liquid line for a while.

## Consequences

- The divisibility check has never been confirmed against a real provider rescale.
- A line traded in round lots can trip the check and lose a correct correction.
- Like the existing kind, the new kind costs maintenance: about seven events in fourteen months among catalog CEDEARs, each mattering for six months.

## Considered options

- **Amending ADR 0009.** Rejected: its decision, to correct confirmed actions from a sourced list only while the data still shows the problem, still holds. This is a second exception with its own guard and its own failure mode, a double rescale. ADR 0009 keeps its decision and has its NOW sentence corrected.
- **Detecting volume steps automatically.** Rejected for now: the observed step does not estimate the factor, the three ×2 events look like ordinary days for other CEDEARs, and a 20-session comparison would know the step only after the worst distortion has passed.
