# corporate-actions Specification

## Purpose

Keep a committed, sourced list of confirmed Corporate Actions that the provider was observed not to adjust, and correct a line's peso bars for them before anything reads the bars, per ADR 0009. An action is applied only while the fetched history still shows its step, so a history the provider later adjusts is not adjusted twice. Detecting Corporate Actions automatically is out of scope.

## Requirements

### Requirement: a committed list of confirmed Corporate Actions

The corporate-actions module SHALL load `src/modules/corporate-actions/data/corporate-actions.v1.json` and SHALL fail to load when it is invalid. The file SHALL hold `schemaVersion: 1` and `corporateActions`, a list of entries, each with exactly:

- `tradingLineId`: a lowercase kebab-case Trading Line identifier;
- `exDate`: a real `YYYY-MM-DD` date, the first session on which the line trades without the entitlement;
- `priceFactor`: a positive finite number by which a price before the ex-date is multiplied to put it on the post-ex-date scale. It SHALL be at least `ANALYSIS_CONFIGURATION.corporateActions.maximumStepDeviation` squared away from 1: at most 1/1.5625 = 0.64, or at least 1.5625. The step guard below accepts an observed ratio within ×/÷1.25 of the factor, so this keeps the accepted band at least ×1.25 away from no step, and a history the provider already adjusted is adjusted again only when a real move of ×/÷1.25 or more lands on the ex-date. A nearer factor, such as a 5-for-4 split's 0.8, cannot be listed;
- `kind`: `share-distribution`, `split` or `reverse-split`. A share distribution or a split multiplies the share count, so its factor SHALL be below 1; a reverse split combines shares, so its factor SHALL be above 1;
- `sourceUrl`: an `https` URL of a primary source that confirms the action.

Two entries SHALL NOT share a `tradingLineId` and `exDate`. Validation SHALL report every invalid field with its path; duplicates SHALL be reported, at both entries, once every entry is valid. Each entry SHALL be a Corporate Action that the provider was observed not to adjust; the list SHALL NOT be used for actions the provider adjusts.

The list SHALL contain BYMA's 1:1 share distribution: `byma-stock-byma-ars`, ex-date `2025-05-26`, price factor `0.5`, kind `share-distribution`, source `https://www.byma.com.ar/newsroom/byma-anuncia-pago-en-acciones`. The list SHALL also contain ETHA's 1-for-3 reverse split, which the CEDEAR follows from its underlying ETF: `etha-cedear-byma-ars`, ex-date `2026-10-06`, price factor `3`, kind `reverse-split`, source `https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/501592`.

#### Scenario: the BYMA and ETHA entries are loaded

- **WHEN** the committed list is loaded
- **THEN** it contains the BYMA share distribution with factor 0.5 and the ETHA reverse split with factor 3, each with its source

#### Scenario: a missing source is rejected

- **WHEN** an entry has no `sourceUrl`
- **THEN** validation fails with an issue at that entry's `sourceUrl`

#### Scenario: invalid fields are rejected

- **WHEN** an entry has a price factor of 0, 1, 0.65, 1.56, a negative or a non-finite number, an `exDate` of `2025-02-30`, an unknown `kind`, a non-`https` source or an extra field
- **THEN** validation fails with an issue at that field

#### Scenario: factors at the distance limit are accepted

- **WHEN** a split has a price factor of 0.64, or a reverse split one of 1.5625
- **THEN** validation accepts it

#### Scenario: the factor contradicts the kind

- **WHEN** a reverse split has a factor below 1, or a split or share distribution has a factor above 1
- **THEN** validation fails with one issue at that entry's `priceFactor`

#### Scenario: a duplicate entry is rejected

- **WHEN** two entries share a `tradingLineId` and an `exDate`
- **THEN** validation fails with an issue at both entries

### Requirement: a correction rescales the bars before the ex-date

