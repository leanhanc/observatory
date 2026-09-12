# Effect as Observatory's application architecture

**Research date:** 2026-09-12  
**Decision target:** Effect 4 RC on Bun, with TanStack Start and Railway  
**Status:** Recommendation for a bounded architecture prototype; not yet an adoption decision

## Executive conclusion

Effect is a strong architectural match for the part of Observatory that talks to the outside
world: market-data providers, storage, configuration, clocks, logging, scheduled jobs, and later
HTTP requests. Those are precisely the places where Observatory needs to know what can fail, retry
only failures that are actually temporary, limit parallel work, clean up resources, and explain
what happened in production.

The previous Effect experiment did not test that proposition. It wrapped the Bar History updater
in an Effect and used bounded concurrency, but kept manual dependency injection, ordinary Promise
failures, the existing logger interface, and result unions. That proved Effect can sit around the
application. It did not prove that Effect can simplify the application.

The recommended direction is therefore:

> **Adopt Effect as the server-side application and infrastructure model, while keeping pure market
> and technical-analysis logic as ordinary TypeScript.**

This is a real commitment, but not a blanket rewrite. An Observatory capability should expose pure
functions for calculations and Effect programs for operations. The application should have one
Effect runtime at each process boundary: the scheduled analysis job, the web server, and developer
commands. Services and Layers should compose dependencies. Expected operational failures should
occupy Effect's typed error channel. Defects should remain defects. Concurrency, retries, timeouts,
configuration, and observability should use Effect rather than parallel home-grown mechanisms.

Before accepting that architecture, build one representative vertical slice on a throwaway branch:

```text
Instrument Catalog
        ↓
Bar History update for several Trading Lines
        ↓
provider fetch → validation → reconciliation → bucket write
        ↓
structured report + logs + spans + process exit
```

The slice must use services and Layers, typed operational errors, a retry policy, bounded and
correctly partitioned concurrency, Effect configuration, test services, and a Bun runtime. If that
version is easier to understand and test than today's version, Observatory should adopt Effect 4.
If it only produces more syntax around the same design, it should not.

There is one material timing risk: Effect 4 is currently a release candidate, not the stable
release. Its own repository and installation guide say so, and the current source package reports
`4.0.0-rc.115`.[1][2] Observatory is early enough to absorb that risk, but it should pin exact Effect
versions and upgrade deliberately rather than floating across RC releases.

## The architectural question

The choice is not between "Promises" and "Effects." Promises are only one small part of the issue.
The real question is whether Observatory wants one shared model for these concerns:

- what an operation succeeds with;
- which expected failures callers must consider;
- which services an operation requires;
- how services are constructed and replaced in tests;
- how concurrent work is started, limited, cancelled, and awaited;
- how temporary failures are retried and slow work is timed out;
- how resources are released;
- how configuration and secrets are loaded;
- how logs, metrics, and traces describe one run.

Effect's central type records the first three directly:

```ts
Effect<Success, Error, Requirements>;
```

The official documentation describes an Effect as a lazy program description whose type carries
its success value, expected error, and required services.[3] Layers then construct and connect the
services without leaking their construction dependencies into service interfaces.[4] This is a
larger change than importing a concurrency helper. It gives Observatory a single composition model
for its server-side program.

That model is attractive because Observatory is a pipeline application. It will repeatedly read a
catalog, acquire many histories, reconcile and persist them, analyze them, assemble a daily
snapshot, and serve the result. Most of the difficult code will be at the boundaries between those
steps, not inside an EMA or RSI calculation.

## What “all in” should mean

For Observatory, going all in on Effect should mean all five rules below.

### 1. Effect owns operations; pure functions stay pure

Any operation that reads time, configuration, storage, the network, or another mutable external
system should return an Effect. Any calculation whose answer depends only on its arguments should
remain a normal function.

```text
Pure TypeScript                         Effect program
────────────────────────────────────   ────────────────────────────────────
validate a Daily Bar relationship      fetch a provider response
calculate EMA / RSI / ATR              read or write a Bar History
reconcile old and fetched bars         load deployment configuration
classify market structure              update several Trading Lines
translate an underlying level          run the daily analysis job
format an explanation                  serve a snapshot to a request
```

