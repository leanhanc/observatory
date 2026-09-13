# TradingView-API as inspiration for Observatory

Observed on 2026-09-13 at upstream commit
[`5baea86`](https://github.com/Mathieu2301/TradingView-API/tree/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c).
This is an architecture and risk review, not approval to use TradingView data.

## Recommendation

Use `Mathieu2301/TradingView-API` as a **read-only design reference**. Do not install it, fork it
into Observatory, or use it as a market-data provider unless TradingView and the relevant data
providers give Observatory a separate written agreement that permits automated processing and the
intended public product.

The repository contains a few good shapes for a future licensed realtime adapter: one connection
can carry several logical sessions, messages can be routed by session identity, duplicate
subscriptions can share upstream work, and resources have explicit cleanup operations. The actual
implementation is not strong enough for Observatory's correctness boundary, and TradingView's
current access and data-use rules are the decisive blocker.

Its backtesting and replay features also overlap only superficially with Observatory Research.
They can run TradingView strategies repeatedly and replay a chart, but they do not provide the
research discipline Observatory has built around information timing, matched base rates,
independent episodes, holdout use, and explicit evidence states.

## What the project actually is

The package is an unofficial CommonJS JavaScript client for TradingView's website services. It
opens the website's WebSocket endpoint, formats TradingView's private message protocol, and calls
website endpoints for symbol search, scanner summaries, Pine scripts, user sessions, and drawings.
TradingView itself says that it currently has no API for obtaining market data or indicator
values; its documented REST API is for broker integrations
([TradingView support](https://www.tradingview.com/support/solutions/43000474413-i-need-access-to-your-api-in-order-to-get-data-or-indicator-values/)).

The public surface has three broad parts:

- a `Client` that owns one socket, a send queue, authentication, and a registry of logical
  sessions;
- chart, quote, replay, and study objects that register message handlers with that client;
- direct HTTP helpers for symbol and indicator search, scanner-derived technical-analysis
  summaries, authentication, and chart assets.

The repository advertises realtime prices, indicator values, replay, date-bounded chart data, and
automated strategy experiments. Screener top values, hotlists, and calendar are unchecked future
features, not current capabilities
([README](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/README.md#L22-L46)).

## Where it overlaps with the public app

| Area                | TradingView-API                                                                 | Observatory                                                                                                    | Conclusion                                                                                           |
| ------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Instrument identity | Searches and resolves provider symbols such as `NASDAQ:AAPL`                    | Catalog owns stable Instruments and Trading Lines; callers must not parse IDs                                  | Search could assist catalog maintenance, but provider symbols cannot become Observatory identity     |
| Historical bars     | Requests a bar count around a timestamp and accumulates epoch-timestamped OHLCV | Bar History accepts an explicit completed-session cutoff, validates, reconciles, and persists per Trading Line | Similar payload, different promise; do not place its chart session behind Bar History unchanged      |
| Live data           | One WebSocket multiplexes chart, quote, replay, and study sessions              | Intraday is future scope and browser access to upstreams is forbidden                                          | The connection/session shape is useful later with a licensed provider                                |
| Indicators          | TradingView computes Pine and built-in studies remotely                         | Observatory owns explainable, reproducible domain calculations                                                 | Poor fit; remote opaque studies would weaken the product's evidence trail                            |
| Screening           | Returns TradingView's aggregate recommendation scores                           | Observatory surfaces explained State, Events, and evidence-backed Opportunities                                | Direct conflict with the product language                                                            |
| Storage/finality    | In-memory periods update by timestamp; no durable-history contract              | Complete validated histories, provenance, check progress, and correction reporting                             | Timestamp replacement is a useful small idea; Observatory's existing model is substantially stronger |

The current [Bar History design](../../openspec/changes/add-bar-history/design.md) deliberately keeps
provider transformation behind a narrow adapter and analysis-history selection outside the module.
The [Instrument Catalog design](../../openspec/changes/add-instrument-catalog/design.md) likewise
keeps provider mapping and analysis policy out of catalog records. TradingView-API should not cause
either boundary to move.

## Architectural ideas worth learning from

### One transport, several scoped sessions

The client owns one WebSocket and routes packets to chart, quote, replay, or study handlers by a
session ID. Higher-level objects receive only a small bridge containing the session registry and a
send operation
([client routing](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/src/client.js#L157-L212),
[session factories](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/src/client.js#L286-L296)).

That separation is useful for a future realtime capability: a process-scoped provider connection
could carry many narrowly scoped subscriptions without leaking the wire protocol into market-domain
modules. In an Effect architecture, the connection belongs in a managed Layer and each
subscription belongs to a Scope. The useful lesson is the ownership shape, not these concrete
classes or message names.

### Shared subscriptions with explicit cleanup

Quote listeners for the same symbol and session share one upstream subscription. Chart sessions,
quote sessions, and studies expose `delete`, `close`, or `remove`
([shared quote listener](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/src/quote/market.js#L48-L63),
[cleanup](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/src/chart/session.js#L545-L552)).
Observatory should preserve this idea with reference counts and guaranteed cleanup rather than
copying the sparse-array implementation, whose `.length` test can fail to recognize that the last
active listener has left.

### Updates replace the same period

Chart periods are keyed by timestamp. A later update for the same timestamp replaces the earlier
value, and the public getter sorts the accumulated periods
([period storage](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/src/chart/session.js#L133-L142),
[update handling](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/src/chart/session.js#L204-L231)).
This is the live-data cousin of Bar History's session-date reconciliation. For Observatory it must
remain a provisional observation until a licensed source supplies the final completed-session
fact.

### Provider metadata is richer than a ticker

Resolved chart metadata includes exchange, currency, timezone, trading session, price scale,
tradability, supported resolutions, adjustment support, and extended-hours support
([`MarketInfos`](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/src/chart/session.js#L69-L112)).
This is a useful checklist when evaluating a foreign-history or realtime provider. It does not mean
all those fields belong in Instrument Catalog: source capabilities and source-specific identifiers
belong at the provider/application boundary, while only stable instrument facts belong in the
catalog.

## Historical bars, realtime, and reliability

`setMarket` accepts timeframe, bar count, an ending timestamp, adjustment, session, currency, and
replay options. The default adjustment is `splits`. `setSeries` expresses the request as a count or
as `[bar_count, reference, range]`, and `fetchMore` merely sends a request for more bars
([market options](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/src/chart/session.js#L326-L397),
[history requests](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/src/chart/session.js#L295-L324)).

That is not enough to satisfy Bar History. The client does not distinguish a forming bar from a
completed one, does not convert timestamps into an exchange-session date, does not expose a stable
pagination checkpoint, does not report source provenance, and does not reconcile a durable prior
history. Returned OHLCV values are also renamed to `max` and `min`, newest-first, and volume is
rounded to two decimals before the caller sees it
([period mapping](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/src/chart/session.js#L213-L223)).
An open issue reports that this route returned only 10,000 bars even with a Premium account, which
also makes provider-plan assumptions unsafe
([issue 223](https://github.com/Mathieu2301/TradingView-API/issues/223)).

Realtime lifecycle is incomplete. The code echoes heartbeats and queues outgoing messages, but the
queue is unbounded and drains synchronously. There is no pacing, timeout, cancellation,
backpressure, or general request correlation. A socket close marks the client disconnected but
does not reconnect or restore sessions
([connection handlers](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/src/client.js#L269-L283));
the reconnect gap has also been reported by users
([issue 65](https://github.com/Mathieu2301/TradingView-API/issues/65)). `end()` calls `close()` and
resolves immediately instead of waiting for the socket's close event
([`end`](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/src/client.js#L298-L307)).

Errors are variadic callback payloads—sometimes strings, sometimes provider objects—and fall back
to `console.error` when no handler exists. They are not typed failures and carry no retry or
freshness decision. Observatory should instead distinguish at least transport failure, provider
rejection, malformed data, authorization failure, stale stream, and deliberate shutdown.

## Symbol search, indicators, screeners, and calendar

The current symbol search is the most potentially useful HTTP feature. It supports an exchange
prefix, a type filter, and offset pagination, then normalizes results into an
`EXCHANGE:SYMBOL`-like provider ID
([search implementation](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/src/miscRequests.js#L128-L177)).
The idea could become a future catalog-maintenance assistant: propose candidates, display their
source metadata, and require a reviewed catalog change. Runtime search results must never silently
create Instruments or Trading Lines.

The indicator and scanner features are a poor product fit. `getTA` fetches TradingView's
`Recommend.Other`, `Recommend.All`, and `Recommend.MA` aggregates across several timeframes and
turns them into scores
([scanner implementation](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/src/miscRequests.js#L9-L23),
[`getTA`](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/src/miscRequests.js#L48-L73)).
That is exactly the unexplained score Observatory avoids. Pine studies and strategy reports are
also computed by TradingView, which prevents Observatory from owning the calculation, replaying it
against its own fixtures, or explaining a result from its own rules.

There is no current generic screener, hotlist, or calendar implementation. If Observatory later
needs earnings, dividends, corporate actions, or exchange sessions, those should be separate
capabilities built against explicitly licensed sources, not additions to Bar History or Instrument
Catalog.

## Comparison with Observatory Research

### The similarities are real but shallow

Both projects can evaluate historical market behavior, change indicator or strategy inputs, and
step through past bars. TradingView-API can mutate a Pine strategy's inputs and ask TradingView for
a new performance report; its authenticated integration test increments one position-size input
and reads trade/performance fields
([strategy experiment](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/tests/indicators.test.ts#L68-L115)).
Its replay mode asks TradingView's server to move a chart cursor and stream updates
([replay test](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/tests/replayMode.test.ts#L19-L70)).

Observatory Research also runs hypotheses across history and has replay tests, but the meanings are
different:

- TradingView replay is a remote chart feature. Observatory replay is a causality test: evaluating
  each prefix must equal evaluating the same point with the full history available
  ([replay-equivalence tests](../../../observatory-research/Tests/ObservationCoreTests/ReplayTests.swift)).
- TradingView strategy reports are trading-performance outputs produced by an external engine.
  Observatory evaluates an explicit condition with entry at the next session, fixed confirm and
  cancel barriers, and separate forward-return measures
  ([Backtest](../../../observatory-research/Sources/Evaluation/Backtest.swift),
  [Barriers](../../../observatory-research/Sources/Evaluation/Barriers.swift)).
- Trying many TradingView settings is a parameter search. Observatory records hypothesis lineage,
  labels exploration, spends holdout data deliberately, and accounts for multiple testing
  ([hypothesis design](../../../observatory-research/openspec/changes/hypothesis-ledger/design.md)).
- TradingView's report includes conventional strategy statistics. Observatory reports results
  beside a matched baseline, collapses repeated signals into episodes, clusters across correlated
  instruments, and exposes the effective sample size
  ([evaluation specification](../../../observatory-research/openspec/specs/evaluation/spec.md)).

### Reusable ideas for a future TypeScript research capability

The useful abstraction is an **experiment runner**, not TradingView's strategy engine. A future
TypeScript research module could accept a declared hypothesis plus an immutable parameter set,
produce a structured run record, and isolate each run so several declared experiments can be
scheduled safely. Progress and completion events would help long universe runs, and deterministic
run identities would make retries observable.

The library's separation of price-series updates from study updates is also useful. In Observatory,
that should become a one-way pipeline—validated bars produce features, features produce events,
events feed evaluation—where each stage can be replayed from stored input. It must not become a
remote calculation hidden behind a callback.

The misleading idea to reject is that fast parameter sweeps are automatically useful research.
Without a declared search space, held-out evaluation, episode independence, and correction for the
number of questions asked, faster sweeps mostly make it faster to find chance results. The current
research repository intentionally keeps the hypothesis vocabulary closed and the confirmatory
choice human-owned
([Hypothesis](../../../observatory-research/Sources/Evaluation/Hypothesis.swift)).

## Maintenance, testing, and licensing risk

The repository is active enough to be informative: at the inspected commit it had 259 commits,
and source changes continued through June 2026. The stable package identifies itself as version
3.5.2, released from the repository in October 2025. Activity does not remove the fundamental risk
of an undocumented website protocol; TradingView's terms say services and APIs may change without
notice and do not promise backward compatibility
([Terms section 2](https://www.tradingview.com/policies/)).

Its tests are mostly live integration tests against TradingView. CI runs a Node version matrix but
sets `max-parallel: 1` because authenticated WebSocket tests are flaky
([workflow](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/.github/workflows/tests.yml#L12-L36)).
Several tests poll until the outer test timeout, while quote assertions create promises without
awaiting or returning them
([chart polling](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/tests/simpleChart.test.ts#L19-L42),
[quote tests](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/tests/quoteSession.test.ts#L19-L52)).
Observatory should keep deterministic adapter fixtures and pure domain tests, with a small separate
provider canary for endpoint drift.

The package metadata declares an ISC license, but the inspected repository contains no `LICENSE`
file
([package metadata](https://github.com/Mathieu2301/TradingView-API/blob/5baea86c8c7e576f13464919c86c3b4c4b0ecf4c/package.json#L1-L30)).
Even an unambiguous code license would cover the wrapper's code, not grant rights to TradingView's
services or its providers' market data.

TradingView's current rules are clear enough to stop a provider experiment:

- automated collection through scripts, APIs, scraping, mining, robots, or other extraction tools
  is prohibited, and external automation is described as manual-use abuse
  ([TradingView support](https://www.tradingview.com/support/solutions/43000674726-why-is-my-account-banned-due-to-suspicious-activity/));
- market data and content are licensed for display-only personal or internal use, while non-display
  machine processing, products based on the content, and redistribution are prohibited absent a
  separate agreement
  ([Terms section 3](https://www.tradingview.com/policies/));
- TradingView's documented charting library supplies no market data and expects the integrator to
  connect its own or a third-party source
  ([official datafeed documentation](https://www.tradingview.com/charting-library-docs/latest/connecting_data/)).

Observatory's scheduled ingestion, automated analysis, durable Bar History, and public derived
product sit directly inside the activities those rules restrict. Authentication with a paid user
session does not change that conclusion.

## Ideas to carry forward

| Timing    | Idea                                                                                                                                                                                                       | Observatory destination                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Now**   | Keep provider protocol, normalized market facts, and domain analysis as separate stages with fixture-backed contracts                                                                                      | Foreign-history provider evaluation and Effect migration |
| **Now**   | Record provider capability metadata during source evaluation—timezone, session rules, adjustment, price scale, available resolutions, and history depth—without putting transient source policy in Catalog | Provider research note / adapter canary                  |
| **Now**   | Preserve Bar History's explicit completion, provenance, validation, and reconciliation requirements; a timestamp upsert alone is not history finality                                                      | Bar History boundary                                     |
| **Later** | Run one managed realtime connection per process, route by logical subscription ID, share identical subscriptions, and release them automatically                                                           | Licensed intraday capability using Effect Scope/Layer    |
| **Later** | Define subscription identity from Trading Line, interval, session, and currency; add bounded queues, pacing, timeout, reconnect/backoff, session restoration, and stale-stream events                      | Realtime provider contract                               |
| **Later** | Build a reviewed catalog-import assistant that proposes provider symbols and metadata but never writes runtime identity automatically                                                                      | Instrument Catalog tooling                               |
| **Later** | Give long research runs declared inputs, deterministic run identity, progress/completion events, and isolated concurrency while retaining Observatory's hypothesis and holdout rules                       | TypeScript research runner                               |
| **No**    | TradingView-API as dependency/provider; user-cookie authentication; TradingView-computed indicators or recommendation scores; automated parameter mining; chat/drawings/trading-bot scope                  | Outside Observatory                                      |

## Open questions

1. Which licensed provider can supply long foreign-underlying daily history with explicit rights to
   persist it and publish derived observations?
2. During the Effect migration, should the representative vertical slice include only the current
   scheduled Bar History update, or also a small fake realtime stream so managed resource cleanup
   and backpressure are tested before intraday work begins?
3. Does Instrument Catalog need a separate reviewed provider-mapping file when the first foreign
   source is chosen, or is application configuration sufficient for the initial universe?
4. When the TypeScript research capability begins, which parts of the Swift evaluation contract
   should be ported first: replay equivalence, hypothesis execution, or the structured run record?
