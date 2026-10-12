# Design

## Price unit as one top-level literal

`priceUnit: 'mep-dollar'` is a string literal at the snapshot's top level, validated with a picklist of one value. Alternatives considered:

- A unit per value, such as `closePriceMepUsd`: repeats the same fact dozens of times per line and renames every price field.
- An object such as `{ currency: 'USD', rate: 'MEP' }`: more structure than one fixed value needs. When a second unit exists, the literal widens to a picklist and the page's label lookup gains an entry.

The web keeps a label lookup from unit to text (`mep-dollar` → `MEP dollars`), so the text a reader sees comes from the snapshot's value rather than from a hard-coded assumption.

## Distance from EMA(200) in percent, unrounded

The snapshot keeps the unrounded value, like every other State measurement, so a later consumer can compare or rank without a precision loss. The page formats it with the shared number format (at most two decimals) and a `%` sign.

A zero EMA(200) is treated as unavailable rather than dividing by zero. Validated Daily Bars have positive closes, so this is defensive, like the finite check on `priceRelativeToEmaInAtr`.

## Deploy order

The web build reads `analysis-snapshots/v6/latest.json` and fails without it, which keeps the previous deployment serving. After this change merges, the site cannot rebuild until a v6 run has written that object. The simplest safe order, with no fallback code:

1. Before pushing, run `bun run analyze` once locally against the production bucket. It writes under `v6/` and leaves `v5/` in place, so the deployed site is unaffected.
2. Push. The web service builds from the new v6 `latest.json`.

If the push happens first, the web build fails and the previous deployment keeps serving until the next scheduled Analysis Run writes a v6 snapshot and triggers a redeploy. That is also safe, only slower. A fallback that reads `v5/` was rejected: it would need a v5 schema in the reader and pages that render two shapes, to save at most one day.