This boundary matters. Putting pure calculations inside `Effect.succeed` would add vocabulary
without adding safety. Keeping them ordinary also protects the analysis engine from TanStack Start,
Railway, and Effect itself.

### 2. Capabilities are Effect services

The core server-side capabilities should be services with narrow interfaces. A plausible first
dependency graph is:

```text
ApplicationConfig      ObservatoryLogger      Clock
         │                    │                 │
         ├──────────┬─────────┘                 │
         │          │                           │
MarketDataSource  BarHistoryStorage             │
         │          │                           │
         └──────┬───┴───────────────────────────┘
                │
         BarHistoryUpdater
                │
         DailyAnalysisRunner
```

The public operations of a service should not require the services used to build it. Effect's Layer
guidance explicitly recommends keeping service methods free of construction requirements and
providing those requirements while constructing the Layer.[4]

This improves on today's factories without discarding the good part of their design. The current
`BarHistoryStorage` and updater interfaces are already small and testable. They can become service
interfaces; the S3 client, provider fetch function, pause function, clock, and logger move into Live
and Test Layers instead of a growing factory-options object.

### 3. Expected failures are typed; broken invariants are defects

Effect distinguishes expected failures from unexpected errors. Expected failures are visible in
the error type and can be handled selectively; defects represent bugs or violated invariants and
remain available in the runtime's full failure cause.[5]

Observatory can use that distinction more precisely than a single large result union:

| Kind                       | Examples                                        | Treatment                                                  |
| -------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| Invalid caller input       | malformed date, duplicate Trading Line          | typed failure; return or report it                         |
| Provider rejection         | invalid payload, no authorized data window      | typed failure; do not retry unless classified temporary    |
| Temporary provider failure | timeout, selected 429/5xx responses             | typed failure; bounded retry with backoff and jitter       |
| Storage failure            | read/write unavailable                          | typed failure; policy depends on operation                 |
| Domain refusal             | correction would violate Bar History invariants | typed failure with domain evidence                         |
| Impossible internal state  | missing result after a proven complete map      | defect; report and stop that fiber                         |
| Programmer error           | thrown exception in pure logic                  | defect; do not disguise it as a recoverable provider error |

The error model should not create one class per sentence. A small tagged family should carry useful
facts such as Trading Line ID, operation, provider, retryability, and validation issues. Human
messages should be created at the reporting boundary, not used as the program's identity for an
error.

The existing per-line result is still valuable. Updating one bad Trading Line should not erase
successful work for all other lines. The outer program may succeed with a batch report containing
line-level successes and failures, while startup/configuration failures remain in the Effect error
channel. Effect is not a reason to turn normal partial batch outcomes into exceptions.

### 4. One runtime per process boundary

Effect programs should be executed at the edge, not throughout the codebase. The official runtime
documentation presents the runtime as the component that supplies requirements, executes fibers,
handles failures and cleanup, and produces an Exit.[6]

Observatory will likely have three edges:

- a short-lived Railway scheduled job;
- the long-lived TanStack Start server;
- local commands and maintenance scripts.

For a short-lived Bun job, `BunRuntime.runMain` is the natural edge because the platform runtime
handles signals, finalization, error reporting, and exit codes.[7] For the web process, construct a
reusable managed runtime once when the server starts, use it from server handlers, and dispose it
when the process stops. Do not build the full Layer graph on every request.

### 5. Effect policies replace parallel home-grown policies

Once adopted, Effect should own operational retries, timeouts, concurrency limits, cancellation,
configuration, and tracing. Keeping a second custom framework for the same concerns would leave the
team paying Effect's learning cost without receiving its consistency.

This does not mean deleting every existing library. Pino and Valibot can remain behind Effect
boundaries while they continue to provide clear value.

## Dependency injection and Layers

Effect's service requirement is more useful than conventional dependency injection when the type
of the program shows the capabilities it still needs. Layers are recipes that construct those
services and can themselves require other services or fail.[4]

