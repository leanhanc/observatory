# Deploy the web service at the run's commit

## Why

The web build reads `analysis-snapshots/v<schemaVersion>/latest.json`, where `schemaVersion` is the version its own code writes. A push that bumps the schema autodeploys `web` before any snapshot of the new version exists, so the build fails and Railway keeps the previous deployment serving. That part is fine.

The next Analysis Run writes the new snapshot and asks Railway to deploy `web` with `serviceInstanceDeployV2(serviceId, environmentId)`. Without a commit, Railway deploys "the commit currently associated with the service", the one its last successful deployment runs. That is the old code, which reads the old schema's `latest.json`, so the site stays on old code and old data until someone deploys the right commit by hand. This has happened three times.

The run knows which code produced the snapshot it just wrote: its own commit. Deploying `web` at that commit makes the web code and the snapshot schema match by construction.

## What Changes

- The run passes its own commit, `RAILWAY_GIT_COMMIT_SHA`, as `commitSha` to `serviceInstanceDeployV2`.
- Without `RAILWAY_GIT_COMMIT_SHA` (local runs, deploys not triggered from GitHub), the run requests the deploy without a commit, as before, and logs that the deploy is not pinned to a commit. The run does not fail: the snapshot is already written.
- The `web-redeploy-requested` log carries the commit, or `null` when the deploy is not pinned.
- `analysis-run` also watches every path `web` watches, in `.railway/railway.ts`.

### Why the cron must watch the web's paths

Railway deploys a service on a push only when the push touches its watch patterns. `analysis-run` did not watch `/src/web/**`, `/astro.config.ts`, `/Caddyfile` or the storage configuration the build reads, so a web-only push left the cron on an older commit. Deploying `web` at that commit would roll back the web change on every run until the next push that touched the cron's paths.

Watching the union keeps the cron's commit at or after the commit of every `web` deploy. The cron's build is a no-op, so the extra deploys cost nothing. `web` does not need the cron's paths: deploying `web` at a newer commit that only changes `src/server` rebuilds the same site.

The snapshot schema lives in `src/analysis`, which both services watch, so a schema bump always moves both.

### Alternatives considered

- **Deploy `web` at its newest deployment's commit, failed ones included.** It needs no config change, but adds a second query and depends on how Railway orders deployments.
- **Turn off `web` autodeploy so only the cron deploys it.** Web-only changes would wait for the next run, up to about three days over a weekend, and the cron would still need the web's paths.
- **Fall back to the previous schema prefix in the web build.** New web code would render a snapshot of the old shape.

## Capabilities

### Modified Capabilities

- `analysis-run`: the web redeploy is pinned to the run's commit.

## Impact

- `src/server/analysis-run/web-redeploy.ts` and its tests.
- `.railway/railway.ts`: `analysis-run` watch patterns. Applying it is a Railway config change (`railway config apply`), done by hand before this ships.
