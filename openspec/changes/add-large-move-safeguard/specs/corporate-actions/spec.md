## ADDED Requirements

### Requirement: a committed list of confirmed Corporate Actions

The corporate-actions module SHALL load `src/modules/corporate-actions/data/corporate-actions.v1.json` and SHALL fail to load when it is invalid. The file SHALL hold `schemaVersion: 1` and `corporateActions`, a list of entries, each with exactly:

- `tradingLineId`: a lowercase kebab-case Trading Line identifier;
- `exDate`: a real `YYYY-MM-DD` date, the first session on which the line trades without the entitlement;
- `priceFactor`: a positive finite number other than 1, by which a price before the ex-date is multiplied to put it on the post-ex-date scale;
- `kind`: `share-distribution`, `split` or `reverse-split`. A share distribution or a split multiplies the share count, so its factor SHALL be below 1; a reverse split combines shares, so its factor SHALL be above 1;
- `sourceUrl`: an `https` URL of a primary source that confirms the action.

Two entries SHALL NOT share a `tradingLineId` and `exDate`. Validation SHALL report every issue with its path. Each entry SHALL be a Corporate Action that the provider was observed not to adjust; the list SHALL NOT be used for actions the provider adjusts.

The list SHALL contain BYMA's 1:1 share distribution: `byma-stock-byma-ars`, ex-date `2025-05-26`, price factor `0.5`, kind `share-distribution`, source `https://www.byma.com.ar/newsroom/byma-anuncia-pago-en-acciones`. The list SHALL also contain ETHA's 1-for-3 reverse split, which the CEDEAR follows from its underlying ETF: `etha-cedear-byma-ars`, ex-date `2026-10-06`, price factor `3`, kind `reverse-split`, source `https://www.sec.gov/Archives/edgar/data/0002000638/000143774926025654/etha20260803_8k.htm`. Every entry's `tradingLineId` SHALL resolve through the repository Instrument Catalog.

#### Scenario: the BYMA and ETHA entries are loaded

- **WHEN** the committed list is loaded
- **THEN** it contains the BYMA share distribution with factor 0.5 and the ETHA reverse split with factor 3, each with its source

#### Scenario: every entry names a catalog Trading Line

- **WHEN** each entry's `tradingLineId` is resolved through the repository Instrument Catalog
- **THEN** it resolves to a Trading Line

#### Scenario: a missing source is rejected

- **WHEN** an entry has no `sourceUrl`
- **THEN** validation fails with an issue at that entry's `sourceUrl`

#### Scenario: invalid fields are rejected

- **WHEN** an entry has a price factor of 0, 1, a negative or a non-finite number, an `exDate` of `2025-02-30`, an unknown `kind`, a non-`https` source or an extra field
- **THEN** validation fails with an issue at that field

#### Scenario: the factor contradicts the kind

- **WHEN** a reverse split has a factor below 1, or a split or share distribution has a factor above 1
- **THEN** validation fails with one issue at that entry's `priceFactor`

#### Scenario: a duplicate entry is rejected

- **WHEN** two entries share a `tradingLineId` and an `exDate`
- **THEN** validation fails with an issue at both entries

### Requirement: a correction rescales the bars before the ex-date

The module SHALL expose a pure `applyCorporateActions(bars, corporateActions)` that takes one line's validated, chronological Daily Bars and that line's Corporate Actions. It SHALL return the corrected bars and one outcome per Corporate Action, in input order: the action's fields, a `status` of `applied`, `already-adjusted` or `outside-window`, and `observedCloseRatio`.

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

The observed close ratio SHALL be `close(first bar on or after exDate) / close(last bar before exDate)`, on the uncorrected input bars. The action SHALL be applied only when both hold:

- `|ln(observedCloseRatio) − ln(priceFactor)| ≤ ln(ANALYSIS_CONFIGURATION.corporateActions.maximumStepDeviation)`, which is ln 1.25;
- `|ln(observedCloseRatio) − ln(priceFactor)| < |ln(observedCloseRatio)|`: the observed ratio is closer to the factor than to no step.

Otherwise the action SHALL be skipped with status `already-adjusted`, because the provider's data no longer shows the step, and the bars SHALL NOT be changed by it. When the bars have no bar before `exDate` or no bar on or after it, the action SHALL be skipped with status `outside-window` and `observedCloseRatio: null`.

#### Scenario: the provider already adjusted the history

- **WHEN** a line's close moves from 200 to 201 across an ex-date with factor 0.5
- **THEN** the outcome is `already-adjusted` with `observedCloseRatio` 1.005
- **AND** no bar is changed

#### Scenario: tolerance boundaries

- **WHEN** the observed ratio is exactly 0.5 × 1.25, or exactly 0.5 ÷ 1.25
- **THEN** the action is applied
- **AND** a ratio beyond either bound is `already-adjusted`

#### Scenario: a factor near 1

- **WHEN** a factor is 0.85 and the observed ratio is 0.99
- **THEN** the outcome is `already-adjusted`, although 0.99 is within ×1.25 of 0.85, because it is closer to no step

#### Scenario: the ex-date is outside the fetched window

- **WHEN** every bar is on or after the ex-date, or every bar is before it
- **THEN** the outcome is `outside-window` with `observedCloseRatio: null`
- **AND** no bar is changed

#### Scenario: the line did not trade on the ex-date

- **WHEN** the line has no bar on the ex-date and trades two sessions later
- **THEN** the observed ratio uses that later bar