For Observatory, Layers should be composed at application roots, not scattered through business
logic. A concrete arrangement could be:

```text
src/
  applications/
    daily-analysis/
      daily-analysis.ts          # Effect program
      daily-analysis.runtime.ts  # Live Layer graph + Bun entry
    web/
      observatory.runtime.ts     # reusable managed runtime
  modules/
    bar-history/
      ... pure domain and public capability
      bar-history.service.ts
      bar-history.layer.ts
    instrument-catalog/
      ... pure catalog and optional service wrapper
    logger/
      ... Pino implementation and Effect logger layer
```

This is illustrative, not a folder mandate. The important rule is ownership: each capability owns
its service contract and implementation Layer; each application owns the final graph and runtime.

Avoid a generic `AppContext` service containing everything. That would hide requirements again and
make every test provide unrelated machinery. Also avoid making every tiny helper a service. A
service represents a replaceable capability or external boundary, not merely a function with a
name.

The Instrument Catalog is an interesting edge case. Its validation and lookup behavior should stay
pure. If the deployed catalog later comes from storage or a database, the loading operation can be
an Effect service while the constructed catalog remains the same plain object.

## Error handling and recovery

The biggest immediate improvement over the removed spike would come from using `Effect.tryPromise`
to translate known rejection shapes into tagged failures. `Effect.promise` assumes rejection is a
defect; it is therefore the wrong constructor for ordinary network and storage failures that the
application intends to classify and handle.

Recovery should be attached where the policy is understood:

- the Open BYMADATA Layer knows which HTTP failures may be temporary;
- the Bar History updater knows whether a failed line can coexist with successful lines;
- the scheduled application knows whether the final run should exit unsuccessfully;
- the HTTP edge knows which public response is safe to expose.

Effect retries typed failures and does not retry defects or interruptions. Its retry API can select
errors and combine retry counts with schedules, backoff, and jitter.[8] This matches Observatory's
need to retry a temporary provider outage without retrying malformed market data or a violated bar
invariant.

A proposed initial provider policy is:

```text
connectivity error / timeout / 429 / selected 5xx
  → retry at most 3 times
  → exponential backoff with jitter
  → retain provider and Trading Line context in logs/spans

invalid JSON / unexpected payload / invalid Daily Bar
  → do not retry
  → report an evidence-rich line failure
```

The exact status list belongs in the provider OpenSpec before implementation. Effect supplies the
mechanism, not the product decision.

Timeouts should interrupt the underlying Effect. Effect's timeout operators do that and preserve
the original failure when it arrives first.[9] Provider adapters must use interruption-aware APIs;
wrapping a Promise that cannot be cancelled may return control while the underlying work continues.

## Concurrency and race conditions

Effect's concurrency is structured around fibers. Concurrent child work remains attached to a
parent lifecycle, and losing work in a race is interrupted.[10] That is materially safer than
creating untracked Promises, especially once the daily pipeline has several concurrent phases.

It does not automatically prevent all race conditions. Observatory still has to decide which work
may overlap and which shared facts require serialization.

There are at least three different limits in Bar History:

1. **Provider pacing.** Open BYMADATA historical requests are intentionally spaced because the
   anonymous limit is undocumented. This may need a one-permit semaphore or a rate-aware queue,
   independent of total batch concurrency.
2. **Trading Line parallelism.** Different lines can usually be prepared and reconciled in parallel,
   within a configured upper bound.
3. **Storage identity exclusion.** Two fibers must not concurrently replace the same Trading Line's
   history from the same process. A one-permit semaphore keyed by Trading Line can protect the
   read–reconcile–write critical section.

Effect supports explicit concurrency limits on collection operations and semaphores that release
permits automatically when work completes.[10][11] Those mechanisms make the policy visible, but
they protect only one process. Railway already skips a scheduled execution when the previous
execution of that same cron service is still active.[12] That reduces overlap for one configured
job, but it is not a distributed lock across manual commands, multiple services, or replicas.

