## MODIFIED Requirements

### Requirement: a committed list of confirmed Corporate Actions

The corporate-actions module SHALL load `src/analysis/modules/corporate-actions/data/corporate-actions.v2.json` and SHALL fail to load when it is invalid. The file SHALL hold `schemaVersion: 2` and `corporateActions`, a list of entries. Every entry SHALL have:

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