The module SHALL expose a pure `applyCorporateActions(bars, corporateActions)` that takes one line's validated, chronological Daily Bars and that line's Corporate Actions. It SHALL return the corrected bars and one outcome per Corporate Action, in input order: the action's fields, including `tradingLineId`, a `status` of `applied`, `step-not-observed` or `outside-window`, and `observedCloseRatio`.

For an applied action, every bar with `sessionDate` before `exDate` SHALL have its open, high, low and close multiplied by `priceFactor` and its volume divided by it. Bars on or after `exDate` SHALL be unchanged. Traded value, volume times price, is therefore unchanged on every bar. When several actions apply to a line, each SHALL rescale the bars before its own ex-date, so a bar before both is rescaled by both factors. The input SHALL NOT be mutated.

#### Scenario: prices and volume before the ex-date are rescaled

- **WHEN** a line closes at 400 with volume 100 on the session before an ex-date with factor 0.5, and at 200 on the ex-date
- **THEN** the earlier bar becomes close 200 with volume 200, and its open, high and low are halved
- **AND** the ex-date bar and every later bar are unchanged
- **AND** the outcome is `applied` with `observedCloseRatio` 0.5

#### Scenario: a reverse split raises earlier prices

- **WHEN** a line closes at 100 with volume 900 before an ex-date with factor 3, and at 290 on the ex-date
- **THEN** the earlier bar becomes close 300 with volume 300
- **AND** the outcome is `applied` with `observedCloseRatio` 2.9

#### Scenario: two actions on one line

- **WHEN** a line has actions with factor 0.5 at two ex-dates, and the step is present at both
- **THEN** a bar before both ex-dates has its prices multiplied by 0.25 and its volume by 4

### Requirement: an action is applied only when the step is still present

The observed close ratio SHALL be `close(first bar on or after exDate) / close(last bar before exDate)`, on the uncorrected input bars. Those two bars need not be adjacent sessions: the ratio spans every session between them that the line did not trade, such as a halt on the ex-date. The action SHALL be applied only when `|ln(observedCloseRatio) − ln(priceFactor)| ≤ ln(ANALYSIS_CONFIGURATION.corporateActions.maximumStepDeviation)`, which is ln 1.25. Each action is evaluated on its own.

Otherwise the action SHALL be skipped with status `step-not-observed`, and the bars SHALL NOT be changed by it. The status SHALL NOT claim a cause: the provider may have adjusted the history, or a real move on the ex-date may hide the step, and `observedCloseRatio` lets a reader tell which. When the bars have no bar before `exDate` or no bar on or after it, the action SHALL be skipped with status `outside-window` and `observedCloseRatio: null`.

#### Scenario: the provider already adjusted the history

- **WHEN** a line's close moves from 200 to 201 across an ex-date with factor 0.5
- **THEN** the outcome is `step-not-observed` with `observedCloseRatio` 1.005
- **AND** no bar is changed

#### Scenario: a real move hides the step

- **WHEN** a line's close moves from 400 to 150 across an ex-date with factor 0.5
- **THEN** the outcome is `step-not-observed` with `observedCloseRatio` 0.375
- **AND** no bar is changed

#### Scenario: two ex-dates with no bar between them

- **WHEN** a line has factor-0.5 actions on 2026-01-05 and 2026-01-07, and its bars close at 400 on 2026-01-02 and at 100 on 2026-01-08
- **THEN** both outcomes are `step-not-observed`, because each sees the combined ratio 0.25
- **AND** no bar is changed

#### Scenario: tolerance boundaries

- **WHEN** the observed ratio is exactly 0.5 × 1.25, or exactly 0.5 ÷ 1.25
- **THEN** the action is applied
- **AND** a ratio beyond either bound is `step-not-observed`

#### Scenario: the ex-date is outside the fetched window

- **WHEN** every bar is on or after the ex-date, or every bar is before it
- **THEN** the outcome is `outside-window` with `observedCloseRatio: null`
- **AND** no bar is changed

#### Scenario: the line did not trade on the ex-date

- **WHEN** the line has no bar on the ex-date and trades two sessions later
- **THEN** the observed ratio uses that later bar
