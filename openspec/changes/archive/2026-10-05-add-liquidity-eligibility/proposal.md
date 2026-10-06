# Add liquidity eligibility

## Why

Every indicator Observatory computes assumes the price series records a market: many participants trading every session, so each close is a fair reading of what the instrument was worth that day. A thin line breaks that assumption. When a CEDEAR trades on two sessions out of three, the sessions without trades leave holes, and the remaining closes are often a single small order hitting a stale book. An ATR built on that series measures sparse prints, not volatility. A swing high may be one odd lot. A Volatility Expansion may be the first trade in a week. The States and Events would be well formed and mean nothing.

The leading-panel stocks never hit this: all of them trade every session, with medians above USD 215k a day. The next universe, the CEDEARs, does. `docs/research/cedear-liquidity-distribution.md` measured 523 CEDEAR peso lines: their median daily traded value runs from millions of dollars down to nothing, with no natural gap, and about 95 have no history at all. Before CEDEARs enter the Analysis Run, Observatory needs an explicit rule that says which lines trade enough to be described.

## What Changes

### The concept

A Trading Line is **eligible** for analysis when, over a recent window, it traded regularly and with enough value. Eligibility is a yes/no gate, not a score. It says nothing about direction, quality or opportunity, only whether the price series is dense and heavy enough for indicators to describe market behavior.

Two measures, over a **window of the last 125 market sessions** up to and including the evaluated session (about six months of BYMA sessions):

- **Participation**: sessions in the window on which the line traded (a bar with volume above zero) ÷ 125. It is counted from the window start, not from the line's first bar, so a line listed inside the window is penalized. That is deliberate: it doubles as the minimum-history rule. A line needs at least 113 of 125 sessions, so it must have traded for about five and a half months before it is analyzed.
- **Median daily traded value in MEP dollars**: the median, over the traded sessions in the window, of `volume × close ÷ that session's MEP Rate`. That equals `volume × dollarized close`. The median, not the mean, because CEDEAR traded value is dominated by occasional block trades: in the research, one SNA session carried 70% of its two-year value. A single block trade must not make a thin line look liquid.

Thresholds: participation **≥ 90%** and median value **≥ USD 50,000**. Both bounds are inclusive. In the research's six-month window these admit about 152 CEDEARs out of 523 and every leading-panel stock with history. Participation barely bites once the value floor applies: the value floor and the listing-date penalty decide the count.

### Market sessions come from the MEP Rate

A market session is a session with a MEP Rate. That is the same calendar the Dollarized Series already uses: a session without a MEP Rate has no dollarized bar and cannot be valued in dollars, so it cannot count either for or against a line. In the research, the 485 MEP-rated sessions were exactly the sessions on which AL30 or AL30D traded. The three off-calendar sessions on which a handful of lines had bars but the bonds did not are excluded.

The measurement is causal: it reads only bars and MEP Rates on or before the evaluated session. A later bar cannot change a past eligibility.

When fewer than 125 market sessions exist through the evaluated session, the window cannot be filled and eligibility cannot be measured. That is a different fact from "this line is illiquid", so it is a separate outcome, not a failed gate.

### In the Analysis Run

- Eligibility is evaluated once per line, at the run's last market session: the latest session with a MEP Rate on or before the Requested-Through Session. There is no per-session eligibility history. A line ineligible today is not analyzed at all, and a line eligible today is analyzed over its whole window, including periods when it may have been thinner.
- The gate runs after the existing checks. A line that failed to fetch, has invalid bars, has no provider bars, or has no dollarized bar keeps that more specific reason. Every other line is measured.
- An ineligible line is recorded as unavailable with reason `insufficient-liquidity` and both measured values, so a reader can see how far it missed. It is never silently dropped. A line with no traded session in the window has participation `0` and a median of `null`, not `0`, because there is no traded session to take a median of.
- When the MEP Rate source has fewer than 125 market sessions through the Requested-Through Session, the run fails with `insufficient-market-sessions` and writes nothing. Every line shares that window, so no line could be measured.
- `ANALYSIS_CONFIGURATION` gains a `liquidityEligibility` group (`windowSessions: 125`, `minimumParticipation: 0.9`, `minimumMedianTradedValueUsd: 50_000`), and its `version` becomes `2`, because a snapshot's set of analyzed lines now depends on these values.

