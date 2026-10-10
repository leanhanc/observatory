# Add a corporate-action watch to the Analysis Run

## Why

Observatory corrects a Corporate Action only when a committed, sourced entry lists it ([ADR 0009](../../../docs/adr/0009-correct-confirmed-unadjusted-corporate-actions.md)). An unlisted action is not corrected and is flagged only when its step is a Large One-Session Move, and a CEDEAR split the provider adjusts in price but not in volume is not flagged at all. An action is noticed after its step reaches the snapshot, or not at all.

Issuers and CEDEAR program issuers announce these actions in Open BYMADATA's relevant-facts feed ([research](../../../docs/research/open-bymadata-relevant-facts.md)). A daily look at that feed, narrowed to analyzed lines and to price-scaling events, turns "an action was missed" into "a notice is waiting to be checked".

## What Changes

### A report, never a correction

Each Analysis Run fetches the feed once and records, for each analyzed line, the notices that may announce a Corporate Action for it. Nothing is applied: a notice says only that something was announced. Its title never carries the price factor, and only a person reading the PDF can confirm the ex-date and the factor before adding an entry to the committed list.

### Fetch

One `POST .../free/bnown/relevant-facts` per run, after the analyzed lines' main and retry passes and before the snapshot write, with the usual 2 s pause before it. The body is the web app's, plus `page_size: 5000`; `publishDate` and `publishToDate` cover the seven calendar days ending on the Requested-Through Session. A notice published on a weekend, a holiday or after a run's cut-off is therefore still seen by a later run. Notice downloads are rate-limited to about one per minute, so the run never downloads a PDF; it records the PDF link.

The watch runs after every line is analyzed so a slow or failing feed cannot delay any line, and it does not count against the retry cut-off: its one request, bounded by the 20 s request timeout, ends well inside the deadline's 5-minute margin. It is not retried. A run that cannot write a snapshot, because the MEP rate source failed or no line is available, makes no watch request.

A feed failure never fails the run: an HTTP error, a network error or timeout, a body that is not JSON, an unexpected shape or a paginated response records the watch as `unavailable` with a message, and the command logs a warning.

### Match

The rules come from the research note. The publisher names, the alias maps and the event phrases live together in `src/modules/corporate-action-watch/data/corporate-action-watch-rules.v1.json`, validated on load.

- **Local stocks.** A notice matches a stock line when its `especie` equals the line's issuer code. The issuer code is the symbol, except for series-suffixed symbols whose issuer code was read from the feed: `TECO2` → `TECO`, `TGSU2` → `TGSU`, `TGNO4` → `TGNO` and `SUPV` → `GSUP`. A notice from a CEDEAR program issuer whose title mentions "Cedear" never matches a stock: Banco Macro publishes CEDEAR notices under `especie` `BMA`, which is also its stock symbol, while its own notices do not mention "Cedear" and still match `BMA`. Excluding every program-issuer row from stock matching would miss Banco Macro's own corporate actions.
- **CEDEARs.** Only notices whose `emisor` is a CEDEAR program issuer (BANCO COMAFI S.A., Caja de Valores S.A., BANCO MACRO S.A.) are considered. The title is split on `" - "`, `":"` and parentheses, and a notice matches a CEDEAR line when a trimmed token equals its symbol, or equals a name alias of it, such as `HUT 8 CORP.` → `HUT`. A notice that names several tickers matches each line.
- **Event filter.** A matched notice is kept only when its title contains, as whole words and case-insensitively, `stock split`, `reverse stock split`, `cambio de ratio`, `dividendo en acciones`, `dividendos en acciones`, `capitalizaciones`, `stock dividend` or `dividendo opcional`. Titles starting with `Aviso de pago de servicios o renta de Cedear`, CEDEAR cash distributions, are excluded explicitly. Bare `acciones` and `ratio` are never phrases: they match "transacciones" and "CORPORATION".

### Report

Matched notices are grouped by Trading Line: within one run's seven-day window, every notice for a line is one **candidate**, because one event is often announced several times (announcement, "Amplía/Actualiza información", "Rectificativo"). Each candidate has the line, whether it is **listed**, and its notices in publication order, each with its document id, publication time, title and PDF URL `.../free/sba/download/<descarga>`. A candidate is listed when the committed Corporate Action list has an entry for that line whose ex-date is within 10 calendar days of any of its notices' publication dates.

The snapshot records the watch: its status, the publication window, and the candidates. The command logs each unlisted candidate as one warning line with its notices' titles and PDF links, and each listed one at info.

### Snapshot schema

The snapshot gains a required `corporateActionWatch` field, so `schemaVersion` becomes `4` and the key prefix `analysis-snapshots/v4/`. Dated v3 objects are already in the bucket without the field. A reader of one schema must be able to trust that every object under its prefix has the fields its schema declares; keeping v3 would make the field optional in practice for every v3 reader. The v3 objects stay where they are. The Analysis Configuration is unchanged: the watch changes no measurement.

## Trade-offs

- **Titles only.** A notice whose title names neither the ticker nor an aliased name is missed. So is a notice under a ticker that has since changed, and an event worded outside the phrase list, such as a plural "Stock Splits".
- **A long-running event warns more than once.** Follow-ups can span weeks. Each run reports the notices of its own window, so a follow-up published weeks before the ex-date is reported again, as unlisted until an entry exists near its date.
- **One line, one candidate per window.** Two different events for the same line within seven days would be grouped together. Both notices are still listed.
- **Not every match is a correction.** Most CEDEAR splits are adjusted by the provider, at least in price. An unlisted candidate asks for a check; it does not say an entry is missing.
- **Spin-offs, warrant distributions and name changes are left out.** They have no clean price factor, and ADR 0009 corrects only those that do.

## Out of scope

- Downloading or parsing PDFs.
- Adding entries to the committed list.
- Volume adjustment of CEDEAR splits.
