## MODIFIED Requirements

### Requirement: a line page offers a currency view without JavaScript

An available line traded in pesos, as its Trading Line's currency in the Instrument Catalog says, SHALL offer three currency views: ARS, in pesos; USD, in MEP dollars, the analyzed unit; and CCL, in CCL dollars. The CCL view SHALL be offered only when the line's `cclEquivalents` is not `null`; otherwise the page offers ARS and USD. A line the Catalog does not list as ARS SHALL show only the analyzed prices, in MEP dollars, with no currency control.

The control SHALL be a group of radio inputs, one per offered view, labeled "ARS", "USD" and "CCL" in that order, with a "Moneda" legend, placed in the identity section after the data date. ARS SHALL be checked in the HTML, so the page as built and indexed reads in pesos.

The build SHALL render every view's variant of each phrase that names a price, a price's currency or a currency's return: the period returns, the support and resistance lines, the pattern line, the trend tipping points, the Structure Break Events, the raw evidence and the currency note. Each variant SHALL be marked with its view, and CSS alone SHALL show the variant of the checked view and hide the others, with `:has()` on the checked input. Without that support the ARS variants SHALL show and the USD and CCL variants SHALL stay hidden: the rule that hides them by default SHALL NOT share a selector list with a `:has()` selector, since a browser drops a whole rule over one selector it does not support. Without that support the control SHALL still show which view is checked, with the radio inputs themselves. The page SHALL ship no script for it, and SHALL NOT use a route, a query string or a fragment per view: one URL serves every view. Phrases without a price, such as the trend, the 200-session distance, the pending trend change, Regime Transitions, Volatile Sessions and the momentum, SHALL be rendered once.

The control's CSS SHALL be plain CSS inside a cascade layer, and minimal: a segmented row of the three labels with the checked one marked. It SHALL NOT restyle anything else on the page.

#### Scenario: GGAL offers three views

- **WHEN** the build writes GGAL's page and its `cclEquivalents` is not `null`
- **THEN** the page has radio inputs labeled ARS, USD and CCL, in that order, with ARS checked
- **AND** each phrase that names a price is rendered three times, once per view
- **AND** the page has no `<script` tag

#### Scenario: no CCL Rate on the line's session

- **WHEN** a peso line's `cclEquivalents` is `null`, because the run had no CCL Rate or none on the line's last session
- **THEN** its page has only the ARS and USD inputs, with ARS checked, and renders no CCL variant

#### Scenario: a line not traded in pesos

- **WHEN** a line's Trading Line currency is not ARS
- **THEN** its page has no currency inputs and shows its prices in MEP dollars only

#### Scenario: phrases without a price are rendered once

- **WHEN** the build writes GGAL's page
- **THEN** "Tendencia bajista." and its momentum sentence appear once each

#### Scenario: a browser without `:has()`

- **WHEN** a browser that does not support `:has()` opens GGAL's page
- **THEN** it shows only the ARS variants, and the ARS radio input shows as checked

### Requirement: a line page shows the last close and its day change

An available line's page SHALL show its last close from `latestClose`, in each currency view: the `peso` part in ARS, `mep` in USD and `ccl` in CCL, rendered as a price phrase of the currency-view requirements. It SHALL show the close as a price, with no label, followed, when the part's `change` is not `null`, by the change as a signed absolute figure in the view's currency and a signed percentage: "$ 5.940 (+$ 60, +1,0 %)". Its place under the line's name and data date says it is the last close and its change since the previous session, so the page names neither. A part whose change is `null` SHALL show the close alone, never a change of `0`. The page SHALL read every figure from the snapshot and SHALL NOT compute a change. The sign carries the direction; the page adds no color.

A change SHALL be written with the decimals its close is written with, so the two read at one precision: a peso change whole on a close of a thousand pesos or more and with two decimals below; a dollar change with two decimals on a close of one dollar or more, and on a close under one dollar with as many decimals as the close's third significant digit needs: three on U$S 0,343, four on U$S 0,0237. A change SHALL be written as zero, without a sign, only when it rounds to zero at those decimals; otherwise it SHALL carry its sign. A change smaller than the close's last digit reads as zero even when its percentage does not round to zero, as a change smaller than the close's own precision cannot be written in it: "U$S 1,18 (U$S 0,00, +0,3 %)".

#### Scenario: GGAL's last close in each view

- **WHEN** GGAL's `latestClose` has a peso close of 5940 up 60 pesos (+1.02 %), a MEP close of 4 with a change of 0, and a CCL close of 3.8077 down 0.0105 (−0.27 %)
- **THEN** the ARS view shows "$ 5.940 (+$ 60, +1,0 %)"
- **AND** the USD view shows "U$S 4,00 (U$S 0,00, 0,0 %)"
- **AND** the CCL view shows "U$S 3,81 (−U$S 0,01, −0,3 %)", at the close's two decimals

#### Scenario: a small change on a close under one dollar

- **WHEN** VALO's `latestClose.mep` has a close of 0.3427 down 0.0023 (−0.67 %)
- **THEN** the USD view shows "U$S 0,343 (−U$S 0,002, −0,7 %)", not a change of "U$S 0,00"

#### Scenario: a change smaller than the close's last digit

- **WHEN** a line's `latestClose.mep` has a close of 1.1827 up 0.0041 (+0.34 %)
- **THEN** the USD view shows "U$S 1,18 (U$S 0,00, +0,3 %)"

#### Scenario: no rate on the previous session

- **WHEN** the line's `latestClose.mep` has a `null` change
- **THEN** the USD view shows "U$S 4,00" and no change
