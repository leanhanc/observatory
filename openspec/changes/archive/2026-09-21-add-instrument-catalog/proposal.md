## Why

Observatory needs one authoritative answer for which Instruments and Trading Lines it recognizes before scheduled market-data work and later analysis capabilities can request the correct histories. The initial catalog is small and curated through Git, so it can remain inspectable and deploy with the code that validates it.

## What Changes

- Add a versioned Instrument Catalog containing stock and CEDEAR Instruments with their Trading Lines embedded.
- Let a CEDEAR reference the distinct stock Instrument whose economic value it represents.
- Validate the complete catalog before exposing any entry, including record shape, identifiers, Trading Line uniqueness, and CEDEAR-underlying relationships.
- Expose read-only catalog operations for listing Instruments and resolving Instrument or Trading Line identifiers without allowing consumers to import the stored JSON directly.
- Add a minimal initial catalog containing Galicia and YPF stocks, Apple stock, and the Apple CEDEAR.
- Keep provider selection, provider mappings, analysis Trading Line selection, CEDEAR ratios, level translation, country, display names, and settlement variants outside this change.

## Capabilities

### New Capabilities

- `instrument-catalog`: Validates and exposes Observatory's curated Instruments, embedded Trading Lines, and CEDEAR-to-Underlying-Instrument relationships.

### Modified Capabilities

None.

## Impact

- Adds the `src/modules/instrument-catalog` domain module and its versioned repository data.
- Uses the existing Valibot dependency for runtime schema validation and inferred TypeScript types.
- Gives scheduled Bar History orchestration a catalog interface for resolving explicitly configured Trading Line IDs; Bar History behavior and stored histories remain unchanged.
- Extends `CONTEXT.md` with the settled Instrument Catalog language and records the replaceable JSON implementation decision in this change's design.
