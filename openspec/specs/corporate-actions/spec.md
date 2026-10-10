# corporate-actions Specification

## Purpose

Keep a committed, sourced list of confirmed Corporate Actions with what the provider was observed not to adjust, and correct a line's peso bars for them before anything reads the bars. A `prices-and-volume` entry, per ADR 0009, is for an action the provider adjusted in neither price nor volume; it is applied only while the fetched history still shows its price step, so a history the provider later adjusts is not adjusted twice. A `volume` entry, per ADR 0010, is for an action whose price the provider adjusted but whose volume it left in the old unit; it is applied only while the fetched history shows no price step, and is skipped when every recent earlier volume is a multiple of its share factor, because the provider may already have rescaled it. Detecting Corporate Actions automatically is out of scope.

## Requirements

### Requirement: a committed list of confirmed Corporate Actions

The corporate-actions module SHALL load `src/modules/corporate-actions/data/corporate-actions.v2.json` and SHALL fail to load when it is invalid. The file SHALL hold `schemaVersion: 2` and `corporateActions`, a list of entries. Every entry SHALL have:

- `tradingLineId`: a lowercase kebab-case Trading Line identifier;
- `exDate`: a real `YYYY-MM-DD` date, the first session on which the line trades without the entitlement;
- `correction`: what the provider left unadjusted, and so what the entry corrects: `prices-and-volume` or `volume`;
- `kind`: `share-distribution`, `split`, `reverse-split` or `ratio-change`. A `ratio-change` is a change of a CEDEAR's ratio with no event in its Underlying. The kind is descriptive and SHALL NOT change what a correction does;
- `sourceUrl`: an `https` URL of a primary source that confirms the action.

A `prices-and-volume` entry SHALL also have exactly `priceFactor`, and a `volume` entry exactly `shareFactor`; no entry SHALL have any other field.

- `priceFactor` is a positive finite number by which a price before the ex-date is multiplied to put it on the post-ex-date scale.
- `shareFactor` is a positive finite number: the shares or CEDEARs held after the event per one held before, by which a volume before the ex-date is multiplied to put it on the post-ex-date unit.

Either factor SHALL be at least `ANALYSIS_CONFIGURATION.corporateActions.maximumStepDeviation` squared away from 1: at most 1/1.5625 = 0.64, or at least 1.5625. Each guard below accepts or rejects an observed ratio within ×/÷1.25 of a reference, so this keeps the step band and the no-step band at least ×1.25 apart at their centers; a nearer factor, such as a 5-for-4 split's, cannot be listed. The factor's direction SHALL match the kind. A share distribution or a split multiplies the share count, so its `priceFactor` SHALL be below 1 and its `shareFactor` above 1. A reverse split combines shares, so the opposite holds. A ratio change can go either way and has no required direction.

Two entries SHALL NOT share a `tradingLineId` and `exDate`, whatever their `correction`. Validation SHALL report every invalid field with its path; duplicates SHALL be reported, at both entries, once every entry is valid. Each entry SHALL be a Corporate Action the provider was observed not to adjust in what the entry corrects; the list SHALL NOT be used for what the provider adjusts.

The list SHALL contain these `prices-and-volume` entries:

- BYMA's 1:1 share distribution: `byma-stock-byma-ars`, ex-date `2025-05-26`, price factor `0.5`, kind `share-distribution`, source `https://www.byma.com.ar/newsroom/byma-anuncia-pago-en-acciones`.
- ETHA's 1-for-3 reverse split, which the CEDEAR follows from its underlying ETF: `etha-cedear-byma-ars`, ex-date `2026-10-06`, price factor `3`, kind `reverse-split`, source `https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/501592`.

The list SHALL contain these `volume` entries, each sourced at `https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/<notice>`:

| Trading Line          | Ex-date    | Share factor | Kind           | Notice |
| --------------------- | ---------- | ------------ | -------------- | ------ |
| `spy-cedear-byma-ars` | 2026-05-29 | 3            | `ratio-change` | 493877 |
| `hut-cedear-byma-ars` | 2026-05-29 | 25           | `ratio-change` | 493878 |

SPY's and HUT's notices give a record date of 2026-05-29 and a change date of 2026-06-01 but no ex-date. Their ex-date is the record date: with T+1 settlement a trade on the record date carries no entitlement, and both lines' volume steps begin on 2026-05-29.

The list SHALL NOT contain the five older volume-only events the research found, NFLX, XLK, XLE, XLU and NOW: their ex-dates, from 2025-11-17 to 2025-12-18, are outside the liquidity window, so an entry would change no result. ADR 0010 records them.

#### Scenario: the BYMA and ETHA entries are loaded

- **WHEN** the committed list is loaded
- **THEN** it contains the BYMA share distribution with price factor 0.5 and the ETHA reverse split with price factor 3, both `prices-and-volume`, each with its source

#### Scenario: the SPY and HUT entries are loaded