For v1, the simplest safe deployment is one writer job and read-only web instances. If Observatory
later has multiple writers, storage needs conditional writes/version checks or a real distributed
coordination mechanism. Effect cannot manufacture cross-process atomicity around an S3-compatible
object store.

`Ref` can safely coordinate in-memory state across fibers, but it should not become a shadow
database.[13] Persistent market state belongs in Bar History and snapshots.

## Resource safety

Effect guarantees that registered finalizers run when a scoped resource completes, fails, or is
interrupted. Its resource APIs pair acquisition with release.[14] This becomes valuable when
Observatory adds database pools, streaming responses, file handles, telemetry exporters, or other
resources with a lifecycle.

The current Bun S3 client and ordinary `fetch` do not require a manually closed connection per
operation, so Effect's resource system does not immediately simplify those two calls. It will still
matter at the process level:

- flush buffered logs and telemetry before a Railway job exits;
- close future database or HTTP client pools;
- terminate background fibers when the web server shuts down;
- release test resources even when an assertion fails.

This is a reason to adopt the Bun platform runtime, not merely core Effect. The official platform
package provides Bun-specific services and `BunRuntime.runMain`.[7]

## Configuration and secrets

Effect separates the description and validation of configuration from the source that supplies
it. Its default provider reads environment variables, tests can supply an in-memory provider, and
sensitive strings can be represented as redacted values.[15]

That fits Railway well. A single `ObservatoryConfig` can describe:

- bucket endpoint, region, bucket name, key ID, and secret;
- provider base URLs and timeouts;
- provider pacing and batch concurrency;
- log level and environment;
- reconciliation windows;
- telemetry endpoint when one exists.

The configuration should be loaded once while constructing Live Layers. A missing secret or invalid
concurrency value should fail startup before any market update begins. Tests should build the same
config shape from an in-memory provider rather than mutating global environment variables.

If Alchemy is later adopted, its Railway integration already models environment values and
`Config.redacted`; it can provision Railway resources and wire typed outputs into services.[16]
That alignment is real, but Alchemy should remain a separate infrastructure decision.

## Logging, metrics, and traces

Observatory already has a useful Pino logger: structured JSON in production, readable local output,
and secret redaction. Adopting Effect should not discard it merely to make the dependency list look
purer.

The first prototype should install a custom Effect Logger backed by the existing Pino behavior.
Application code then uses Effect logging, annotations, and spans instead of receiving a hand-made
logger argument. Effect logging supports custom loggers, per-effect levels, annotations, and spans;
its tracing can export through OpenTelemetry.[17][18]

A daily run should produce a connected story:

```text
daily-analysis run
  ├─ catalog.load
  ├─ bar-history.update [trading-line-id=...]
  │    ├─ storage.read
  │    ├─ provider.fetch [attempt=...]
  │    ├─ history.reconcile [corrections=...]
  │    └─ storage.write
  ├─ analysis.compute
  └─ snapshot.store
```

Logs remain the first production tool. Traces should initially be created in code but need not be
exported to a paid backend until their operational value is demonstrated. Metrics such as updated
lines, failed lines, provider latency, correction count, and total run duration can follow. Effect
has native metrics, but adding metrics without somewhere useful to inspect them would be ceremony.

## Valibot versus Effect Schema

Effect 4 includes a broad Schema system and can use schemas in configuration. Observatory already
uses Valibot successfully for stored JSON and catalog validation. Replacing it during the first
Effect adoption would combine two migrations and make the result harder to judge.

Recommendation:

> Keep Valibot as the domain and persistence validator during the first Effect architecture slice.
> Translate Valibot validation failures into typed Effect failures at operational boundaries.

This preserves a known runtime contract and isolates the architecture experiment. Valibot exposes
Standard Schema compatibility,[19] while Effect Schema also exposes a Standard Schema adapter.[20]
That common interface may help framework validators, but it does not make their richer APIs
interchangeable.

Reconsider Effect Schema only after the architecture is accepted, and only if Observatory has a
specific benefit such as one declaration supporting decoding, encoding, branded domain values,
configuration, JSON Schema, and HTTP contracts. Do not maintain duplicate schemas for the same
stored object.

