# Design

## Serving the prerendered pages: Railpack's SPA mode

Railpack serves a statically built Node project with Caddy when it detects a static framework, and `RAILPACK_SPA_OUTPUT_DIR` forces that mode for one it does not detect. It does not detect this app: its Vite detection excludes TanStack Start, which it deploys with a server. The `web` service sets `RAILPACK_SPA_OUTPUT_DIR=dist/client` and no start command (a custom start command turns the mode off), so Railpack runs the build and starts Caddy on `dist/client`. No dependency and no server code are added.

Railpack's Caddyfile resolves a request with `try_files {path} {path}.html {path}/index.html`, and the build writes `dist/client/lines/<tradingLineId>/index.html`, so `/lines/<tradingLineId>` serves its prerendered page and `/` serves `index.html`. In SPA mode the Caddyfile also falls back to `/index.html` for any other path, which would answer a line the snapshot does not have with the home page and status 200. A root `Staticfile` with `index_fallback: false`, which Railpack honors for Node SPA deploys, turns that off, so such a path answers 404. Railpack picks its Node provider before its Staticfile provider, so the file changes only this option. The Caddyfile also answers `/health` with 200.

- https://docs.railway.com/builds/railpack
- https://railpack.com/languages/node (static sites, `RAILPACK_SPA_OUTPUT_DIR`, custom start command, `index_fallback`)
- https://railpack.com/languages/staticfile (`Staticfile`)
- https://github.com/railwayapp/railpack/blob/main/core/providers/node/Caddyfile.template
- https://github.com/railwayapp/railpack/blob/main/core/providers/node/vite.go (TanStack Start is not a static Vite site)

## Build-time bucket access

Railway makes service variables available during Railpack builds, so the `web` service gets the same `ref(historyBars, ...)` storage variables as `analysis-run`, plus `OBSERVATORY_STORAGE_VIRTUAL_HOSTED_STYLE=false`. The build reads them through `vite.config.ts`'s `loadEnv`, where process variables win over `.env`. Only the build reads them: Caddy serves files and never touches the bucket, and the client bundle has no storage configuration.

- https://docs.railway.com/guides/frontend-environment-variables#build-time-vs-runtime
- https://docs.railway.com/guides/tanstack-start#environment-variables

## Watch paths

Railway's watch paths are gitignore-style patterns matched from the repository root; a commit that changes no matching file creates no deployment. Each service watches what its build or start command reads:

- `web`: `src/web`, `src/analysis` (the snapshot schema and storage), `src/server/bar-history-storage-configuration` (the build resolves the bucket with it), `vite.config.ts`, `Staticfile`, `package.json`, `bun.lock` and `tsconfig.json`.
- `analysis-run`: `src/analysis`, `src/server`, `package.json`, `bun.lock` and `tsconfig.json`.

Both exclude `*.test.ts` files, which neither build nor run reads. `openspec/`, `docs/` and `.railway/` deploy nothing: `railway config apply` applies IaC changes itself. A change to `src/analysis`, `package.json` or `bun.lock` deploys both, which is what it can change.

- https://docs.railway.com/builds/build-configuration#configure-watch-paths

## Redeploying after a run: `serviceInstanceDeployV2`

After a successful bucket write, the Analysis Run calls the Public API's `serviceInstanceDeployV2(serviceId, environmentId)`, which starts a new deployment, with a new build, of the commit the `web` service already deploys. The build then reads the new `latest.json`. A failed build leaves the previous deployment serving.

The credential is a project token, scoped to one environment of one project, sent in the `Project-Access-Token` header. It is the narrowest token that can deploy, and Lean sets it by hand in `OBSERVATORY_RAILWAY_TOKEN`; the IaC declares it with `preserve()` so `railway config apply` keeps the value set in Railway. The service and environment IDs are reference variables to the `web` service's `RAILWAY_SERVICE_ID` and `RAILWAY_ENVIRONMENT_ID`, so no ID is written in the repository.

The request has a 20-second timeout and no retry. The Public API advises retrying a mutation only when no response arrived, the next run deploys again, and a deploy can be started by hand. Railway's GraphQL API reports failures, including authorization failures, as an `errors` array in an HTTP 200 response, so the response body decides success, not the status.

A dry run with `--output` writes no snapshot to the bucket and does not redeploy. A request that fails, or a missing variable, logs a warning and leaves the run's outcome and exit status as they are: the snapshot is written, and the page build reads it whenever the service next deploys.

- https://docs.railway.com/integrations/api (endpoint, project tokens, errors, retries)
- https://docs.railway.com/integrations/api/manage-services#deploy-a-service
- https://docs.railway.com/variables/reference (reference variables, `RAILWAY_SERVICE_ID`, `RAILWAY_ENVIRONMENT_ID`)
- https://docs.railway.com/infrastructure-as-code/reference (service variable references, `preserve()`)

## Domain

Railway IaC does not declare generated service domains, so Lean generates the `web` service's Railway domain by hand.

- https://docs.railway.com/infrastructure-as-code/reference#custom-domains