### Snapshot schema

The snapshot's `schemaVersion` becomes `2`: the unavailable entry gains a reason, `insufficient-liquidity`, and a variant carrying `liquidity`, and the run gains a failure reason. Version-1 snapshots from earlier real runs are already in the bucket, so a reader must be able to tell the two apart.

The key prefix follows the schema version: snapshots are written under `analysis-snapshots/v2/`, both dated and `latest`. A reader of one schema then never finds another schema's object under the keys it reads. The `v1` objects stay where they are and are no longer updated.

### Spec changes

- The "short history" scenario described a 30-bar line as available. The gate now rejects such a line, so the scenario uses an eligible 120-bar line, still too short for Regime. "Too little history" now applies only to lines that passed the gate.
- The failure requirement is renamed to "the run fails without usable MEP rates or without any analyzed line", because it now covers `insufficient-market-sessions`.
- The `analysis-run` spec's Purpose says the run "adds no measurements". A delta cannot change it, so it is edited at archive time. The `schedule-analysis-run` change also edits the same Purpose, so whichever change archives second reconciles both.

## Trade-offs

- **Window start vs. first bar.** Counting from the first bar would admit KLAC after 23 sessions at 100%. Counting from the window start rejects every line younger than about 113 sessions, including liquid recent listings such as SNDK (USD 3.1M a day, 77.6%). The indicators need history anyway: Regime needs 200 sessions, so a 23-session line would have most of its State `null`. One rule covers both concerns.
- **One evaluation per run.** A line that drops below the gate disappears from the next snapshot, and its earlier Events go with it. Keeping per-session eligibility would let past Events stay visible, at the cost of a second history to explain. Not needed yet.
- **Event history is not a causal sample.** Eligibility is judged once, at the latest session, and it decides whether a line publishes its whole Event history. A line that became liquid recently publishes Events from its thin period, and a line that has since thinned out publishes none. That is acceptable for describing what happened, but snapshot Events of gated lines are not a sample to compute evidence on. Evidence would first need per-session eligibility.
- **Stale lines can still pass.** At 113 of 125 sessions, a line that stopped trading up to 12 market sessions ago still passes, and its `latestState` is from its last traded session, not the Requested-Through Session. `window.lastSessionDate` shows this, but nothing flags it.
- **An all-ineligible universe publishes nothing.** If every line fails the gate, the run fails with `no-analyzed-lines`, writes nothing, and the previous `latest` stays live. That is harmless with the leaders in the catalog, but it matters before any catalog that could be CEDEAR-only.
- **Volume across ratio changes.** Prices look back-adjusted across CEDEAR ratio changes. Whether volume is adjusted too is unknown. If not, value before a ratio change is off by the ratio factor. The median over 125 sessions dampens a single wrong segment, but a recent ratio change could still move a borderline line. Out of scope here, and noted for the large-move safeguard.

## Scope

- A domain module, `src/modules/liquidity-eligibility`, independent of the provider, that selects the window and measures one line.
- The gate in the Analysis Run.
- `ANALYSIS_CONFIGURATION` version 2.
- A glossary entry in `CONTEXT.md`.
- No CEDEARs enter the catalog in this change. That is `add-leading-cedears`, which reuses the same function at generation time.

## Follow-ups

- **Large-move safeguard.** CEDEAR ratio changes can produce false Events. Check CRWD (×0.25 on 2026-07-02 with unchanged volume), ORLY (`close = 0` on 2025-06-05) and TEFO (near-zero close on 2026-01-20).
- **Per-session eligibility**, if Events from a line's thin periods need to be distinguished.
- **Recording measures for eligible lines**, if readers want to see how comfortably a line passed.
