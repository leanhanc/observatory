## MODIFIED Requirements

### Requirement: candidates group a line's notices and say whether each is listed

Each candidate SHALL be one analyzed Trading Line with at least one matched notice, whatever the line's analysis outcome, carrying `tradingLineId` and `notices`. Every matched notice of that line in the fetched window SHALL be in the same candidate, in publication order, so that the announcement of one event and its follow-ups are one candidate. Each notice SHALL carry `documentId` (the feed's `descarga`), `publishedAt` (the feed's local Buenos Aires wall-clock `fecha` as `YYYY-MM-DDTHH:MM:SS`), `title` (the feed's `referencia`), `pdfUrl`, `https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/sba/download/<descarga>`, and `isListed`.

Each notice SHALL be listed on its own: `isListed` SHALL be true when the Corporate Action list has an entry for the notice's line, whatever its `correction`, whose `exDate` is from 10 calendar days before to 70 calendar days after the notice's publication date. Announcements and follow-ups can come about two months before the ex-date, and a late notice a few days after it. Candidates SHALL be in the analyzed lines' order.

#### Scenario: a listed action

- **WHEN** ETHA's notice of 2026-10-06 matches and the list has ETHA's entry with ex-date 2026-10-06
- **THEN** the ETHA notice is listed

#### Scenario: a listed volume-only action

- **WHEN** SPY's notice published on 2026-05-27 matches and the list has SPY's `volume` entry with ex-date 2026-05-29
- **THEN** the SPY notice is listed

#### Scenario: an unlisted action

- **WHEN** NOW's notice of 2025-12-11 matches and the list has no NOW entry
- **THEN** the NOW notice is unlisted

#### Scenario: the window boundaries

- **WHEN** a notice is published on 2026-10-06 and its line's entry has ex-date 2026-12-15, 2026-12-16, 2026-09-26 or 2026-09-25
- **THEN** the notice is listed, unlisted, listed and unlisted respectively

#### Scenario: a listed event does not hide another

- **WHEN** a line's candidate has a notice near a listed entry and an earlier notice months before it
- **THEN** the earlier notice is unlisted and the later one listed

#### Scenario: follow-up notices

- **WHEN** three notices for UL's reverse split, an announcement, a `Rectificativo` and an `Amplia información`, fall in one window
- **THEN** there is one UL candidate with the three notices in publication order
