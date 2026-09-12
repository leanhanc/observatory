## Context

See [proposal.md](./proposal.md) for motivation and [the Instrument Catalog specification](./specs/instrument-catalog/spec.md) for behavior. Bar History already stores and reads histories by opaque Trading Line ID, while its Open BYMADATA adapter currently receives only a Trading Line ID and base symbol. The application has no canonical source for those identifiers or for CEDEAR-to-Underlying-Instrument relationships.

The initial catalog has one Git-based writer, a small curated universe, and no runtime editing or query workload. Valibot is already available. ADR 0001 keeps CEDEAR analysis policy outside Bar History. This design records the replaceable repository-JSON decision because it does not meet the project's threshold for a separate hard-to-reverse ADR.

## Goals / Non-Goals

**Goals:**

- Present one small Instrument Catalog interface to every consumer.
- Validate stored shape and complete-catalog relationships before exposing any entry.
- Keep Instrument identities distinct from their embedded Trading Lines.
- Preserve stable opaque Trading Line IDs for Bar History and scheduled orchestration.
- Keep a later JSON-to-database migration local to the module implementation.

**Non-Goals:**

- Runtime catalog editing, automatic instrument discovery, a database, or multiple writers.
- Provider mappings, provider support declarations, or provider fallback.
- Selecting the Trading Line used for technical analysis.
- CEDEAR ratios, translated levels, display names, country metadata, or settlement variants.
- Changing Bar History behavior, its stored schema, or its Open BYMADATA adapter.
- Loading the complete Argentine stock or CEDEAR universe.

## Decisions

### 1. One versioned JSON value embeds Trading Lines in Instruments

The stored shape will be approximately:

```ts
type InstrumentCatalogV1 = Readonly<{
	schemaVersion: 1;
	instruments: readonly Instrument[];
}>;

type StockInstrument = Readonly<{
	id: string;
	type: 'stock';
	tradingLines: readonly TradingLine[];
}>;

type CedearInstrument = Readonly<{
	id: string;
	type: 'cedear';
	underlyingInstrumentId: string;
	tradingLines: readonly TradingLine[];
}>;

type TradingLine = Readonly<{
	id: string;
	symbol: string;
	exchange: 'BYMA' | 'NASDAQ';
	currency: 'ARS' | 'USD';
}>;
```

Trading Lines are embedded because they belong to one Instrument and the catalog has no independent editing or query workload. The only cross-Instrument reference is the relationship a CEDEAR necessarily has to its Underlying Instrument.

Separate top-level Instrument and Trading Line collections were rejected because they would introduce an `instrumentId` relationship and relational storage shape without helping the initial read patterns. Separate files were rejected because complete validation already requires loading the full small catalog.

### 2. Valibot owns runtime shape and TypeScript types

Strict Valibot schemas validate the complete stored value. Instrument types are a discriminated union on `type`, and non-empty array validation guarantees every Instrument owns at least one Trading Line. TypeScript types are inferred from the schemas rather than repeated by hand.

After shape validation, complete-value checks report duplicate Instrument IDs, globally duplicate Trading Line IDs, duplicate exchange-symbol-currency combinations, and invalid CEDEAR underlying references. Any issue rejects the complete catalog; validation never filters invalid records into a partial result.

Keeping manually maintained TypeScript types beside runtime validation was rejected because the two contracts could drift. Per-record-only validation was rejected because it cannot prove global identity or relationship invariants.

### 3. Identifiers are stable, readable, and opaque

Instrument and Trading Line IDs use lowercase kebab-case. Initial identifiers are:

```text
galicia-stock
galicia-stock-byma-ars
apple-stock
apple-stock-nasdaq-usd
apple-cedear
apple-cedear-byma-ars
```

Callers and the module never parse ID segments to recover `type`, `exchange`, or `currency`; the explicit fields remain authoritative. Trading Line IDs are globally unique because Bar History uses them as storage keys outside the containing Instrument.

Ticker-only identity was rejected because symbols can change and the same symbol can describe distinct Instruments or Trading Lines. Locally unique embedded IDs were rejected because Bar History must address a line without its containing Instrument.

### 4. The module validates once and exposes immutable indexed reads

The implementation imports the stored JSON internally, validates it as a complete value, deeply freezes the accepted value or returns defensive immutable copies, and builds private maps by Instrument ID and Trading Line ID. Invalid repository data fails catalog initialization with structured validation issues; no ready module exists over partial data.

The public interface is conceptually equivalent to:

```ts
type InstrumentCatalog = Readonly<{
	getInstruments(): readonly Instrument[];
	getInstrumentById(instrumentId: string): InstrumentLookupResult;
	getTradingLinesByIds(tradingLineIds: readonly string[]): TradingLineLookupResult;
}>;
```

Lookup failures use stable result unions rather than `undefined`. Batch Trading Line lookup rejects blank, duplicate, or missing IDs as one invalid resolution and never returns a partial set. An empty batch succeeds with an empty result. Other successful results preserve request order. Returned nested objects and arrays cannot mutate later reads.

Returning the parsed JSON directly was rejected because every consumer would repeat lookup and failure behavior. Adding searches by symbol, exchange, currency, or type was rejected until a consumer demonstrates those needs.

### 5. Git-owned JSON is an implementation, not a storage abstraction

The module reads the repository JSON directly behind its interface. Git is its only writer, so catalog changes are reviewed, versioned, and deployed with their schema and consuming code. The module will not introduce a storage interface or JSON adapter while only one implementation exists. If runtime writes, multiple writers, independently deployed catalog updates, or database-worthy queries appear, the internal implementation can change while callers retain the same Instrument Catalog interface. The validated JSON remains direct migration input.

Starting with a database was rejected because Git is the only writer and the complete catalog is loaded for validation and lookup. Adding a hypothetical adapter seam was rejected because nothing currently varies there.

### 6. Acquisition and analysis choices remain with their future callers

The catalog stores no provider mapping or analysis Trading Line selection. Scheduled orchestration will receive an explicit list of Trading Line IDs, resolve that exact list, choose its configured adapter, and transform each resolved line into the descriptor expected by Bar History. It must not infer provider support from `exchange` or request related lines automatically.

A future analysis-input capability will explicitly select the Trading Line that feeds technical analysis. It must not choose the first embedded line or silently fall back to another line. CEDEAR ratios and translated levels remain a separate future capability.

## Risks / Trade-offs

- **[Independent deployments can temporarily carry different catalog revisions]** → Deploy catalog consumers from the same reviewed revision until independently updated catalog data justifies shared runtime storage.
- **[Closed exchange and currency sets require a schema change to expand coverage]** → Treat a new exchange or currency as a deliberate supported-universe change with its own validation and tests.
- **[Readable IDs can tempt callers to parse them]** → Keep every represented fact explicit and add tests that resolve opaque IDs without reconstructing fields.
- **[Existing canary Bar Histories use earlier provisional identifiers]** → Do not silently alias or move them in this change; backfill histories under accepted catalog IDs when scheduled integration is enabled.
- **[A future database migration could leak into callers]** → Test behavior through the module interface, keep JSON imports private to its implementation, and retain the validated JSON as migration input.

## Migration Plan

1. Add the schema, complete-catalog validation, and lookup behavior without changing Bar History.
2. Add and validate the initial three-Instrument JSON catalog.
3. Expose the read-only module interface and verify no consumer imports the JSON directly.
4. In a later scheduled-orchestration change, configure explicit Trading Line IDs and backfill any required histories under the accepted catalog IDs.

Rollback removes the new module and catalog data. It does not alter or delete existing Bar History objects.
