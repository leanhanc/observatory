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
rows so Observatory can apply its own carried-close rule, and requesting a panel size of 5,000:

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

Consequently, the panel adapter cannot discover which session an undated row belongs to. An
ordinary panel refresh represents only the caller's single `throughSession`; the scheduler must
establish that this is the newly completed session. Missed-session catch-up must use the historical
endpoint, whose rows carry timestamps. Keeping a separate caller-supplied `sessionDate` would allow
the same panel row to be mislabeled with an arbitrary older date, so the adapter does not accept one.

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

### Carried-close rows

The CEDEAR and general-equity panels contained rows with zero open, high, low, and volume while
`closingPrice` retained a prior value. This confirms that carried-close detection is required before
domain validation. Historical AAPL, AAPLD, and AAPLC probes did not contain those synthetic rows;
sessions without trades were absent from the returned arrays.

## Provider behavior not yet established

- Anonymous request limits and throttling response headers remain undocumented.
- The panel payload does not contain a session date. The scheduled application must establish the
  newly completed `throughSession`; `tradeHour` alone cannot establish it.
- HTTP and payload behavior during provider outages has not been observed.
- The meaning and long-term stability of request fields such as `T1` are not documented publicly;
  captured fixtures and strict validation protect Observatory from silently accepting a changed
  shape, but they do not make the source contract stable.

BYMA separately publishes authenticated Market Data documentation, but the public Open BYMADATA
interface above is the source currently being integrated. BYMA describes its Market Data products
and access requirements on the [official BYMA APIs page](https://www.byma.com.ar/byma-apis).
