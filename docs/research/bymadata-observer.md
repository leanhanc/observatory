# Historical publication observation

Run from the application repository with Bun. This standalone research script writes no Bar
History and does not advance checked-through progress. Each sample makes six sequential requests:
market time, the CEDEAR and leading-equity panels, then seven days of daily 24HS history for GGAL,
YPFD, and AAPL.

```sh
# One sample (also useful the following morning)
bun scripts/bymadata-observer.ts

# Eight samples, 15 minutes apart, starting when you invoke the script
bun scripts/bymadata-observer.ts --samples 8 --interval-minutes 15
```

Start around 30 minutes before the reported market closing time on a trading day. Keep the
computer awake and the process running. Take one more sample the following morning. There is no
automatic scheduler. Ctrl+C stops the process; completed sample files remain available.

Results default to `/tmp/observatory-bymadata-observations`; use `--output /your/directory` for
longer retention. Temporary storage can be cleared by the operating system. Each file records
request/response times, selected response headers, and the original response body. The historical
body contains parallel timestamp and OHLCV arrays. Convert timestamps to Buenos Aires dates.

Compare panel rows for AAPL, GGAL, and YPFD with the dated historical bars that appear after
midnight. Determine when each panel row last changes, whether all lines settle together, and whether
its final OHLCV matches the later historical value. A bar appearing or a market closing does not
establish finality; unchanged samples provide observational evidence, not a provider guarantee.
HTTP Date and cache headers also do not prove that bar values are final. Record empty responses and
errors separately from no-trade conclusions.

Requests are separated by two seconds, time out after 20 seconds, and are never retried
automatically. Any HTTP or transport failure stops the run after saving the observation. A run is
bounded to 32 samples, with at least ten minutes between samples. Check the raw body for malformed
JSON or provider-level errors even when HTTP status is successful.