## TanStack Start integration

TanStack Start should remain the web and HTTP boundary. Its own description says the framework does
not replace the application's model: it adds SSR, server functions, routes, middleware, and the
server layer around the application.[21] That is compatible with Effect owning Observatory's
application model.

The integration should look like this:

```text
TanStack Start server function / server route
        ↓ validate public request and authorize if needed
Effect managed runtime
        ↓ run one application program
Observatory services and domain logic
        ↓
safe response DTO
```

Do not expose raw Effect types to React components. Do not run the analysis engine in browser route
loaders. A Start server function should be a thin translator from HTTP/framework input to an Effect
program and from its Exit or typed failure to a safe response.

The managed runtime should be created once for the server process. Creating the Layer graph inside
every server function would repeatedly initialize resources and erase Layer memoization benefits.
The exact hook for startup and disposal should be proven in the representative route prototype,
because TanStack Start itself is currently an RC and its Bun deployment path is still evolving.
Official hosting guidance supports Bun, with a Nitro Bun preset or a custom Bun server depending on
the build shape.[22]

Observatory's scheduled market update should remain a separate Railway job rather than being
triggered by a web request. Railway cron services are expected to finish and exit, run on UTC, and
skip a new execution while the previous one is still active.[12] Effect's `runMain` lifecycle fits
that process shape well.

## Alchemy's role

Alchemy is not needed to use Effect. It is an Effect-based infrastructure-as-code system that can
declare, diff, and deploy resources, and its “Infrastructure as Effects” model can bind resources
to Effect programs.[23] Its Railway provider models services, volumes, buckets, variables, cron
functions, and TanStack Start websites.[16]

The upside for a fully Effect-based Observatory is conceptual continuity:

- application dependencies are Layers;
- infrastructure providers are Layers;
- secrets use redacted values;
- Railway resources and their outputs are typed;
- a TanStack Start site can be deployed to Railway from the same TypeScript stack.[24]

The downside is coupling two young moving surfaces: Effect 4 is an RC, and Alchemy is developing
rapidly. Adopting both at the same moment would make failures harder to attribute and would widen
the first learning task from application architecture to deployment state management.

Sequence them:

1. prove Effect inside the existing local and Railway deployment model;
2. build the actual TanStack Start application boundary;
3. reproduce the working deployment with Alchemy on a non-production stage;
4. adopt Alchemy only if it removes meaningful manual Railway configuration.

Alchemy should describe infrastructure. It should not be allowed to reshape Instrument Catalog,
Bar History, analysis, or product concepts.

## Testing model

Effect can improve integration-style tests without replacing today's pure unit tests.

Keep Bun tests for pure calculations and validation. For Effect services:

- provide in-memory Test Layers for catalog, storage, provider responses, configuration, and logs;
- use Effect's TestClock for retry delays, timeouts, and scheduled behavior instead of waiting in
  real time; the official TestClock can advance virtual time deterministically.[25]
- assert typed failures by tag and facts, not formatted message text;
- test Layer construction failures separately from service-operation failures;
- keep a small live Railway bucket test behind explicit credentials;
- test interruption and finalization for resources that require cleanup.

Test Layers should be boring values, not a mocking framework. A service whose test implementation
is difficult to create probably has an interface that is too broad.

## Performance expectations

Effect offers disciplined concurrency; it does not promise that Observatory's market analysis will
be faster merely because it uses fibers. The expensive work here is network latency, provider
pacing, parsing, storage, and eventually calculations across many histories.

Likely benefits:

- safely overlap independent Trading Lines up to explicit limits;
- cancel sibling or timed-out work predictably;
- avoid accidental unbounded `Promise.all` usage;
- measure phases with spans before optimizing;
- batch or stream later if evidence shows memory pressure.

Likely costs:

- more runtime and type machinery than plain Promises;
- initial TypeScript language-server and compile-time pressure from large inferred types;
- developer learning time;
- operational surprises while Effect 4 remains an RC.