- **WHEN** the committed list is loaded
- **THEN** it contains SPY's ratio change with share factor 3 and HUT's with share factor 25, both `volume` with ex-date 2026-05-29 and their notice as source

#### Scenario: a missing source is rejected

- **WHEN** a `prices-and-volume` or a `volume` entry has no `sourceUrl`
- **THEN** validation fails with an issue at that entry's `sourceUrl`

#### Scenario: invalid fields are rejected

- **WHEN** an entry has a price or share factor of 0, 1, 0.65, 1.56, a negative or a non-finite number, an `exDate` of `2025-02-30`, an unknown `kind`, an unknown `correction`, a non-`https` source or an extra field
- **THEN** validation fails with an issue at that field

#### Scenario: the factor field must match the correction

- **WHEN** a `volume` entry has a `priceFactor` instead of a `shareFactor`, or a `prices-and-volume` entry a `shareFactor` instead of a `priceFactor`
- **THEN** validation fails

#### Scenario: factors at the distance limit are accepted

- **WHEN** a split has a price factor of 0.64 or a share factor of 1.5625, or a reverse split a price factor of 1.5625 or a share factor of 0.64
- **THEN** validation accepts it

#### Scenario: the factor contradicts the kind

- **WHEN** a reverse split has a price factor below 1 or a share factor above 1, or a split or share distribution has a price factor above 1 or a share factor below 1
- **THEN** validation fails with one issue at that entry's factor

#### Scenario: a ratio change goes either way

- **WHEN** a ratio change has a share factor of 3, or of 0.5
- **THEN** validation accepts it

#### Scenario: a duplicate entry is rejected

- **WHEN** two entries share a `tradingLineId` and an `exDate`, even with different corrections
- **THEN** validation fails with an issue at both entries

### Requirement: a correction rescales the bars before the ex-date

The module SHALL expose a pure `applyCorporateActions(bars, corporateActions)` that takes one line's validated, chronological Daily Bars and that line's Corporate Actions. It SHALL return the corrected bars and one outcome per Corporate Action, in input order: the action's fields, a `status` and `observedCloseRatio`. A `prices-and-volume` action's status SHALL be `applied`, `step-not-observed` or `outside-window`; a `volume` action's, `applied`, `price-step-observed`, `volume-rescale-suspected` or `outside-window`.

For an applied `prices-and-volume` action, every bar with `sessionDate` before `exDate` SHALL have its open, high, low and close multiplied by `priceFactor` and its volume divided by it, so traded value is unchanged. For an applied `volume` action, every bar with `sessionDate` before `exDate` SHALL have its volume multiplied by `shareFactor`, and its open, high, low and close SHALL be unchanged, so traded value is multiplied by `shareFactor`. Bars on or after `exDate` SHALL be unchanged. When several actions apply to a line, each SHALL rescale the bars before its own ex-date, so a bar before several is rescaled by each of them. Each action SHALL be evaluated on the uncorrected input bars. The input SHALL NOT be mutated.

#### Scenario: prices and volume before the ex-date are rescaled

- **WHEN** a line closes at 400 with volume 100 on the session before an ex-date with price factor 0.5, and at 200 on the ex-date
- **THEN** the earlier bar becomes close 200 with volume 200, and its open, high and low are halved
- **AND** the ex-date bar and every later bar are unchanged
- **AND** the outcome is `applied` with `observedCloseRatio` 0.5

#### Scenario: a reverse split raises earlier prices

- **WHEN** a line closes at 100 with volume 900 before an ex-date with price factor 3, and at 290 on the ex-date
- **THEN** the earlier bar becomes close 300 with volume 300
- **AND** the outcome is `applied` with `observedCloseRatio` 2.9

#### Scenario: a volume-only correction leaves prices as served

- **WHEN** a line closes at 100 with volume 7 before an ex-date with share factor 3, and at 101 on the ex-date
- **THEN** the earlier bar keeps its open, high, low and close of 100 and has volume 21
- **AND** the ex-date bar and every later bar are unchanged
- **AND** the outcome is `applied` with `observedCloseRatio` 1.01

#### Scenario: two actions on one line

- **WHEN** a line has actions with price factor 0.5 at two ex-dates, and the step is present at both
- **THEN** a bar before both ex-dates has its prices multiplied by 0.25 and its volume by 4

### Requirement: an action is applied only when the step is still present

The observed close ratio SHALL be `close(first bar on or after exDate) / close(last bar before exDate)`, on the uncorrected input bars. Those two bars need not be adjacent sessions: the ratio spans every session between them that the line did not trade, such as a halt on the ex-date. A `prices-and-volume` action SHALL be applied only when `|ln(observedCloseRatio) − ln(priceFactor)| ≤ ln(ANALYSIS_CONFIGURATION.corporateActions.maximumStepDeviation)`, which is ln 1.25. Each action is evaluated on its own.

