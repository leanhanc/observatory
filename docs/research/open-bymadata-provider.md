# Open BYMADATA provider observations

Observed on 2026-09-04 against the public endpoints used by the official
[Open BYMADATA site](https://open.bymadata.com.ar/). These are implementation observations, not a
claim that the undocumented interface is stable.

## Confirmed by direct requests

### Historical daily series

The public historical endpoint is:

```text
GET /vanoms-be-core/rest/api/bymadata/free/chart/historical-series/history
```

It accepts:

- `symbol`, including the settlement suffix, such as `AAPL 24HS`, `AAPLD 24HS`, or `AAPLC 24HS`;
- `resolution=D` for daily data;
- `from` and `to` as Unix timestamps in seconds.

A successful response contains parallel `t`, `o`, `h`, `l`, `c`, and `v` arrays and an `s` status.
For example, the official endpoint returned `s: "ok"` for AAPL and `s: "no_data"` with empty arrays
for an unknown symbol. Both responses used HTTP 200.

The observed daily timestamps represented midnight in Buenos Aires. For example, `1788404400` is
`2026-09-03T03:00:00Z`, or `2026-09-03T00:00:00-03:00` in Buenos Aires. Session-date conversion
must therefore use the Buenos Aires timezone rather than slicing the UTC representation.

Source: [official historical endpoint](https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/chart/historical-series/history?symbol=AAPL%2024HS&resolution=D&from=1787011200&to=1788566400)

### Daily panels

The three panels needed by Observatory are:

- [`POST /cedears`](https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/cedears)
- [`POST /leading-equity`](https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/leading-equity)
- [`POST /general-equity`](https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/general-equity)

The requests were verified with a JSON body selecting the 24-hour settlement, retaining zero-value
rows so Observatory can identify Continuity Data during research, and requesting a panel size of 5,000:

```json
{
	"excludeZeroPxAndQty": false,
	"T1": true,
	"T0": false,
	"page_size": 5000
}
```

The CEDEAR endpoint returns an array directly. The leading- and general-equity endpoints return an
object containing `content` pagination metadata and a `data` array.

Without `page_size: 5000`, the observed general-equity response reported two pages and returned 189
of 197 rows. With it, the response reported one page containing all 197 rows. The adapter should
still compare the returned row count with `content.total_elements_count` and reject a response that
is paginated or incomplete, because silently accepting it would treat omitted instruments as
missing.

### Market day and panel freshness

The public market-time endpoint is:

```text
POST /vanoms-be-core/rest/api/bymadata/free/market-time
```

On 2026-09-04 it returned `isWorkingDay`, opening and closing wall-clock times, and the market
timezone. It did not return a session date. The independent
[OpenBYMAData Go wrapper](https://github.com/carvalab/openbymadata) exposes the same fields and
documents that panels fetched while the market is closed show the last available trading data.

Consequently, a panel adapter cannot discover which session an undated row belongs to. Observatory
does not convert panel rows into Daily Bars or use them to advance Bar History check progress. The
dated historical endpoint remains authoritative for initial backfill, refresh, and reconciliation.
Panel rows may later support a separate Provisional Bar used for same-evening analysis, but the
mapping of its closing value remains under observation.

### Observed publication timing

During the September 8–9, 2026 observation, the dated historical endpoint did not expose the
active session. September 8 bars first appeared around local midnight on September 9 and remained
stable in later samples. During the September 9 session, dated history still ended on September 8
while panel values changed and later stabilized after market close.

This is evidence for a next-day authoritative refresh, not a provider guarantee. A further sample
must compare the stabilized September 9 panel fields with the later dated September 9 history before
the Provisional Bar close-field mapping is selected.

### Trading Line mapping

The CEDEAR panel returned independent rows for:

| Observatory line | Provider symbol | Provider currency |
| ---------------- | --------------- | ----------------- |
| ARS              | `AAPL`          | `ARS`             |
| MEP              | `AAPLD`         | `USD`             |
| CCL              | `AAPLC`         | `EXT`             |

The catalog must supply these provider symbols. Bar History must not derive them from an Observatory
Trading Line identifier.

The historical endpoint uses the same symbol with ` 24HS` appended. The stored source information
therefore records values such as `AAPL 24HS`.

### Continuity Data

The CEDEAR and general-equity panels contained rows with zero open, high, low, and volume while
`closingPrice` retained a prior value. The full AAPLC backfill later showed the same behavior in the
dated historical endpoint: 157 of 485 returned rows through 2026-09-08 had zero volume, a positive
retained close, and at least one zero open, high, or low value. None of those rows had positive
volume, and no structurally valid zero-volume row was observed. The adapter therefore excludes that
exact provider signature as Continuity Data. All-zero rows and other invalid dated rows continue to
fail domain validation.

The pilot also exposed one genuinely inconsistent GGAL row on 2025-01-17: its reported close was
`7351.911`, below its reported low of `7370.666`, with positive volume. Observatory rejected the
complete GGAL update rather than repairing or hiding the provider value. YPFD was selected as the
representative Argentine-equity pilot line instead; its 486 returned bars through 2026-09-08 passed
the same validation unchanged.

### Railway canary backfill

On 2026-09-09, the local canary command wrote and read back these schema-v1 histories from the
private Railway Bucket, all checked through 2026-09-08:

| Trading Line      | Real Daily Bars | Stored range                  |
| ----------------- | --------------: | ----------------------------- |
| `cedear-aapl-ars` |             486 | 2024-09-09 through 2026-09-08 |
| `cedear-aapl-mep` |             486 | 2024-09-09 through 2026-09-08 |
| `cedear-aapl-ccl` |             328 | 2024-11-06 through 2026-09-08 |
| `equity-ypfd-ars` |             486 | 2024-09-09 through 2026-09-08 |

Every retained object used its canonical `<trading-line-id>/v1/history.json` key, recorded its exact
Open BYMADATA `24HS` source symbol and raw-price policy, and passed analysis-facing readback. A
synthetic `no_data` response produced a valid empty history, which was deleted after verification.
A deliberately invalid zero-price history was rejected before upload, and the live malformed GGAL
row independently confirmed that one bad provider row rejects the complete Trading Line update.
The Railway replacement integration test also passed and removed its temporary object afterward.

### Catalog-backed rollout

On 2026-09-12, the rollout resolved `ypf-stock-byma-ars` and
`apple-cedear-byma-ars` through the public Instrument Catalog. It first stored both histories
through 2026-09-10, then refreshed them through the completed 2026-09-11 session. Each canonical
history contained 486 real Daily Bars from 2024-09-12 through 2026-09-11 and was read back with its
source and Checked-Through Session intact.

The rollout used YPF rather than Galicia because Open BYMADATA still returned GGAL's invalid
2025-01-17 row. Observatory rejected that history without repairing the provider value; Galicia
remains recognized in the Instrument Catalog but is not enabled in the initial Bar History rollout.

Both canonical histories then completed full-window reconciliation in one sequentially paced
batch. A separate temporary YPFD canary history deliberately changed the newest bar's volume and
added a valid 1999-12-31 bar before the provider's 2000-01-01 query lower bound. Reconciliation
reported and restored the changed provider value, preserved the older bar outside the returned
window, and removed the temporary object. A direct bucket listing confirmed only the four earlier
pilot histories and the two new canonical histories remained.

Scheduled deployment remains part of the future application capability. Railway Cron Jobs provide
the required one-run-at-a-time behavior by skipping a new execution while its preceding execution
is still active: <https://docs.railway.com/cron-jobs>.

Railway's bucket credentials report a virtual-host URL style, but Bun's `S3Client` reached this
Railway S3-compatible endpoint with `virtualHostedStyle: false`; using `true` returned a nonexistent
bucket response. Future deployment configuration must preserve the empirically verified Bun
setting.

## Provider behavior not yet established

- Anonymous request limits and throttling response headers remain undocumented.
- The panel payload does not contain a session date. `tradeHour`, market-time, and the caller's date
  do not make an undated row authoritative Bar History.
- HTTP and payload behavior during provider outages has not been observed.
- The meaning and long-term stability of request fields such as `T1` are not documented publicly;
  captured fixtures and strict validation protect Observatory from silently accepting a changed
  shape, but they do not make the source contract stable.

BYMA separately publishes authenticated Market Data documentation, but the public Open BYMADATA
interface above is the source currently being integrated. BYMA describes its Market Data products
and access requirements on the [official BYMA APIs page](https://www.byma.com.ar/byma-apis).