No performance decision should be based on community enthusiasm or microbenchmarks from a different
application. The prototype should measure cold start, full Bar History update duration, memory,
typecheck time, and bundle size against the current implementation. Provider pacing must remain the
same in both versions or the comparison will be meaningless.

## Costs and failure modes of adoption

### Vocabulary cost

Effect introduces Effects, Layers, services, fibers, Causes, Exits, scopes, schedules, and several
ways to transform each. This can make code more explicit, but unfamiliar code can also become
harder to scan. Observatory should adopt a small house style and forbid clever operator chains when
named steps would read better.

### Type-noise cost

An Effect signature can clearly reveal errors and requirements, but a large union of both becomes
its own form of opacity. Capability boundaries should narrow and translate errors. Application
programs should not expose every low-level S3 or HTTP detail forever.

### False-service cost

If every helper becomes a service, the graph becomes bureaucracy. Services should model external
boundaries, shared runtime capabilities, or replaceable application operations. Pure utilities stay
functions.

### Dual-model cost

The worst outcome would mix manual factories, Promise rejection, result unions, Effect errors,
Pino calls, Effect logs, ad hoc retries, and Effect schedules without a boundary rule. The adoption
must explicitly decide which model owns each concern.

### RC risk

Effect 4's core model is established, but names, module locations, and integrations may still change
before stable release.[1][2] Pin all Effect ecosystem packages to the exact same RC version, because
v4 packages are released together. Keep unstable `effect/unstable/*` modules out of core domain
code unless a capability cannot be built without them.

### Agent-generated-code risk

Effect's explicit types can help an agent see requirements and errors, but agents can also generate
valid-looking abstractions with the wrong recovery policy. OpenSpec still owns behavior. Code review
must focus on whether failures are classified correctly, whether retries are safe, and whether
concurrent writes preserve Bar History invariants.

## Proposed Observatory house rules

If the prototype succeeds, record these rules in project guidance:

1. Pure domain and TA functions do not return Effect.
2. Network, storage, time, configuration, and application orchestration do return Effect.
3. Run Effects only at application or framework edges.
4. Services model capabilities, not individual helper functions.
5. Service methods have no construction requirements; Layers own construction dependencies.
6. Expected operational failures are tagged and typed. Broken invariants are defects.
7. Retry only explicitly classified temporary failures.
8. Every concurrent collection states its concurrency policy.
9. Provider pacing and batch concurrency are separate policies.
10. Only one deployed capability writes a given Bar History in v1.
11. Effect logging is the application API; the installed logger may remain Pino-backed.
12. Valibot remains the persistence validator until a separate decision replaces it.
13. Exact Effect RC versions are pinned and upgraded together.
14. Experimental Effect modules require an explicit local reason.
15. OpenSpec defines behavior; Effect defines execution and composition.

## Prototype acceptance test

The prototype should be small enough to discard and complete enough to answer the architecture
question. It should not alter production data.

### Required implementation

- `MarketDataSource`, `BarHistoryStorage`, `ObservatoryLogger`, `ApplicationConfig`, and
  `BarHistoryUpdater` services;
- Live and Test Layers;
- tagged provider, storage, configuration, and validation failures;
- bounded multi-line updates;
- separate provider pacing protection;
- timeout plus selective retry for simulated temporary provider failures;
- Pino-backed Effect logging with run and Trading Line annotations;
- spans around read, fetch, reconcile, and write;
- Bun runtime entry with meaningful exit status;
- deterministic tests using TestClock;
- the same current Bar History behavioral tests and OpenSpec scenarios.

### Measurements

Record for the current and prototype versions:

- lines of application/infrastructure code changed;
- typecheck time;
- test time;
- cold-start time;
- one representative multi-line update duration with identical pacing;
- maximum observed memory;
- number of dependency parameters and factory options;
- number of places that classify retryable failures;
- ease of testing timeout, interruption, and cleanup.

### Acceptance questions

Adopt Effect only if the answers are mostly yes:

1. Can a reader identify a program's expected failures and dependencies from its signature?
2. Is the Live dependency graph easier to inspect than nested factories?
3. Are Test Layers simpler than today's options and stubs?
4. Is retry policy located next to the failure knowledge that justifies it?
5. Can we prove provider pacing and storage exclusion under concurrency?
6. Do interruption and process shutdown release every registered resource?
7. Do logs and spans explain one Trading Line's path through the update?
8. Does the code still read like Observatory rather than an Effect demonstration?
9. Is the compile/test/runtime overhead acceptable for a small public project?

## Recommendation and sequence

The research supports proceeding toward Effect, but the formal decision should be made after the
vertical slice rather than from documentation alone.

Recommended sequence:

1. **Keep `instrument-catalog` as the clean product branch.** It has no Effect dependency.
2. **Create an Effect architecture prototype from that baseline.** Do not write an OpenSpec for
   adopting a library; preserve and run the existing behavioral OpenSpecs.
3. **Use Bar History as the proving ground.** It already contains network, storage, validation,
   partial batch results, pacing, logging, corrections, and time—enough difficulty to reveal whether
   Effect helps.
4. **Compare rather than immediately replace.** Keep the current branch available and record the
   measurements and acceptance answers above.
5. **If accepted, write an ADR.** Define the Effect boundary and house rules before the web app
   expands.
6. **Build TanStack Start around one managed runtime.** Keep server functions thin.
7. **Evaluate Alchemy afterward on staging.** Treat it as deployment automation, not part of the
   domain architecture.

My present recommendation is **yes to an Effect-first server architecture, conditional on the
prototype**. Observatory has enough asynchronous boundaries and correctness-sensitive batch work to
benefit from Effect's complete model. It is also early enough to adopt it without a costly rewrite.
But using only `Effect.runPromise` and `Effect.forEach` would not justify the dependency or learning
cost. If Observatory adopts Effect, it should adopt the parts that change the design: services,
Layers, typed failures, structured concurrency, resource scopes, configuration, and observability.

## Sources

1. Effect, [official repository and Effect 4 release-candidate status](https://github.com/Effect-TS/effect).
2. Effect, [Installation](https://effect.website/docs/v4/getting-started/installation).
3. Effect, [The Effect Type](https://effect.website/docs/v4/getting-started/the-effect-type).
4. Effect, [Managing Layers](https://effect.website/docs/v4/requirements-management/layers).
5. Effect, [Two Types of Errors](https://effect.website/docs/v4/error-management/two-error-types).
6. Effect, [Runtime](https://effect.website/docs/v4/runtime).
7. Effect, [Effect Platform introduction and Bun runtime](https://effect.website/docs/v4/platform/introduction).
8. Effect, [Retrying](https://effect.website/docs/v4/error-management/retrying).
9. Effect, [Timing Out](https://effect.website/docs/v4/error-management/timing-out).
10. Effect, [Basic Concurrency](https://effect.website/docs/v4/concurrency/basic-concurrency).
11. Effect, [Semaphore](https://effect.website/docs/v4/concurrency/semaphore).
12. Railway, [Cron Jobs](https://docs.railway.com/cron-jobs).
13. Effect, [Ref](https://effect.website/docs/v4/state-management/ref).
14. Effect, [Resource Management](https://effect.website/docs/v4/resource-management/introduction).
15. Effect, [Configuration](https://effect.website/docs/v4/configuration).
16. Alchemy, [Railway provider](https://alchemy.run/railway/).
17. Effect, [Logging](https://effect.website/docs/v4/observability/logging).
18. Effect, [Tracing](https://effect.website/docs/v4/observability/tracing).
19. Valibot, [Standard Schema properties](https://valibot.dev/api/StandardProps/).
20. Effect, [Schema to Standard Schema](https://effect.website/docs/v4/schema/standard-schema).
21. TanStack, [TanStack Start overview](https://tanstack.com/start/latest).
22. TanStack, [TanStack Start hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting).
23. Alchemy, [What is Alchemy?](https://alchemy.run/what-is-alchemy/).
24. Alchemy, [TanStack Start on Railway](https://alchemy.run/railway/frontend/tanstack-start/).
25. Effect, [TestClock](https://effect.website/docs/v4/testing/testclock).