Otherwise a `prices-and-volume` action SHALL be skipped with status `step-not-observed`, and the bars SHALL NOT be changed by it. The status SHALL NOT claim a cause: the provider may have adjusted the history, or a real move on the ex-date may hide the step, and `observedCloseRatio` lets a reader tell which. When the bars have no bar before `exDate` or no bar on or after it, an action of either correction SHALL be skipped with status `outside-window` and `observedCloseRatio: null`.

#### Scenario: the provider already adjusted the history

- **WHEN** a line's close moves from 200 to 201 across an ex-date with price factor 0.5
- **THEN** the outcome is `step-not-observed` with `observedCloseRatio` 1.005
- **AND** no bar is changed

#### Scenario: a real move hides the step

- **WHEN** a line's close moves from 400 to 150 across an ex-date with price factor 0.5
- **THEN** the outcome is `step-not-observed` with `observedCloseRatio` 0.375
- **AND** no bar is changed

#### Scenario: two ex-dates with no bar between them

- **WHEN** a line has price-factor-0.5 actions on 2026-01-05 and 2026-01-07, and its bars close at 400 on 2026-01-02 and at 100 on 2026-01-08
- **THEN** both outcomes are `step-not-observed`, because each sees the combined ratio 0.25
- **AND** no bar is changed

#### Scenario: tolerance boundaries

- **WHEN** the observed ratio is exactly 0.5 × 1.25, or exactly 0.5 ÷ 1.25
- **THEN** the action is applied
- **AND** a ratio beyond either bound is `step-not-observed`

#### Scenario: the ex-date is outside the fetched window

- **WHEN** every bar is on or after the ex-date, or every bar is before it, for a `prices-and-volume` or a `volume` action
- **THEN** the outcome is `outside-window` with `observedCloseRatio: null`
- **AND** no bar is changed

#### Scenario: the line did not trade on the ex-date

- **WHEN** the line has no bar on the ex-date and trades two sessions later
- **THEN** the observed ratio uses that later bar

### Requirement: a volume-only action is applied only when the price shows no step

A `volume` action SHALL be applied only when the provider visibly adjusted the price: `|ln(observedCloseRatio)| ≤ ln(ANALYSIS_CONFIGURATION.corporateActions.maximumStepDeviation)`, that is, the observed close ratio, defined as for the other guard, is from 1/1.25 = 0.8 to 1.25 inclusive.

Otherwise it SHALL be skipped with status `price-step-observed` and its `observedCloseRatio`, and the bars SHALL NOT be changed by it. The status SHALL NOT claim a cause: the provider may not have adjusted the price, so the entry may need `prices-and-volume`, or a real move on the ex-date may have moved the close.

A `volume` action whose price shows no step SHALL then be checked for a volume the provider may already have rescaled. The check SHALL be evaluated only when `shareFactor` is an integer of at least 2 and the line has at least `ANALYSIS_CONFIGURATION.corporateActions.volumeRescaleCheckBars` (20) bars with volume above zero before `exDate`. It SHALL read the last 20 such bars. When every one of their volumes is a multiple of `shareFactor`, the action SHALL be skipped with status `volume-rescale-suspected` and its `observedCloseRatio`, and the bars SHALL NOT be changed by it. Otherwise, or when the check is not evaluated, the action SHALL be `applied`.

A rescale applied twice would overstate traded value and could admit a thin line, while a skipped correction can only understate it, so a suspected rescale is skipped rather than applied. The check reads only bars before the ex-date.

#### Scenario: the provider adjusted the price but not the volume

- **WHEN** a line has 20 traded bars before an ex-date with share factor 3, with volumes that are not all multiples of 3, and its close moves from 100 to 101 across the ex-date
- **THEN** the outcome is `applied` and each earlier bar's volume is tripled

#### Scenario: the price still shows the step

- **WHEN** a line's close moves from 300 to 100 across an ex-date with share factor 3
- **THEN** the outcome is `price-step-observed` with `observedCloseRatio` 1/3
- **AND** no bar is changed

#### Scenario: no-step boundaries

- **WHEN** the observed ratio is exactly 1.25, or exactly 1 ÷ 1.25
- **THEN** the `volume` action is applied
- **AND** a ratio beyond either bound is `price-step-observed`

#### Scenario: every earlier volume is a multiple of the factor

- **WHEN** the last 20 traded bars before an ex-date with share factor 3 all have volumes that are multiples of 3, and the close shows no step
- **THEN** the outcome is `volume-rescale-suspected` with its observed ratio
- **AND** no bar is changed

#### Scenario: a single volume breaks the pattern

- **WHEN** 19 of those 20 volumes are multiples of 3 and one is not
- **THEN** the outcome is `applied`

#### Scenario: zero-volume bars are not read

- **WHEN** the bars before the ex-date include zero-volume bars, and the last 20 bars with volume above zero are all multiples of 3
- **THEN** the outcome is `volume-rescale-suspected`

#### Scenario: the check is not evaluated

- **WHEN** fewer than 20 traded bars precede the ex-date, or the share factor is 2.5
- **THEN** a `volume` action whose price shows no step is `applied`, even if every earlier volume is a multiple of the factor
